"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import ImageUploader from "@/components/ImageUploader";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";
import BenefitChangeRequest from "./BenefitChangeRequest";

/* ═══════════════════════════════════════════════
   타입
═══════════════════════════════════════════════ */
interface RestaurantInfo {
  restaurant_id: number;
  name: string;
  description: string;
  phone_number: string;
  main_menu: string;
  url: string;
  address: string;
  category: string;
  s3_image_urls: string[];
  has_pin: boolean;
  pin_updated_at: string | null;
  promotion_text: string;
}

interface Category {
  code: string;
  label: string;
  icon_key: string;
  sort_order: number;
  aliases: string[];
}

interface CouponBenefit {
  id: number;
  coupon_type_code: string;
  coupon_type_title: string;
  benefit_json: Record<string, unknown>;
  title: string;
  subtitle: string;
  notes: string;
  sort_order: number;
  active: boolean;
  updated_at: string;
}

interface CouponType {
  id: number;
  code: string;
  title: string;
  benefit_json: Record<string, unknown>;
  valid_days: number;
}

interface StampThreshold {
  stamps: number;
  coupon_type_code: string;
}

interface StampRule {
  id: number;
  restaurant_id: number;
  rule_type: "THRESHOLD" | "VISIT";
  config_json: {
    thresholds?: StampThreshold[];
    cycle_target?: number;
    notes?: string;
  };
  active: boolean;
  updated_at: string;
}

/* ═══════════════════════════════════════════════
   헬퍼
═══════════════════════════════════════════════ */
const FIELD_META: {
  key: keyof RestaurantInfo;
  label: string;
  placeholder: string;
  multiline?: boolean;
  readOnly?: boolean;
  select?: boolean;
}[] = [
  { key: "name",         label: "식당명",             placeholder: "",                                             readOnly: true  },
  { key: "address",      label: "주소",                placeholder: "도로명 주소를 입력해주세요"                                 },
  { key: "category",     label: "업종",                placeholder: "",                                             select: true    },
  { key: "phone_number", label: "전화번호",             placeholder: "02-1234-5678"                                              },
  { key: "main_menu",    label: "대표 메뉴",            placeholder: "예: 돼지국밥, 수육"                                         },
  { key: "url",          label: "웹사이트 / 지도 링크", placeholder: "https://naver.me/..."                                      },
  { key: "description",  label: "식당 소개",            placeholder: "손님들에게 보여줄 식당 소개를 작성해주세요.", multiline: true },
  { key: "promotion_text", label: "프로모션 문구",       placeholder: "예: 오늘 하루 전 메뉴 10% 할인! (식당 상세 화면 식당명 아래 표시됩니다)", multiline: true },
];

function useRid() {
  const [rid, setRid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setRid(p.get("rid"));
  }, []);
  return rid;
}
function ridQ(rid: string | null) { return rid ? `?rid=${rid}` : ""; }

/**
 * 사장님께 보일 한 줄. **백엔드 원문을 그대로 보여 주지 않는다** —
 * 0924 리허설에서 "Given token not valid for any token type" 이 혜택 탭에 그대로 떴다.
 * 무슨 뜻인지 모르는 문장은 "고장났다"로만 읽히고, 사장님이 할 수 있는 일도 알려 주지 못한다.
 * 다만 **못 읽었다는 사실은 숨기지 않는다** — 빈 화면으로 위장하면 혜택이 없는 줄 안다.
 */
function friendlyError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  if (/token|credential|authenticat|로그인/i.test(msg)) return "로그인이 풀렸습니다. 다시 로그인해 주세요.";
  return "지금 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.";
}

function benefitLabel(bj: Record<string, unknown>): string {
  if (!bj || typeof bj !== "object" || Object.keys(bj).length === 0) return "";
  const { type, value, max } = bj as { type?: string; value?: number; max?: number };
  if (type === "fixed")   return `${(value ?? 0).toLocaleString()}원 할인`;
  if (type === "percent") return `${value}% 할인${max ? ` (최대 ${max.toLocaleString()}원)` : ""}`;
  return "";
}

/* ═══════════════════════════════════════════════
   PIN 변경 섹션
═══════════════════════════════════════════════ */
/**
 * 매장 PIN 바꾸기 (0925 고침).
 *
 * 예전에는 이 화면이 **현재 PIN 을 그대로 띄웠다.** 서버가 값을 내려 줬기 때문이다.
 * 이제 PIN 은 해시로 저장돼 우리도 못 읽는다 — 사장님이 직접 지금 번호를 넣어야 바꾼다.
 * 잊으셨으면 담당자가 새로 정해 드린다. 알려 드릴 방법은 이제 없다.
 */
function PinChangeSection({ hasPin, updatedAt, rid }: { hasPin: boolean; updatedAt: string | null; rid: string | null }) {
  const [currentPin, setCurrentPin] = useState("");
  const [open, setOpen]             = useState(false);
  const [newPin, setNewPin]         = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const [err, setErr]               = useState("");

  const handleChange = async () => {
    setErr("");
    if (hasPin && !currentPin)     { setErr("지금 쓰시는 PIN 을 넣어 주세요."); return; }
    if (!newPin || !confirmPin)    { setErr("모든 항목을 입력해주세요."); return; }
    if (newPin !== confirmPin)     { setErr("새 PIN이 일치하지 않습니다."); return; }
    if (!/^\d{4,}$/.test(newPin)) { setErr("PIN은 4자리 이상 숫자여야 합니다."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/auth/change-pin${ridQ(rid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasPin ? { current_pin: currentPin, new_pin: newPin } : { new_pin: newPin }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail ?? "저장에 실패했습니다."); return; }
      setSuccess(true);
      setNewPin(""); setConfirmPin(""); setCurrentPin("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 2000);
    } catch { setErr("오류가 발생했습니다."); }
    finally   { setLoading(false); }
  };

  const fields = [
    { label: hasPin ? "새 PIN" : "등록할 PIN",   value: newPin,     setter: setNewPin     },
    { label: hasPin ? "새 PIN 확인" : "PIN 확인", value: confirmPin, setter: setConfirmPin },
  ];

  return (
    <div className="mt-6">
      <button
        onClick={() => { setOpen((v) => !v); setErr(""); }}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-gray-100 rounded-2xl text-sm text-gray-600 font-medium transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🔐</span>
          <span>{hasPin ? "PIN 변경" : "PIN 등록"}</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-xs text-gray-400">
            {hasPin
              ? `지금 쓰시는 번호를 넣으셔야 바꿀 수 있습니다. 4자리 이상 숫자입니다${updatedAt ? ` · 마지막 변경 ${updatedAt.slice(0, 10)}` : ""}.`
              : "아직 등록된 PIN 이 없는 매장입니다. 새 PIN 을 등록합니다. 4자리 이상 숫자입니다."}
          </p>
          {hasPin && (
            <div>
              <label htmlFor="cur-pin" className="text-xs text-gray-500 mb-1 block">지금 쓰시는 PIN</label>
              <input
                id="cur-pin" type="password" inputMode="numeric" maxLength={8}
                value={currentPin}
                onChange={(e) => { setCurrentPin(e.target.value); setErr(""); }}
                placeholder="••••"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle tracking-widest"
              />
              {/* 예전에는 이 자리에 현재 번호가 그대로 떠 있었다. 이제 우리도 못 읽는다. */}
              <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                번호는 우주라이크도 볼 수 없습니다. 잊으셨으면 담당자에게 말씀해 주세요 — 새로 정해 드립니다.
              </p>
            </div>
          )}
          {fields.map(({ label, value, setter }) => (
            <div key={label}>
              <label className="text-xs text-gray-500 mb-1 block">{label}</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={value}
                onChange={(e) => { setter(e.target.value); setErr(""); }}
                placeholder="••••"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle tracking-widest"
              />
            </div>
          ))}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button
            onClick={handleChange}
            disabled={loading || success}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
              success
                ? "bg-green-500 text-white"
                : "bg-periwinkle text-white hover:bg-navy disabled:opacity-60"
            }`}
          >
            {success ? "✓ 저장되었습니다" : loading ? "저장 중..." : hasPin ? "PIN 변경" : "PIN 등록"}
          </button>
        </div>
      )}
    </div>
  );
}
/**
 * 쿠폰 혜택 — **확인만.** 바꾸는 건 신청해서 우리가 승인한다 (민열님 0924).
 *
 * 전에는 여기서 만들고 고치고 지우면 그 자리에서 앱에 반영됐다. 혜택은 손님에게 나가는
 * 약속이라, 바뀌는 순간 그날 온 손님이 아침에 본 것과 다른 걸 받는다.
 * 그래서 이 목록은 읽기만 하고, 바꾸는 길은 아래 신청 칸으로 하나만 남긴다.
 */
function CouponBenefitsViewOnly({ rid }: { rid: string | null }) {
  const [benefits, setBenefits] = useState<CouponBenefit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const rq = ridQ(rid);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr("");
      try {
        const res = await fetch(`/api/dashboard/coupon-benefits${rq}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d?.detail ?? "불러오기 실패");
        setBenefits(Array.isArray(d) ? d : []);
      } catch (e: unknown) { setErr(friendlyError(e)); }
      finally { setLoading(false); }
    })();
  }, [rq]);

  if (loading) return <div className="flex justify-center py-8"><Spinner size={16} /></div>;
  if (err)     return <p className="text-xs text-red-500">{err}</p>;

  if (benefits.length === 0) return (
    <div className="text-center py-8 bg-gray-50 rounded-2xl">
      <p className="text-sm text-gray-500">등록된 쿠폰 혜택이 없습니다.</p>
      <p className="text-xs text-gray-400 mt-1">아래에서 원하시는 혜택을 신청해 주세요.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {benefits.map((b) => (
        <div key={b.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${b.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-mono bg-periwinkle/10 text-periwinkle px-2 py-0.5 rounded-full">{b.coupon_type_code}</span>
            {b.active
              ? <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">활성</span>
              : <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>}
          </div>
          <p className="text-sm font-semibold text-gray-800">{b.title}</p>
          {b.subtitle && <p className="text-xs text-gray-500 mt-0.5">{b.subtitle}</p>}
          {b.notes && <p className="text-[10px] text-gray-400 mt-1 bg-gray-50 rounded-lg px-2 py-1">{b.notes}</p>}
          <p className="text-[10px] text-periwinkle mt-1">{benefitLabel(b.benefit_json)}</p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   스탬프 규칙 (확인 전용)
═══════════════════════════════════════════════ */
function StampRuleViewOnly({ rid }: { rid: string | null }) {
  const [rule, setRule]               = useState<StampRule | null>(null);
  const [couponTypes, setCouponTypes] = useState<CouponType[]>([]);
  const [benefits, setBenefits]       = useState<CouponBenefit[]>([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState("");
  const rq = ridQ(rid);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr("");
      try {
        const [rRes, tRes, bRes] = await Promise.all([
          fetch(`/api/dashboard/stamp-rule${rq}`),
          fetch(`/api/dashboard/coupon-types${rq}`),
          fetch(`/api/dashboard/coupon-benefits${rq}`),
        ]);
        const [rData, tData, bData] = await Promise.all([rRes.json(), tRes.json(), bRes.json()]);
        if (rRes.ok)            setRule(rData);
        else if (rRes.status !== 404) throw new Error(rData?.detail ?? "불러오기 실패");
        setCouponTypes(Array.isArray(tData) ? tData : []);
        setBenefits(Array.isArray(bData) ? bData : []);
      } catch (e: unknown) { setErr(friendlyError(e)); }
      finally { setLoading(false); }
    })();
  }, [rq]);

  if (loading) return <div className="flex justify-center py-8"><Spinner size={16} /></div>;
  if (err)     return <p className="text-xs text-red-500">{err}</p>;

  if (!rule) return (
    <div className="text-center py-8 bg-gray-50 rounded-2xl">
      <p className="text-sm text-gray-500">설정된 스탬프 규칙이 없습니다.</p>
      <p className="text-xs text-gray-400 mt-1">스탬프 규칙 설정은 우주라이크 팀에 문의해주세요.</p>
    </div>
  );

  const cfg = rule.config_json;
  const target = cfg.cycle_target ?? 10;
  const thresholds = cfg.thresholds ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className={`bg-white border rounded-2xl p-4 shadow-sm ${rule.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-800">스탬프 {target}개 만땅</span>
          {rule.active
            ? <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">활성</span>
            : <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Array.from({ length: target }).map((_, i) => {
            const isReward = thresholds.some((t) => t.stamps === i + 1);
            return (
              <div key={i} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${isReward ? "border-amber-400 bg-amber-400 text-white" : "border-periwinkle/30 text-periwinkle/50"}`}>
                {isReward ? "★" : i + 1}
              </div>
            );
          })}
        </div>
        {thresholds.length > 0 && (
          <div className="flex flex-col gap-1">
            {thresholds.map((t, i) => {
              const ct = couponTypes.find((c) => c.code === t.coupon_type_code);
              const benefit = benefits.find((b) => b.coupon_type_code === t.coupon_type_code);
              return (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold shrink-0 text-[10px]">{t.stamps}</span>
                  <span className="font-medium">{benefit?.title ?? ct?.title ?? t.coupon_type_code}</span>
                  {benefit && <span className="text-[10px] text-periwinkle ml-auto">{benefitLabel(benefit.benefit_json)}</span>}
                </div>
              );
            })}
          </div>
        )}
        {cfg.notes && <p className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-2 py-1 mt-2">{cfg.notes}</p>}
      </div>

      {/* 수정 불가 안내 */}
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3">
        <span className="text-sm shrink-0">ℹ️</span>
        <p className="text-xs text-amber-700 leading-relaxed">
          스탬프 규칙은 <span className="font-semibold">우주라이크 팀</span>에서 관리합니다.
          변경이 필요하시면 팀에 직접 문의해주세요.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   메인 페이지
═══════════════════════════════════════════════ */
export default function RestaurantPage() {
  const rid = useRid();
  const rq  = ridQ(rid ?? null);

  const [activeTab, setActiveTab] = useState<"info" | "coupon">("info");

  // ?tab=coupon URL 파라미터 읽기
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("tab") === "coupon") setActiveTab("coupon");
  }, []);

  const [info, setInfo]           = useState<RestaurantInfo | null>(null);
  const [draft, setDraft]         = useState<Partial<RestaurantInfo>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");
  const originalRef               = useRef<RestaurantInfo | null>(null);

  const ridReady = rid !== undefined;

  useEffect(() => {
    if (!ridReady) return;
    fetch(`/api/dashboard/restaurant${rq}`)
      .then((r) => r.json())
      .then((data) => {
        setInfo({ ...data, s3_image_urls: data.s3_image_urls ?? [] });
        originalRef.current = data;
        setDraft({ phone_number: data.phone_number, main_menu: data.main_menu, url: data.url, description: data.description, address: data.address, category: data.category, promotion_text: data.promotion_text });
      })
      .catch(() => setError("식당 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [ridReady, rq]);

  useEffect(() => {
    fetch("/api/dashboard/categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data?.categories) ? data.categories.filter((c: Category) => c.code !== "ALL") : []))
      .catch(() => setCategories([]));
  }, []);

  const isDirty =
    originalRef.current &&
    (draft.phone_number !== originalRef.current.phone_number ||
     draft.main_menu    !== originalRef.current.main_menu    ||
     draft.url          !== originalRef.current.url          ||
     draft.description  !== originalRef.current.description  ||
     draft.address      !== originalRef.current.address      ||
     draft.category     !== originalRef.current.category     ||
     draft.promotion_text !== originalRef.current.promotion_text);

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/dashboard/restaurant${rq}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: draft.phone_number, main_menu: draft.main_menu, url: draft.url, description: draft.description, address: draft.address, category: draft.category, promotion_text: draft.promotion_text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "저장에 실패했습니다."); return; }
      originalRef.current = { ...originalRef.current!, ...draft };
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setError("저장 중 오류가 발생했습니다."); }
    finally { setSaving(false); }
  };

  if (!ridReady || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-navy">식당 관리</h1>
      </div>

      {/* 탭 스위처 */}
      <div className="flex bg-gray-100 rounded-2xl p-1 mb-5">
        {([["info", "식당정보 수정"], ["coupon", "쿠폰 & 스탬프"]] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 탭 1: 식당 정보 ── */}
      {activeTab === "info" && (
        <>
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>
          )}

          <div className="flex flex-col gap-4">
            {FIELD_META.map(({ key, label, placeholder, multiline, readOnly, select }) => {
              const value = readOnly
                ? (info?.[key] ?? "")
                : (draft[key as keyof typeof draft] ?? "");
              return (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                    {label}
                    {readOnly && (
                      <span className="ml-2 text-[10px] font-normal text-gray-300 normal-case tracking-normal">
                        수정 불가 (관리자 문의)
                      </span>
                    )}
                  </label>
                  {select ? (
                    <select
                      value={value as string}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-periwinkle"
                    >
                      {value && !categories.some((c) => c.label === value) && (
                        <option value={value as string}>{value as string}</option>
                      )}
                      {categories.length === 0 && <option value="">불러오는 중...</option>}
                      {categories.map((c) => (
                        <option key={c.code} value={c.label}>{c.label}</option>
                      ))}
                    </select>
                  ) : multiline ? (
                    <textarea
                      rows={4}
                      value={value as string}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      placeholder={placeholder}
                      disabled={readOnly}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-periwinkle disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value as string}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      placeholder={placeholder}
                      disabled={readOnly}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all ${
                saved
                  ? "bg-green-500 text-white"
                  : isDirty
                  ? "bg-periwinkle text-white hover:bg-navy"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {saved ? "✓ 저장되었습니다" : saving ? "저장 중..." : "저장"}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">
              식당명 변경은{" "}
              <span className="text-gray-500 font-medium">우주라이크 팀</span>에 문의해주세요.
            </p>
          </div>

          {info && (
            <div className="mt-8">
              <label className="block text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                식당 사진
              </label>
              <ImageUploader
                restaurantId={info.restaurant_id}
                initialUrls={info.s3_image_urls}
                onSave={async (urls) => {
                  const res = await fetch(`/api/dashboard/restaurant${rq}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ s3_image_urls: urls }),
                  });
                  if (!res.ok) throw new Error("저장 실패");
                  setInfo((prev) => prev ? { ...prev, s3_image_urls: urls } : prev);
                }}
              />
            </div>
          )}

          <PinChangeSection hasPin={Boolean(info?.has_pin)} updatedAt={info?.pin_updated_at ?? null} rid={rid ?? null} />
        </>
      )}

      {/* ── 탭 2: 쿠폰 & 스탬프 ── */}
      {activeTab === "coupon" && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">쿠폰 혜택</h2>
              <span className="text-[10px] text-gray-400">앱에서 손님에게 발급되는 혜택</span>
            </div>
            <CouponBenefitsViewOnly rid={rid ?? null} />
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">혜택 변경 신청</h2>
              <span className="text-[10px] text-gray-400">우주라이크 확인 후 반영</span>
            </div>
            <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3">
              혜택은 손님에게 나가는 약속이라 바로 바뀌지 않습니다. 바꾸고 싶은 내용을 남겨 주시면
              우주라이크가 확인한 뒤 앱에 반영하고, 여기에 결과를 적어 드립니다.
            </p>
            <BenefitChangeRequest rid={rid ?? null} />
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">스탬프 규칙</h2>
              <span className="text-[10px] text-amber-500">확인만 가능</span>
            </div>
            <StampRuleViewOnly rid={rid ?? null} />
          </section>
        </div>
      )}
    </div>
  );
}
