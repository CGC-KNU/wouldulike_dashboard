"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import ImageUploader from "@/components/ImageUploader";

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
}[] = [
  { key: "name",         label: "식당명",             placeholder: "",                                             readOnly: true  },
  { key: "address",      label: "주소",                placeholder: "",                                             readOnly: true  },
  { key: "category",     label: "업종",                placeholder: "",                                             readOnly: true  },
  { key: "phone_number", label: "전화번호",             placeholder: "02-1234-5678"                                              },
  { key: "main_menu",    label: "대표 메뉴",            placeholder: "예: 돼지국밥, 수육"                                         },
  { key: "url",          label: "웹사이트 / 지도 링크", placeholder: "https://naver.me/..."                                      },
  { key: "description",  label: "식당 소개",            placeholder: "손님들에게 보여줄 식당 소개를 작성해주세요.", multiline: true },
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
function PinChangeSection() {
  const [open, setOpen]             = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin]         = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const [err, setErr]               = useState("");

  const handleChange = async () => {
    setErr("");
    if (!currentPin || !newPin || !confirmPin) { setErr("모든 항목을 입력해주세요."); return; }
    if (newPin !== confirmPin)                 { setErr("새 PIN이 일치하지 않습니다."); return; }
    if (!/^\d{4,}$/.test(newPin))             { setErr("PIN은 4자리 이상 숫자여야 합니다."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail ?? "변경에 실패했습니다."); return; }
      setSuccess(true);
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 2000);
    } catch { setErr("오류가 발생했습니다."); }
    finally   { setLoading(false); }
  };

  const fields = [
    { label: "현재 PIN", value: currentPin, setter: setCurrentPin },
    { label: "새 PIN",   value: newPin,     setter: setNewPin     },
    { label: "새 PIN 확인", value: confirmPin, setter: setConfirmPin },
  ];

  return (
    <div className="mt-6">
      <button
        onClick={() => { setOpen((v) => !v); setErr(""); }}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-gray-100 rounded-2xl text-sm text-gray-600 font-medium transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🔐</span>
          <span>PIN 변경</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-xs text-gray-400">로그인 PIN을 변경합니다. 4자리 이상 숫자만 사용 가능합니다.</p>
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
            {success ? "✓ 변경 완료" : loading ? "변경 중..." : "PIN 변경"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   쿠폰 혜택 폼
═══════════════════════════════════════════════ */
function BenefitForm({
  couponTypes, initial, onSave, onCancel,
}: {
  couponTypes: CouponType[];
  initial?: Partial<CouponBenefit>;
  onSave: (data: Omit<CouponBenefit, "id" | "updated_at" | "benefit_json" | "coupon_type_title">) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode]       = useState(initial?.coupon_type_code ?? "");
  const [title, setTitle]     = useState(initial?.title ?? "");
  const [sub, setSub]         = useState(initial?.subtitle ?? "");
  const [notes, setNotes]     = useState(initial?.notes ?? "");
  const [active, setActive]   = useState(initial?.active ?? true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const selectedCt = couponTypes.find((ct) => ct.code === code);

  const submit = async () => {
    if (!code)       { setErr("쿠폰 타입을 선택해주세요."); return; }
    if (!title.trim()) { setErr("제목을 입력해주세요."); return; }
    setSaving(true); setErr("");
    try {
      await onSave({ coupon_type_code: code, title, subtitle: sub, notes, sort_order: initial?.sort_order ?? 0, active });
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-periwinkle/5 border border-periwinkle/20 rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">쿠폰 타입 *</label>
        <select value={code} onChange={(e) => { setCode(e.target.value); const ct = couponTypes.find((c) => c.code === e.target.value); if (ct && !title) setTitle(ct.title); }} disabled={!!initial?.coupon_type_code} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40 bg-white disabled:bg-gray-50">
          <option value="">-- 선택 --</option>
          {couponTypes.map((ct) => <option key={ct.code} value={ct.code}>{ct.code} · {ct.title}</option>)}
        </select>
        {selectedCt && <p className="text-[10px] text-periwinkle mt-1">{benefitLabel(selectedCt.benefit_json)}</p>}
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">제목 *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 우주라이크 쿠폰 1,000원 할인" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">부제목</label>
        <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="예: 1인 이상 방문 시" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">사용 조건</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="예: 최소 주문 1만원 이상, 1인 1회 사용 가능" rows={2} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40 resize-none" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setActive((v) => !v)} className={`relative w-10 h-5 rounded-full transition-colors ${active ? "bg-periwinkle" : "bg-gray-200"}`}>
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
        <span className="text-xs text-gray-500">{active ? "활성" : "비활성"}</span>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="flex-1 py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 disabled:opacity-60">{saving ? "저장 중..." : "저장"}</button>
        <button onClick={onCancel} className="px-4 py-2.5 text-sm text-gray-400 rounded-xl hover:bg-gray-100">취소</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   쿠폰 혜택 섹션 (수정 가능)
═══════════════════════════════════════════════ */
function CouponBenefitsSection({ rid }: { rid: string | null }) {
  const [benefits, setBenefits]     = useState<CouponBenefit[]>([]);
  const [couponTypes, setCouponTypes] = useState<CouponType[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState("");
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const rq = ridQ(rid);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [bRes, tRes] = await Promise.all([
        fetch(`/api/dashboard/coupon-benefits${rq}`),
        fetch(`/api/dashboard/coupon-types${rq}`),
      ]);
      const [bData, tData] = await Promise.all([bRes.json(), tRes.json()]);
      if (!bRes.ok) throw new Error(bData?.detail ?? "불러오기 실패");
      setBenefits(Array.isArray(bData) ? bData : []);
      setCouponTypes(Array.isArray(tData) ? tData : []);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "불러오기 실패"); }
    finally { setLoading(false); }
  }, [rq]);

  useEffect(() => { load(); }, [load]);

  async function create(data: Omit<CouponBenefit, "id" | "updated_at" | "benefit_json" | "coupon_type_title">) {
    const res = await fetch(`/api/dashboard/coupon-benefits${rq}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, sort_order: benefits.length }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setBenefits((prev) => [...prev, d]); setShowForm(false);
  }

  async function patch(id: number, data: Omit<CouponBenefit, "id" | "updated_at" | "benefit_json" | "coupon_type_title">) {
    const res = await fetch(`/api/dashboard/coupon-benefits/${id}${rq}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "수정 실패");
    setBenefits((prev) => prev.map((b) => (b.id === id ? d : b))); setEditId(null);
  }

  async function remove(id: number) {
    if (!confirm("이 쿠폰 혜택을 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/coupon-benefits/${id}${rq}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) { setErr("삭제 실패"); return; }
    setBenefits((prev) => prev.filter((b) => b.id !== id));
  }

  async function toggleActive(b: CouponBenefit) {
    const res = await fetch(`/api/dashboard/coupon-benefits/${b.id}${rq}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !b.active }) });
    const d = await res.json();
    if (res.ok) setBenefits((prev) => prev.map((x) => (x.id === b.id ? d : x)));
  }

  if (loading) return <div className="flex justify-center py-8"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-3">
      {err && <p className="text-xs text-red-500">{err}</p>}
      {benefits.length === 0 && !showForm && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-400">등록된 쿠폰 혜택이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">아래 버튼으로 첫 혜택을 등록해보세요.</p>
        </div>
      )}
      {benefits.map((b) =>
        editId === b.id ? (
          <BenefitForm key={b.id} couponTypes={couponTypes} initial={b} onSave={(data) => patch(b.id, data)} onCancel={() => setEditId(null)} />
        ) : (
          <div key={b.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${b.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-mono bg-periwinkle/10 text-periwinkle px-2 py-0.5 rounded-full">{b.coupon_type_code}</span>
                  {b.active ? <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">활성</span> : <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>}
                </div>
                <p className="text-sm font-semibold text-gray-800">{b.title}</p>
                {b.subtitle && <p className="text-xs text-gray-500 mt-0.5">{b.subtitle}</p>}
                {b.notes && <p className="text-[10px] text-gray-400 mt-1 bg-gray-50 rounded-lg px-2 py-1">{b.notes}</p>}
                <p className="text-[10px] text-periwinkle mt-1">{benefitLabel(b.benefit_json)}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => toggleActive(b)} className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle hover:text-periwinkle transition-colors">{b.active ? "중단" : "재개"}</button>
                <button onClick={() => setEditId(b.id)} className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle hover:text-periwinkle transition-colors">수정</button>
                <button onClick={() => remove(b.id)} className="text-[10px] px-2 py-1 rounded-lg border border-gray-100 text-gray-300 hover:border-red-200 hover:text-red-400 transition-colors">삭제</button>
              </div>
            </div>
          </div>
        )
      )}
      {showForm ? (
        <BenefitForm couponTypes={couponTypes} onSave={create} onCancel={() => setShowForm(false)} />
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-2xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors">+ 쿠폰 혜택 추가</button>
      )}
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
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "불러오기 실패"); }
      finally { setLoading(false); }
    })();
  }, [rq]);

  if (loading) return <div className="flex justify-center py-8"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;
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
        setDraft({ phone_number: data.phone_number, main_menu: data.main_menu, url: data.url, description: data.description });
      })
      .catch(() => setError("식당 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [ridReady, rq]);

  const isDirty =
    originalRef.current &&
    (draft.phone_number !== originalRef.current.phone_number ||
     draft.main_menu    !== originalRef.current.main_menu    ||
     draft.url          !== originalRef.current.url          ||
     draft.description  !== originalRef.current.description);

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/dashboard/restaurant${rq}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: draft.phone_number, main_menu: draft.main_menu, url: draft.url, description: draft.description }),
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
        <div className="w-6 h-6 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
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
            {FIELD_META.map(({ key, label, placeholder, multiline, readOnly }) => {
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
                  {multiline ? (
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
              식당명·주소·업종 변경은{" "}
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

          <PinChangeSection />
        </>
      )}

      {/* ── 탭 2: 쿠폰 & 스탬프 ── */}
      {activeTab === "coupon" && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">쿠폰 혜택</h2>
              <span className="text-[10px] text-gray-400">앱에서 사용자에게 발급되는 혜택</span>
            </div>
            <CouponBenefitsSection rid={rid ?? null} />
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
