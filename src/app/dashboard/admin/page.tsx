"use client";

import { useEffect, useState, useCallback } from "react";

/* ─── 타입 ─── */
interface Restaurant {
  restaurant_id: number;
  name: string;
  tier: string | null;
  is_affiliate?: boolean;
}
interface Stats {
  revisit_this_month: number;
  loyal_total: number;
  coupon_redeemed_this_month: number;
  stamp_earned_this_month: number;
}
type SortKey = "name" | "tier" | "id";
type SortDir = "asc" | "desc";

/* ─── 상수 ─── */
const TIER_ORDER: Record<string, number> = { CONTENT: 3, BOOST: 2, FREE: 1 };
const TIER_STYLE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600",
  BOOST: "bg-amber-100 text-amber-700",
  CONTENT: "bg-indigo-100 text-indigo-700",
};
const DUMMY_CAMPAIGNS = [
  { id: 1, restaurant: "정든밤", title: "여름 특가 10% 쿠폰", submitted: "2026-06-24", status: "검수중" },
  { id: 2, restaurant: "봄봄김밥", title: "단골 무료 음료 이벤트", submitted: "2026-06-23", status: "검수중" },
  { id: 3, restaurant: "오마카세 숲", title: "주말 한정 세트 할인", submitted: "2026-06-22", status: "반영됨" },
];
const CAMPAIGN_STATUS_STYLE: Record<string, string> = {
  검수중: "bg-amber-100 text-amber-700",
  반영됨: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-500",
};

function sortRestaurants(list: Restaurant[], key: SortKey, dir: SortDir) {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "name") cmp = a.name.localeCompare(b.name, "ko");
    else if (key === "tier") cmp = (TIER_ORDER[b.tier ?? ""] ?? 0) - (TIER_ORDER[a.tier ?? ""] ?? 0);
    else cmp = a.restaurant_id - b.restaurant_id;
    return dir === "asc" ? cmp : -cmp;
  });
}

/* ═══════════════════════════════════════════════════
   식당 드로어
═══════════════════════════════════════════════════ */
function RestaurantDrawer({
  r,
  onClose,
  onUpdated,
  onDeleted,
}: {
  r: Restaurant;
  onClose: () => void;
  onUpdated: (updated: Partial<Restaurant>) => void;
  onDeleted: (id: number) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // 삭제 단계: null → "confirm1" → "confirm2(2차PW입력)" → "deleting"
  const [deleteStep, setDeleteStep] = useState<null | "confirm1" | "confirm2">(null);
  const [secondaryPw, setSecondaryPw] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    fetch(`/api/dashboard/stats?rid=${r.restaurant_id}`)
      .then((res) => res.json())
      .then((data) => setStats(data.stats ?? null))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [r.restaurant_id]);

  async function toggleAffiliate() {
    setActionPending(true);
    const res = await fetch(`/api/dashboard/admin/restaurants/${r.restaurant_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_affiliate: !r.is_affiliate }),
    });
    if (res.ok) onUpdated({ is_affiliate: !r.is_affiliate });
    setActionPending(false);
  }

  async function confirmDelete() {
    if (!secondaryPw) { setDeleteError("2차 비밀번호를 입력해주세요."); return; }
    setActionPending(true);
    setDeleteError("");
    const res = await fetch(`/api/dashboard/admin/restaurants/${r.restaurant_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondary_password: secondaryPw }),
    });
    const data = await res.json();
    if (res.ok) { onDeleted(r.restaurant_id); onClose(); }
    else setDeleteError(data.detail ?? "삭제에 실패했습니다.");
    setActionPending(false);
  }

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* 드로어 */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* 식당 헤더 */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-navy">{r.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">ID {r.restaurant_id}</span>
                {r.tier ? (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_STYLE[r.tier] ?? "bg-gray-100 text-gray-500"}`}>
                    {r.tier}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">미등록</span>
                )}
                {r.is_affiliate === false && (
                  <span className="text-xs font-semibold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">비활성</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1">✕</button>
          </div>

          {/* 통계 */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">이번 달 통계</p>
            {statsLoading ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "재방문 단골", value: stats.revisit_this_month, unit: "명" },
                  { label: "누적 단골", value: stats.loyal_total, unit: "명" },
                  { label: "쿠폰 사용", value: stats.coupon_redeemed_this_month, unit: "건" },
                  { label: "스탬프 적립", value: stats.stamp_earned_this_month, unit: "건" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="bg-white rounded-lg p-3">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xl font-bold text-navy mt-0.5">
                      {value}<span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-1">통계를 불러오지 못했습니다.</p>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="flex flex-col gap-2">
            <a
              href={`/dashboard/owner?rid=${r.restaurant_id}`}
              className="w-full py-3 rounded-xl bg-periwinkle text-white text-sm font-bold text-center hover:bg-navy transition-colors"
            >
              사장님 모드로 전환
            </a>

            <button
              onClick={toggleAffiliate}
              disabled={actionPending}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                r.is_affiliate === false
                  ? "bg-green-50 text-green-600 hover:bg-green-100"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {actionPending ? "처리 중..." : r.is_affiliate === false ? "활성화" : "비활성화"}
            </button>

            {/* 삭제 플로우 */}
            {deleteStep === null && (
              <button
                onClick={() => setDeleteStep("confirm1")}
                className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-bold hover:bg-red-100 transition-colors"
              >
                식당 삭제
              </button>
            )}

            {deleteStep === "confirm1" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-600 mb-1">정말 삭제하시겠습니까?</p>
                <p className="text-xs text-red-400 mb-3">
                  <strong>{r.name}</strong> 식당이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteStep(null)}
                    className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => { setDeleteStep("confirm2"); setDeleteError(""); }}
                    className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold"
                  >
                    계속
                  </button>
                </div>
              </div>
            )}

            {deleteStep === "confirm2" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-600 mb-3">2차 비밀번호를 입력하세요</p>
                <input
                  type="password"
                  value={secondaryPw}
                  onChange={(e) => setSecondaryPw(e.target.value)}
                  placeholder="2차 비밀번호"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg mb-2 focus:outline-none focus:border-red-400 bg-white"
                />
                {deleteError && <p className="text-xs text-red-500 mb-2">{deleteError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDeleteStep(null); setSecondaryPw(""); setDeleteError(""); }}
                    className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white"
                  >
                    취소
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={actionPending}
                    className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold disabled:opacity-60"
                  >
                    {actionPending ? "삭제 중..." : "삭제 확인"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════
   비밀번호 변경 섹션
═══════════════════════════════════════════════════ */
function PasswordSection() {
  const [activeForm, setActiveForm] = useState<null | "main" | "secondary">(null);
  const [form, setForm] = useState({ current: "", next: "", next2: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(type: "main" | "secondary") {
    if (form.next !== form.next2) { setMsg({ ok: false, text: "새 비밀번호가 일치하지 않습니다." }); return; }
    if (form.next.length < 4) { setMsg({ ok: false, text: "4자 이상 입력해주세요." }); return; }
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/dashboard/admin/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, current_password: form.current, new_password: form.next }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ ok: true, text: "변경되었습니다." });
      setForm({ current: "", next: "", next2: "" });
      setActiveForm(null);
    } else {
      setMsg({ ok: false, text: data.detail ?? "변경에 실패했습니다." });
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-8">
      <div className="px-4 py-3 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">관리자 비밀번호</h2>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {msg && (
          <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
            {msg.text}
          </p>
        )}

        {/* 일반 비밀번호 */}
        <button
          onClick={() => { setActiveForm(activeForm === "main" ? null : "main"); setMsg(null); }}
          className="text-left text-sm font-medium text-gray-700 py-2 flex items-center justify-between"
        >
          일반 비밀번호 변경
          <span className="text-gray-400 text-xs">{activeForm === "main" ? "▲" : "▶"}</span>
        </button>
        {activeForm === "main" && (
          <div className="flex flex-col gap-2 pb-2">
            {["현재 비밀번호", "새 비밀번호", "새 비밀번호 확인"].map((label, i) => {
              const key = (["current", "next", "next2"] as const)[i];
              return (
                <input
                  key={key}
                  type="password"
                  placeholder={label}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
                />
              );
            })}
            <button
              onClick={() => submit("main")}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}

        <hr className="border-gray-100" />

        {/* 2차 비밀번호 */}
        <button
          onClick={() => { setActiveForm(activeForm === "secondary" ? null : "secondary"); setMsg(null); }}
          className="text-left text-sm font-medium text-gray-700 py-2 flex items-center justify-between"
        >
          2차 비밀번호 설정 (삭제 확인용)
          <span className="text-gray-400 text-xs">{activeForm === "secondary" ? "▲" : "▶"}</span>
        </button>
        {activeForm === "secondary" && (
          <div className="flex flex-col gap-2 pb-2">
            <input
              type="password"
              placeholder="현재 2차 비밀번호 (최초 설정 시 빈칸)"
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            />
            <input
              type="password"
              placeholder="새 2차 비밀번호"
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            />
            <input
              type="password"
              placeholder="새 2차 비밀번호 확인"
              value={form.next2}
              onChange={(e) => setForm((f) => ({ ...f, next2: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            />
            <button
              onClick={() => submit("secondary")}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   메인 페이지
═══════════════════════════════════════════════════ */
export default function AdminHomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Restaurant | null>(null);

  const fetchRestaurants = useCallback((query: string) => {
    setLoading(true);
    const url = query
      ? `/api/dashboard/restaurants?search=${encodeURIComponent(query)}`
      : "/api/dashboard/restaurants";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setRestaurants(data.restaurants ?? []))
      .catch(() => setRestaurants([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRestaurants(""); }, [fetchRestaurants]);
  useEffect(() => {
    const timer = setTimeout(() => fetchRestaurants(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchRestaurants]);

  const sorted = sortRestaurants(restaurants, sortKey, sortDir);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-periwinkle ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleUpdated(updated: Partial<Restaurant>) {
    if (!selected) return;
    const next = { ...selected, ...updated };
    setSelected(next);
    setRestaurants((prev) =>
      prev.map((r) => (r.restaurant_id === next.restaurant_id ? next : r))
    );
  }

  function handleDeleted(id: number) {
    setRestaurants((prev) => prev.filter((r) => r.restaurant_id !== id));
  }

  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "전체 식당", value: loading ? "—" : restaurants.length },
          { label: "검수 대기", value: DUMMY_CAMPAIGNS.filter((c) => c.status === "검수중").length },
          { label: "이번 달 활성 유저", value: 317 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-navy mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* 캠페인 검수 */}
      <div className="bg-white rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">캠페인 검수</h2>
          <span className="text-xs text-amber-600 font-semibold">
            {DUMMY_CAMPAIGNS.filter((c) => c.status === "검수중").length}건 대기
          </span>
        </div>
        <ul className="divide-y divide-gray-50">
          {DUMMY_CAMPAIGNS.map((c) => (
            <li key={c.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.restaurant} · {c.submitted}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${CAMPAIGN_STATUS_STYLE[c.status]}`}>
                {c.status}
              </span>
              {c.status === "검수중" && (
                <div className="flex gap-1.5 shrink-0">
                  <button className="text-xs px-3 py-1 bg-green-100 text-green-700 font-semibold rounded-lg">승인</button>
                  <button className="text-xs px-3 py-1 bg-red-50 text-red-500 font-semibold rounded-lg">반려</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 식당 목록 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-5">
        {/* 검색 헤더 */}
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 shrink-0">제휴 식당</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="식당명 검색..."
            className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
          />
          <span className="text-xs text-gray-400 shrink-0">{loading ? "..." : `${sorted.length}개`}</span>
        </div>

        {/* 정렬 헤더 */}
        <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          <button onClick={() => toggleSort("id")} className="w-10 text-left font-medium hover:text-navy">
            ID <SortIcon k="id" />
          </button>
          <button onClick={() => toggleSort("name")} className="flex-1 text-left font-medium hover:text-navy">
            식당명 <SortIcon k="name" />
          </button>
          <button onClick={() => toggleSort("tier")} className="w-20 text-right font-medium hover:text-navy">
            플랜 <SortIcon k="tier" />
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            {search ? "검색 결과가 없습니다." : "식당 목록을 불러오지 못했습니다."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map((r) => (
              <li
                key={r.restaurant_id}
                onClick={() => setSelected(r)}
                className={`flex items-center px-4 py-3 gap-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                  r.is_affiliate === false ? "opacity-50" : ""
                }`}
              >
                <span className="w-10 text-xs text-gray-400 shrink-0">{r.restaurant_id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                  {r.is_affiliate === false && (
                    <span className="text-[10px] text-red-400 font-medium">비활성</span>
                  )}
                </div>
                <div className="w-20 flex justify-end">
                  {r.tier ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_STYLE[r.tier] ?? "bg-gray-100 text-gray-500"}`}>
                      {r.tier}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">미등록</span>
                  )}
                </div>
                <span className="text-xs text-gray-300 shrink-0">›</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 비밀번호 설정 */}
      <PasswordSection />

      {/* 식당 드로어 */}
      {selected && (
        <RestaurantDrawer
          r={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
