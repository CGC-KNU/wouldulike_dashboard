"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── 타입 ─────────────────────────────────────────── */
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

/* ─── rid 헬퍼 ─────────────────────────────────────── */
// undefined = 아직 초기화 안 됨, null = ?rid 파라미터 없음, string = rid 값
function useRid() {
  const [rid, setRid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setRid(p.get("rid")); // null or "33"
  }, []);
  return rid;
}
function ridQ(rid: string | null) {
  return rid ? `?rid=${rid}` : "";
}

/* ─── benefit_json 표시 ─────────────────────────────── */
function benefitLabel(bj: Record<string, unknown>): string {
  if (!bj || typeof bj !== "object" || Object.keys(bj).length === 0) return "";
  const { type, value, max } = bj as { type?: string; value?: number; max?: number };
  if (type === "fixed") return `${(value ?? 0).toLocaleString()}원 할인`;
  if (type === "percent") return `${value}% 할인${max ? ` (최대 ${max.toLocaleString()}원)` : ""}`;
  return "";
}

/* ════════════════════════════════════════════════════
   섹션 1: 쿠폰 혜택 (RestaurantCouponBenefit)
════════════════════════════════════════════════════ */
function BenefitForm({
  couponTypes,
  initial,
  onSave,
  onCancel,
}: {
  couponTypes: CouponType[];
  initial?: Partial<CouponBenefit>;
  onSave: (data: Omit<CouponBenefit, "id" | "updated_at" | "benefit_json" | "coupon_type_title">) => Promise<void>;
  onCancel: () => void;
}) {
  const [couponTypeCode, setCouponTypeCode] = useState(initial?.coupon_type_code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const selectedCt = couponTypes.find((ct) => ct.code === couponTypeCode);

  const handleSubmit = async () => {
    if (!couponTypeCode) { setErr("쿠폰 타입을 선택해주세요."); return; }
    if (!title.trim()) { setErr("제목을 입력해주세요."); return; }
    setLoading(true);
    setErr("");
    try {
      await onSave({ coupon_type_code: couponTypeCode, title, subtitle, notes, sort_order: initial?.sort_order ?? 0, active });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-periwinkle/5 border border-periwinkle/20 rounded-2xl p-4 flex flex-col gap-3">
      {/* 쿠폰 타입 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">쿠폰 타입 *</label>
        <select
          value={couponTypeCode}
          onChange={(e) => {
            setCouponTypeCode(e.target.value);
            const ct = couponTypes.find((c) => c.code === e.target.value);
            if (ct && !title) setTitle(ct.title);
          }}
          disabled={!!initial?.coupon_type_code}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40 bg-white disabled:bg-gray-50"
        >
          <option value="">-- 선택 --</option>
          {couponTypes.map((ct) => (
            <option key={ct.code} value={ct.code}>
              {ct.code} · {ct.title}
            </option>
          ))}
        </select>
        {selectedCt && (
          <p className="text-[10px] text-periwinkle mt-1">{benefitLabel(selectedCt.benefit_json)}</p>
        )}
      </div>

      {/* 제목 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">제목 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 우주라이크 쿠폰 1,000원 할인"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
        />
      </div>

      {/* 부제목 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">부제목</label>
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="예: 1인 이상 방문 시"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
        />
      </div>

      {/* 사용 조건 메모 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">사용 조건</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="예: 최소 주문 1만원 이상, 1인 1회 사용 가능"
          rows={2}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40 resize-none"
        />
      </div>

      {/* 활성 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActive((v) => !v)}
          className={`relative w-10 h-5 rounded-full transition-colors ${active ? "bg-periwinkle" : "bg-gray-200"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
        <span className="text-xs text-gray-500">{active ? "활성" : "비활성"}</span>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 disabled:opacity-60 transition-colors"
        >
          {loading ? "저장 중..." : "저장"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 text-sm text-gray-400 rounded-xl hover:bg-gray-100 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function CouponBenefitsSection({ rid }: { rid: string | null }) {
  const [benefits, setBenefits] = useState<CouponBenefit[]>([]);
  const [couponTypes, setCouponTypes] = useState<CouponType[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const rq = ridQ(rid);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [bRes, tRes] = await Promise.all([
        fetch(`/api/dashboard/coupon-benefits${rq}`),
        fetch(`/api/dashboard/coupon-types${rq}`),
      ]);
      const [bData, tData] = await Promise.all([bRes.json(), tRes.json()]);
      if (!bRes.ok) throw new Error(bData?.detail ?? "쿠폰 혜택 불러오기 실패");
      setBenefits(Array.isArray(bData) ? bData : []);
      setCouponTypes(Array.isArray(tData) ? tData : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [rq]);

  useEffect(() => { load(); }, [load]);

  async function create(data: Omit<CouponBenefit, "id" | "updated_at" | "benefit_json" | "coupon_type_title">) {
    const res = await fetch(`/api/dashboard/coupon-benefits${rq}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, sort_order: benefits.length }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setBenefits((prev) => [...prev, d]);
    setShowForm(false);
  }

  async function update(id: number, data: Omit<CouponBenefit, "id" | "updated_at" | "benefit_json" | "coupon_type_title">) {
    const res = await fetch(`/api/dashboard/coupon-benefits/${id}${rq}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "수정 실패");
    setBenefits((prev) => prev.map((b) => (b.id === id ? d : b)));
    setEditId(null);
  }

  async function remove(id: number) {
    if (!confirm("이 쿠폰 혜택을 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/coupon-benefits/${id}${rq}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) { setErr("삭제 실패"); return; }
    setBenefits((prev) => prev.filter((b) => b.id !== id));
  }

  async function toggleActive(b: CouponBenefit) {
    const res = await fetch(`/api/dashboard/coupon-benefits/${b.id}${rq}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !b.active }),
    });
    const d = await res.json();
    if (res.ok) setBenefits((prev) => prev.map((x) => (x.id === b.id ? d : x)));
  }

  if (loading) return (
    <div className="flex justify-center py-6">
      <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {err && <p className="text-xs text-red-500">{err}</p>}

      {benefits.length === 0 && !showForm && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-400">등록된 쿠폰 혜택이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">아래 버튼으로 첫 혜택을 등록해보세요.</p>
        </div>
      )}

      {[
        { key: "other", label: "일반 쿠폰", items: benefits.filter((b) => !b.coupon_type_code.startsWith("STAMP")) },
        { key: "stamp", label: "스탬프 보상", items: benefits.filter((b) => b.coupon_type_code.startsWith("STAMP")) },
      ]
        .filter((g) => g.items.length > 0)
        .map(({ key, label, items }) => {
          const showHeader =
            benefits.some((b) => !b.coupon_type_code.startsWith("STAMP")) &&
            benefits.some((b) => b.coupon_type_code.startsWith("STAMP"));
          return (
            <div key={key} className="flex flex-col gap-2">
              {showHeader && (
                <p className="text-[11px] font-semibold text-gray-400 px-1 pt-1 uppercase tracking-wide">{label}</p>
              )}
              {items.map((b) =>
                editId === b.id ? (
                  <BenefitForm
                    key={b.id}
                    couponTypes={couponTypes}
                    initial={b}
                    onSave={(data) => update(b.id, data)}
                    onCancel={() => setEditId(null)}
                  />
                ) : (
                  <div key={b.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${b.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-mono bg-periwinkle/10 text-periwinkle px-2 py-0.5 rounded-full">
                            {b.coupon_type_code}
                          </span>
                          {b.active ? (
                            <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">활성</span>
                          ) : (
                            <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-800">{b.title}</p>
                        {b.subtitle && <p className="text-xs text-gray-500 mt-0.5">{b.subtitle}</p>}
                        {b.notes && (
                          <p className="text-[10px] text-gray-400 mt-1 bg-gray-50 rounded-lg px-2 py-1">
                            {b.notes}
                          </p>
                        )}
                        <p className="text-[10px] text-periwinkle mt-1">{benefitLabel(b.benefit_json)}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() => toggleActive(b)}
                          className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle hover:text-periwinkle transition-colors"
                        >
                          {b.active ? "중단" : "재개"}
                        </button>
                        <button
                          onClick={() => setEditId(b.id)}
                          className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle hover:text-periwinkle transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => remove(b.id)}
                          className="text-[10px] px-2 py-1 rounded-lg border border-gray-100 text-gray-300 hover:border-red-200 hover:text-red-400 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          );
        })
      }

      {showForm ? (
        <BenefitForm
          couponTypes={couponTypes}
          onSave={create}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-2xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 쿠폰 혜택 추가
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   섹션 2: 스탬프 규칙 (StampRewardRule)
════════════════════════════════════════════════════ */
function StampRuleSection({ rid }: { rid: string | null }) {
  const [rule, setRule] = useState<StampRule | null>(null);
  const [couponTypes, setCouponTypes] = useState<CouponType[]>([]);
  const [benefits, setBenefits] = useState<CouponBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 편집 상태
  const [cycleTarget, setCycleTarget] = useState(10);
  const [thresholds, setThresholds] = useState<StampThreshold[]>([]);
  const [ruleActive, setRuleActive] = useState(true);
  const [notes, setNotes] = useState("");

  const rq = ridQ(rid);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [rRes, tRes, bRes] = await Promise.all([
        fetch(`/api/dashboard/stamp-rule${rq}`),
        fetch(`/api/dashboard/coupon-types${rq}`),
        fetch(`/api/dashboard/coupon-benefits${rq}`),
      ]);
      const [rData, tData, bData] = await Promise.all([rRes.json(), tRes.json(), bRes.json()]);
      // 404 = 규칙 없음, 다른 에러는 throw
      if (rRes.ok) setRule(rData);
      else if (rRes.status === 404) setRule(null);
      else throw new Error(rData?.detail ?? "스탬프 규칙 불러오기 실패");
      setCouponTypes(Array.isArray(tData) ? tData : []);
      setBenefits(Array.isArray(bData) ? bData : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [rq]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    const cfg = rule?.config_json ?? {};
    setCycleTarget(cfg.cycle_target ?? 10);
    setThresholds(cfg.thresholds ? [...cfg.thresholds] : []);
    setRuleActive(rule?.active ?? true);
    setNotes(cfg.notes ?? "");
    setEditing(true);
  }

  function addThreshold() {
    setThresholds((prev) => [...prev, { stamps: (prev[prev.length - 1]?.stamps ?? 0) + 1, coupon_type_code: "" }]);
  }

  function removeThreshold(idx: number) {
    setThresholds((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateThreshold(idx: number, field: keyof StampThreshold, value: string | number) {
    setThresholds((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: field === "stamps" ? Number(value) : value } : t));
  }

  async function saveRule() {
    setSaving(true);
    setErr("");
    try {
      const config_json = {
        cycle_target: cycleTarget,
        thresholds,
        ...(notes ? { notes } : {}),
      };
      const res = await fetch(`/api/dashboard/stamp-rule${rq}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_type: "THRESHOLD", config_json, active: ruleActive }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "저장 실패");
      setRule(d);
      setEditing(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-6">
      <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (editing) {
    return (
      <div className="bg-periwinkle/5 border border-periwinkle/20 rounded-2xl p-4 flex flex-col gap-4">
        {/* 스탬프 목표 */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block font-medium">스탬프 목표 (만땅 개수)</label>
          <div className="flex gap-2 flex-wrap">
            {[3, 5, 7, 10].map((n) => (
              <button
                key={n}
                onClick={() => setCycleTarget(n)}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  cycleTarget === n
                    ? "border-periwinkle bg-periwinkle/10 text-periwinkle"
                    : "border-gray-100 text-gray-400 hover:border-gray-200"
                }`}
              >
                {n}개
              </button>
            ))}
          </div>
          {/* 인터랙티브 보상 구간 설정 */}
          <div className="mt-3">
            <p className="text-[10px] text-gray-400 mb-2">보상을 받을 스탬프 위치를 탭하세요 · ★ 다시 탭하면 제거</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: cycleTarget }).map((_, i) => {
                const pos = i + 1;
                const tIdx = thresholds.findIndex((t) => t.stamps === pos);
                const isReward = tIdx >= 0;
                const autoCode = `STAMP_REWARD_${pos}`;
                const codeExists = couponTypes.some((ct) => ct.code === autoCode);
                const benefit = benefits.find((b) => b.coupon_type_code === autoCode);
                const label = benefit
                  ? benefit.title.length > 8
                    ? benefit.title.slice(0, 8) + "…"
                    : benefit.title
                  : autoCode;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isReward) {
                        setThresholds((prev) => prev.filter((_, fi) => fi !== tIdx));
                      } else if (codeExists) {
                        setThresholds((prev) =>
                          [...prev, { stamps: pos, coupon_type_code: autoCode }].sort(
                            (a, b) => a.stamps - b.stamps
                          )
                        );
                      }
                    }}
                    disabled={!isReward && !codeExists}
                    title={isReward ? `${pos}개째 보상 제거` : codeExists ? `${pos}개째에 보상 추가` : "코드 없음"}
                    className={`flex flex-col items-center justify-center rounded-2xl border-2 transition-all ${
                      isReward
                        ? "border-amber-400 bg-amber-400 text-white w-14 min-h-[60px] px-1 py-2 shadow-sm"
                        : codeExists
                        ? "border-gray-200 text-gray-400 hover:border-amber-300 hover:bg-amber-50/60 w-10 h-10"
                        : "border-gray-100 text-gray-200 w-10 h-10 cursor-not-allowed"
                    }`}
                  >
                    <span className="text-sm font-bold leading-none">
                      {isReward ? "★" : pos}
                    </span>
                    {isReward && (
                      <span className="text-[8px] text-center text-white/90 leading-tight mt-1 break-words max-w-[52px] px-0.5">
                        {label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 운영 메모 */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">운영 메모 (앱 표시용)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="예: 스탬프 1개 = 방문 1회"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
          />
        </div>

        {/* 활성 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRuleActive((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${ruleActive ? "bg-periwinkle" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ruleActive ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
          <span className="text-xs text-gray-500">스탬프 규칙 {ruleActive ? "활성" : "비활성"}</span>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex gap-2">
          <button
            onClick={saveRule}
            disabled={saving}
            className="flex-1 py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 disabled:opacity-60 transition-colors"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-4 py-2.5 text-sm text-gray-400 rounded-xl hover:bg-gray-100 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  // 보기 모드
  if (!rule) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-2xl">
        <p className="text-sm text-gray-500 mb-1">설정된 스탬프 규칙이 없습니다.</p>
        <p className="text-xs text-gray-400 mb-4">규칙을 설정하면 앱에 스탬프 카드가 노출됩니다.</p>
        <button
          onClick={startEdit}
          className="px-5 py-2 bg-periwinkle text-white text-sm font-semibold rounded-xl hover:bg-periwinkle/90 transition-colors"
        >
          스탬프 규칙 설정
        </button>
      </div>
    );
  }

  const cfg = rule.config_json;
  const target = cfg.cycle_target ?? 10;
  const thresholdList = cfg.thresholds ?? [];

  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm ${rule.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">스탬프 {target}개 만땅</span>
          {rule.active ? (
            <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">활성</span>
          ) : (
            <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>
          )}
        </div>
        <button
          onClick={startEdit}
          className="text-xs text-gray-400 hover:text-periwinkle px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
        >
          수정
        </button>
      </div>

      {/* 스탬프 시각화 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Array.from({ length: target }).map((_, i) => {
          const isReward = thresholdList.some((t) => t.stamps === i + 1);
          return (
            <div
              key={i}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                isReward
                  ? "border-amber-400 bg-amber-400 text-white"
                  : "border-periwinkle/30 text-periwinkle/50"
              }`}
            >
              {isReward ? "★" : i + 1}
            </div>
          );
        })}
      </div>

      {/* 보상 구간 목록 */}
      {thresholdList.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {thresholdList.map((t, i) => {
            const ct = couponTypes.find((c) => c.code === t.coupon_type_code);
            const benefit = benefits.find((b) => b.coupon_type_code === t.coupon_type_code);
            return (
              <div key={i} className="flex flex-col gap-0.5 py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold shrink-0 text-[10px]">
                    {t.stamps}
                  </span>
                  <span className="font-medium">{benefit?.title ?? ct?.title ?? t.coupon_type_code}</span>
                  <span className="text-[10px] text-gray-300 font-mono ml-auto">{t.coupon_type_code}</span>
                </div>
                {benefit && (
                  <div className="ml-7 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-[10px] text-periwinkle">{benefitLabel(benefit.benefit_json)}</span>
                    {benefit.notes && <span className="text-[10px] text-gray-400">{benefit.notes}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cfg.notes && <p className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-2 py-1">{cfg.notes}</p>}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   메인 페이지
════════════════════════════════════════════════════ */
export default function CouponsPage() {
  const rid = useRid();

  // rid가 undefined = 아직 URL 파싱 전 (클라이언트 마운트 대기 중)
  // 이 상태에서 섹션이 마운트되면 restaurant_id 없이 API를 호출해 빈 화면 깜빡임 발생
  if (rid === undefined) {
    return (
      <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
        <h1 className="text-lg font-bold text-navy mb-5">쿠폰·스탬프</h1>
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-lg font-bold text-navy mb-5">쿠폰·스탬프</h1>

      {/* 쿠폰 혜택 섹션 */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">쿠폰 혜택</h2>
          <span className="text-[10px] text-gray-400">앱에서 사용자에게 발급되는 혜택</span>
        </div>
        <CouponBenefitsSection rid={rid} />
      </section>

      {/* 스탬프 규칙 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">스탬프 규칙</h2>
          <span className="text-[10px] text-gray-400">방문 적립 → 보상 쿠폰 자동 지급</span>
        </div>
        <StampRuleSection rid={rid} />
      </section>
    </div>
  );
}
