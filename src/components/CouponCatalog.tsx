"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── 타입 ─────────────────────────────────────────── */
export interface StampThreshold {
  stamps: number;
  coupon_type_code: string;
}

export interface StampRule {
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
export function ridQ(rid: string | null) {
  return rid ? `?rid=${rid}` : "";
}

/* ─── benefit_json 표시 ─────────────────────────────── */
export function benefitLabel(bj: Record<string, unknown>): string {
  if (!bj || typeof bj !== "object" || Object.keys(bj).length === 0) return "";
  const { type, value, max } = bj as { type?: string; value?: number; max?: number };
  if (type === "fixed") return `${(value ?? 0).toLocaleString()}원 할인`;
  if (type === "percent") return `${value}% 할인${max ? ` (최대 ${max.toLocaleString()}원)` : ""}`;
  return "";
}

/* ════════════════════════════════════════════════════
   섹션 1: 혜택 카탈로그 (RestaurantBenefit)
   식당 혜택 마스터 — 일반/한정/스탬프 3종으로 구분된다.
   쿠폰 타입 연결은 사장님 모드에 노출하지 않는다 —
   일반 혜택은 상시 쿠폰 코드에 자동 연결하고, 한정 혜택의
   기획전 코드 연결은 영업팀이 별도로 처리한다. 스탬프 혜택은
   아래 스탬프 규칙 섹션에서만 만들고 관리한다.
════════════════════════════════════════════════════ */
export const KIND_LIST = ["GENERAL", "SPECIAL", "STAMP"] as const;
export type BenefitKind = (typeof KIND_LIST)[number];
export const KIND_LABEL: Record<BenefitKind, string> = { GENERAL: "일반 쿠폰", SPECIAL: "한정 쿠폰", STAMP: "스탬프" };

// 사장님 모드 혜택 카탈로그에는 일반/한정만 노출한다 (스탬프는 아래 스탬프 규칙 섹션 전용)
const CATALOG_KIND_LIST = ["GENERAL", "SPECIAL"] as const;

// 일반 혜택은 상시로 나가는 표준 쿠폰 코드(가입/친구초대)에 자동 연결한다.
// 이 코드들은 시스템 전역에서 이미 쓰이고 있어 자동 연결이 안전하다 — 점주가 직접 고를 필요가 없다.
const GENERAL_AUTO_LINK_CODES = ["WELCOME_3000", "REFERRAL_BONUS_REFERRER", "REFERRAL_BONUS_REFEREE"];

export interface LinkedCouponType {
  coupon_type_code: string;
  coupon_type_title: string;
  sort_order: number;
}

export interface RestaurantBenefit {
  id: number;
  restaurant_id: number;
  kind: BenefitKind;
  stamp_key: string;
  sort_order: number;
  title: string;
  subtitle: string;
  benefit_json: Record<string, unknown>;
  notes: string;
  active: boolean;
  updated_at: string;
  linked_coupon_types: LinkedCouponType[];
}

type BenefitFormData = {
  kind: BenefitKind;
  title: string;
  subtitle: string;
  notes: string;
  stamp_key: string;
  active: boolean;
  benefit_json: Record<string, unknown>;
};

function BenefitMasterForm({
  kind,
  initial,
  fixedStampKey,
  onSave,
  onCancel,
}: {
  kind: BenefitKind;
  initial?: Partial<RestaurantBenefit>;
  /** 스탬프 규칙 섹션에서 호출할 때 — 구간 번호가 이미 정해져 있으니 입력을 숨기고 이 값을 강제한다 */
  fixedStampKey?: string;
  onSave: (data: BenefitFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const initialBj = (initial?.benefit_json ?? {}) as { type?: string; value?: number; max?: number };
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [stampKey, setStampKey] = useState(fixedStampKey ?? initial?.stamp_key ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [bjType, setBjType] = useState<"" | "fixed" | "percent">(
    (initialBj.type as "fixed" | "percent") ?? ""
  );
  const [bjValue, setBjValue] = useState(initialBj.value != null ? String(initialBj.value) : "");
  const [bjMax, setBjMax] = useState(initialBj.max != null ? String(initialBj.max) : "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    const finalStampKey = (fixedStampKey ?? stampKey).trim();
    if (!title.trim()) { setErr("제목을 입력해주세요."); return; }
    if (kind === "STAMP" && !finalStampKey) { setErr("스탬프 구간(개수)을 입력해주세요."); return; }
    setLoading(true);
    setErr("");
    try {
      const benefit_json: Record<string, unknown> =
        bjType === "fixed" ? { type: "fixed", value: Number(bjValue) || 0 }
        : bjType === "percent" ? { type: "percent", value: Number(bjValue) || 0, ...(bjMax ? { max: Number(bjMax) } : {}) }
        : {};
      await onSave({ kind, title, subtitle, notes, stamp_key: finalStampKey, active, benefit_json });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-periwinkle/5 border border-periwinkle/20 rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">제목 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 우주라이크 쿠폰 1,000원 할인"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">부제목</label>
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="예: 1인 이상 방문 시"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
        />
      </div>

      {/* 할인 유형 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">혜택 유형</label>
        <div className="flex gap-1.5 mb-2">
          {([["", "직접 설명만"], ["fixed", "정액 할인"], ["percent", "정률 할인"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setBjType(v)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                bjType === v ? "bg-periwinkle text-white" : "bg-white text-gray-400 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {bjType && (
          <div className="flex gap-2">
            <input
              type="number"
              value={bjValue}
              onChange={(e) => setBjValue(e.target.value)}
              placeholder={bjType === "percent" ? "예: 10" : "예: 1000"}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
            />
            {bjType === "percent" && (
              <input
                type="number"
                value={bjMax}
                onChange={(e) => setBjMax(e.target.value)}
                placeholder="최대 할인액(원, 선택)"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
              />
            )}
          </div>
        )}
      </div>

      {kind === "STAMP" && !fixedStampKey && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">스탬프 구간 (몇 개째 보상인지) *</label>
          <input
            type="number"
            min={1}
            max={10}
            value={stampKey}
            onChange={(e) => setStampKey(e.target.value)}
            placeholder="예: 5"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
          />
        </div>
      )}

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

function BenefitCard({
  b,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  b: RestaurantBenefit;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm ${b.active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {b.active ? (
              <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">활성</span>
            ) : (
              <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">비활성</span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800">{b.title}</p>
          {b.subtitle && <p className="text-xs text-gray-500 mt-0.5">{b.subtitle}</p>}
          {b.notes && (
            <p className="text-[10px] text-gray-400 mt-1 bg-gray-50 rounded-lg px-2 py-1">{b.notes}</p>
          )}
          {benefitLabel(b.benefit_json) && (
            <p className="text-[10px] text-periwinkle mt-1">{benefitLabel(b.benefit_json)}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onToggleActive}
            className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle hover:text-periwinkle transition-colors"
          >
            {b.active ? "중단" : "재개"}
          </button>
          <button
            onClick={onEdit}
            className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle hover:text-periwinkle transition-colors"
          >
            수정
          </button>
          <button
            onClick={onDelete}
            className="text-[10px] px-2 py-1 rounded-lg border border-gray-100 text-gray-300 hover:border-red-200 hover:text-red-400 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

export function BenefitCatalogSection({ rid }: { rid: string | null }) {
  const [benefits, setBenefits] = useState<RestaurantBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeKind, setActiveKind] = useState<(typeof CATALOG_KIND_LIST)[number]>("GENERAL");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const rq = ridQ(rid);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const bRes = await fetch(`/api/dashboard/restaurant-benefits${rq}`);
      const bData = await bRes.json();
      if (!bRes.ok) throw new Error(bData?.detail ?? "혜택 불러오기 실패");
      setBenefits(Array.isArray(bData) ? bData : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [rq]);

  useEffect(() => { load(); }, [load]);

  async function create(data: BenefitFormData) {
    const res = await fetch(`/api/dashboard/restaurant-benefits${rq}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setBenefits((prev) => [...prev, d]);
    setShowForm(false);

    // 일반 쿠폰은 상시 코드에 자동 연결 — 점주가 직접 고를 필요 없음
    if (data.kind === "GENERAL") {
      await Promise.all(
        GENERAL_AUTO_LINK_CODES.map((code) =>
          fetch(`/api/dashboard/coupon-types/${encodeURIComponent(code)}/benefits${rq}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ restaurant_benefit_id: d.id }),
          }).catch(() => null)
        )
      );
    }
  }

  async function update(id: number, data: BenefitFormData) {
    const res = await fetch(`/api/dashboard/restaurant-benefits/${id}${rq}`, {
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
    if (!confirm("이 혜택을 삭제할까요? 연결된 쿠폰 타입에서도 해제됩니다.")) return;
    const res = await fetch(`/api/dashboard/restaurant-benefits/${id}${rq}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) { setErr("삭제 실패"); return; }
    setBenefits((prev) => prev.filter((b) => b.id !== id));
  }

  async function toggleActive(b: RestaurantBenefit) {
    const res = await fetch(`/api/dashboard/restaurant-benefits/${b.id}${rq}`, {
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

  const items = benefits.filter((b) => b.kind === activeKind);
  const editing = editId != null ? benefits.find((b) => b.id === editId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {err && <p className="text-xs text-red-500">{err}</p>}

      {/* 종류 탭 */}
      <div className="flex gap-1.5">
        {CATALOG_KIND_LIST.map((k) => {
          const count = benefits.filter((b) => b.kind === k).length;
          return (
            <button
              key={k}
              onClick={() => { setActiveKind(k); setShowForm(false); setEditId(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeKind === k ? "bg-navy text-white" : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}
            >
              {KIND_LABEL[k]}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {items.length === 0 && !showForm && (
        <div className="text-center py-8 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-400">등록된 {KIND_LABEL[activeKind]} 혜택이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">아래 버튼으로 첫 혜택을 등록해보세요.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((b) =>
          editId === b.id && editing ? (
            <BenefitMasterForm
              key={b.id}
              kind={activeKind}
              initial={editing}
              onSave={(data) => update(b.id, data)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <BenefitCard
              key={b.id}
              b={b}
              onToggleActive={() => toggleActive(b)}
              onEdit={() => setEditId(b.id)}
              onDelete={() => remove(b.id)}
            />
          )
        )}
      </div>

      {showForm ? (
        <BenefitMasterForm kind={activeKind} onSave={create} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-2xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + {KIND_LABEL[activeKind]} 혜택 추가
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   혜택 한눈에 보기 — 영업툴(admin)에서 쓰는 읽기 전용 요약.
   편집은 여전히 BenefitCatalogSection(사장님 모드)에서 한다.
════════════════════════════════════════════════════ */
export function BenefitGlance({ rid }: { rid: string | null }) {
  const [benefits, setBenefits] = useState<RestaurantBenefit[] | null>(null);
  const [err, setErr] = useState("");

  const rq = ridQ(rid);

  useEffect(() => {
    let cancelled = false;
    setBenefits(null);
    setErr("");
    fetch(`/api/dashboard/restaurant-benefits${rq}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.detail ?? "혜택 불러오기 실패");
        setBenefits(Array.isArray(data) ? data : []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "불러오기 실패");
      });
    return () => { cancelled = true; };
  }, [rq]);

  if (err) return <p className="text-xs text-red-500">{err}</p>;

  if (benefits === null) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (benefits.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-3">등록된 혜택이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {KIND_LIST.map((k) => {
        const items = benefits.filter((b) => b.kind === k);
        if (items.length === 0) return null;
        return (
          <div key={k}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {KIND_LABEL[k]} ({items.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {items.map((b) => (
                <div key={b.id} className="bg-white rounded-lg px-3 py-2 flex items-start gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${b.active ? "bg-green-400" : "bg-gray-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {b.kind === "STAMP" && b.stamp_key && (
                        <span className="text-[9px] font-mono bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full shrink-0">
                          {b.stamp_key}개째
                        </span>
                      )}
                      <p className="text-xs font-medium text-gray-800 truncate">{b.title}</p>
                    </div>
                    {benefitLabel(b.benefit_json) && (
                      <p className="text-[10px] text-periwinkle mt-0.5">{benefitLabel(b.benefit_json)}</p>
                    )}
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      {b.linked_coupon_types.length === 0 ? (
                        <span className="text-[9px] text-amber-500">연결된 쿠폰 없음</span>
                      ) : (
                        b.linked_coupon_types.map((lt) => (
                          <span key={lt.coupon_type_code} className="text-[9px] font-mono bg-periwinkle/10 text-periwinkle px-1.5 py-0.5 rounded-full">
                            {lt.coupon_type_code}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   섹션 2: 스탬프 규칙 (StampRewardRule)
════════════════════════════════════════════════════ */
function StampBenefitRow({
  benefit,
  onEdit,
}: {
  benefit: RestaurantBenefit | undefined;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 min-w-0">
        {benefit ? (
          <>
            <p className="text-xs font-medium text-gray-700 truncate">{benefit.title}</p>
            {benefitLabel(benefit.benefit_json) && (
              <p className="text-[10px] text-periwinkle">{benefitLabel(benefit.benefit_json)}</p>
            )}
          </>
        ) : (
          <p className="text-[10px] text-amber-500">혜택 미설정</p>
        )}
      </div>
      <button
        onClick={onEdit}
        className="text-[10px] text-gray-400 hover:text-periwinkle underline shrink-0"
      >
        {benefit ? "수정" : "혜택 설정"}
      </button>
    </div>
  );
}

export function StampRuleSection({ rid }: { rid: string | null }) {
  const [rule, setRule] = useState<StampRule | null>(null);
  const [benefits, setBenefits] = useState<RestaurantBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 편집 상태
  const [cycleTarget, setCycleTarget] = useState(10);
  const [thresholds, setThresholds] = useState<StampThreshold[]>([]);
  const [ruleActive, setRuleActive] = useState(true);
  const [notes, setNotes] = useState("");
  // 구간별 혜택 내용을 인라인으로 만들거나 수정할 때 — 편집/보기 모드 어느 쪽 목록이든 공유한다
  const [editingBenefitIdx, setEditingBenefitIdx] = useState<number | null>(null);

  const rq = ridQ(rid);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [rRes, bRes] = await Promise.all([
        fetch(`/api/dashboard/stamp-rule${rq}`),
        fetch(`/api/dashboard/restaurant-benefits${rq ? `${rq}&kind=STAMP` : "?kind=STAMP"}`),
      ]);
      const [rData, bData] = await Promise.all([rRes.json(), bRes.json()]);
      // 404 = 규칙 없음, 다른 에러는 throw
      if (rRes.ok) setRule(rData);
      else if (rRes.status === 404) setRule(null);
      else throw new Error(rData?.detail ?? "스탬프 규칙 불러오기 실패");
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

  async function saveStampBenefit(stamps: number, data: BenefitFormData) {
    const existing = benefits.find((b) => b.stamp_key === String(stamps));
    if (existing) {
      const res = await fetch(`/api/dashboard/restaurant-benefits/${existing.id}${rq}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "저장 실패");
      setBenefits((prev) => prev.map((b) => (b.id === existing.id ? d : b)));
    } else {
      const res = await fetch(`/api/dashboard/restaurant-benefits${rq}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "생성 실패");
      // 스탬프 구간 코드(STAMP_REWARD_N)에 자동 연결 — 점주가 직접 고를 필요 없음
      const code = `STAMP_REWARD_${stamps}`;
      const linkRes = await fetch(`/api/dashboard/coupon-types/${encodeURIComponent(code)}/benefits${rq}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_benefit_id: d.id }),
      });
      setBenefits((prev) => [...prev, d]);
      if (!linkRes.ok) throw new Error(`혜택은 저장했지만 ${code} 코드 연결에 실패했습니다.`);
    }
  }

  async function saveRule() {
    setSaving(true);
    setErr("");
    try {
      const autoCycleTarget = thresholds.length > 0
        ? Math.max(...thresholds.map((t) => t.stamps))
        : cycleTarget;
      const config_json = {
        cycle_target: autoCycleTarget,
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
    const autoCycleTarget = thresholds.length > 0
      ? Math.max(...thresholds.map((t) => t.stamps))
      : cycleTarget;

    return (
      <div className="bg-periwinkle/5 border border-periwinkle/20 rounded-2xl p-4 flex flex-col gap-4">
        {/* 보상 구간 리스트 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-gray-500 font-medium">보상 구간</label>
            <button
              onClick={() => {
                const maxStamp = thresholds.length > 0
                  ? Math.max(...thresholds.map((t) => t.stamps))
                  : 0;
                const next = maxStamp + 1;
                if (next > 10) return;
                setThresholds((prev) =>
                  [...prev, { stamps: next, coupon_type_code: `STAMP_REWARD_${next}` }]
                    .sort((a, b) => a.stamps - b.stamps)
                );
              }}
              className="text-[11px] bg-periwinkle/10 text-periwinkle font-semibold px-3 py-1 rounded-lg hover:bg-periwinkle/20 transition-colors"
            >
              + 구간 추가
            </button>
          </div>

          {thresholds.length === 0 ? (
            <div className="text-center py-6 bg-white/60 rounded-xl border border-dashed border-gray-200">
              <p className="text-xs text-gray-400">구간이 없습니다.</p>
              <p className="text-[10px] text-gray-300 mt-0.5">+ 구간 추가를 눌러 시작하세요.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {thresholds.map((t, idx) => {
                const benefit = benefits.find((b) => b.stamp_key === String(t.stamps));
                if (editingBenefitIdx === idx) {
                  return (
                    <div key={idx} className="px-3 py-3 border-b border-gray-50 last:border-0">
                      <p className="text-[10px] text-gray-400 mb-1.5">{t.stamps}개째 혜택</p>
                      <BenefitMasterForm
                        kind="STAMP"
                        fixedStampKey={String(t.stamps)}
                        initial={benefit}
                        onSave={async (data) => { await saveStampBenefit(t.stamps, data); setEditingBenefitIdx(null); }}
                        onCancel={() => setEditingBenefitIdx(null)}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-3 border-b border-gray-50 last:border-0"
                  >
                    {/* 스탬프 수 입력 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={t.stamps}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(10, Number(e.target.value)));
                          setThresholds((prev) =>
                            prev
                              .map((x, i) =>
                                i === idx
                                  ? { stamps: n, coupon_type_code: `STAMP_REWARD_${n}` }
                                  : x
                              )
                              .sort((a, b) => a.stamps - b.stamps)
                          );
                        }}
                        className="w-12 text-sm font-semibold border border-gray-200 rounded-xl px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
                      />
                      <span className="text-xs text-gray-400 shrink-0">개째</span>
                    </div>

                    {/* 연결된 혜택 내용 */}
                    <StampBenefitRow benefit={benefit} onEdit={() => setEditingBenefitIdx(idx)} />

                    {/* 삭제 */}
                    <button
                      onClick={() =>
                        setThresholds((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-gray-300 hover:text-red-400 transition-colors p-1 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 만땅 개수 자동 표시 */}
          {thresholds.length > 0 && (
            <div className="mt-2.5 flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
              <span className="text-[10px] text-amber-500">스탬프 만땅</span>
              <span className="text-sm font-bold text-amber-600">{autoCycleTarget}개</span>
              <span className="text-[10px] text-amber-400">· 최대 구간 기준 자동 설정</span>
            </div>
          )}
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
            const benefit = benefits.find((b) => b.stamp_key === String(t.stamps));
            if (editingBenefitIdx === i) {
              return (
                <div key={i} className="py-1.5 border-b border-gray-50 last:border-0">
                  <p className="text-[10px] text-gray-400 mb-1.5">{t.stamps}개째 혜택</p>
                  <BenefitMasterForm
                    kind="STAMP"
                    fixedStampKey={String(t.stamps)}
                    initial={benefit}
                    onSave={async (data) => { await saveStampBenefit(t.stamps, data); setEditingBenefitIdx(null); }}
                    onCancel={() => setEditingBenefitIdx(null)}
                  />
                </div>
              );
            }
            return (
              <div key={i} className="flex flex-col gap-0.5 py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold shrink-0 text-[10px]">
                    {t.stamps}
                  </span>
                  <StampBenefitRow benefit={benefit} onEdit={() => setEditingBenefitIdx(i)} />
                </div>
                {benefit?.notes && (
                  <div className="ml-7 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-[10px] text-gray-400">{benefit.notes}</span>
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
