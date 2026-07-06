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
interface TrendItem {
  id: number;
  title: string;
  description: string;
  image_url: string | null;
  blog_link: string;
  display_order: number;
  created_at: string;
}
interface PopupItem {
  id: number;
  title: string;
  image_url: string;
  instagram_url: string;
  start_at: string;
  end_at: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}
type SortKey = "name" | "tier" | "id";
type SortDir = "asc" | "desc";
type Tab = "restaurants" | "content" | "notifications" | "settings";

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

/* ─── 유틸 ─── */
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
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 pb-8 pt-2">
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

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <a
                href={`/dashboard/owner?rid=${r.restaurant_id}`}
                className="flex-1 py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold text-center hover:bg-navy transition-colors"
              >
                사장님 모드
              </a>
              <a
                href={`/dashboard/admin/restaurants/${r.restaurant_id}`}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold text-center hover:bg-gray-200 transition-colors"
              >
                자세히 보기 →
              </a>
            </div>
            <button
              onClick={toggleAffiliate}
              disabled={actionPending}
              className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                r.is_affiliate === false
                  ? "bg-green-50 text-green-600 hover:bg-green-100"
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}
            >
              {actionPending ? "처리 중..." : r.is_affiliate === false ? "활성화" : "비활성화"}
            </button>
            {deleteStep === null && (
              <button
                onClick={() => setDeleteStep("confirm1")}
                className="text-xs text-gray-300 hover:text-red-400 transition-colors py-1 text-center"
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
                  <button onClick={() => setDeleteStep(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
                  <button onClick={() => { setDeleteStep("confirm2"); setDeleteError(""); }} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold">계속</button>
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
                  <button onClick={() => { setDeleteStep(null); setSecondaryPw(""); setDeleteError(""); }} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
                  <button onClick={confirmDelete} disabled={actionPending} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold disabled:opacity-60">
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
   인라인 이미지 업로드 필드 (폼 내부용)
═══════════════════════════════════════════════════ */
function ImagePickerField({
  value,
  onChange,
  uploadType,
}: {
  value: string;
  onChange: (url: string) => void;
  uploadType: "trend" | "popup";
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const ref = useCallback((input: HTMLInputElement | null) => { if (input) input.value = ""; }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setErr("");
    try {
      // 압축 (canvas)
      const compressed = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 1400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let q = 0.85;
          const step = () => {
            canvas.toBlob((blob) => {
              if (!blob) { reject(new Error("변환 실패")); return; }
              if (blob.size <= 200 * 1024 || q <= 0.3) { resolve(blob); return; }
              q -= 0.1;
              step();
            }, "image/jpeg", q);
          };
          step();
        };
        img.onerror = reject;
        img.src = url;
      });
      // presign
      const presRes = await fetch("/api/dashboard/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content_type: "image/jpeg", upload_type: uploadType }),
      });
      if (!presRes.ok) throw new Error("presign 실패");
      const { upload_url, public_url } = await presRes.json();
      // S3 PUT
      const putRes = await fetch(upload_url, { method: "PUT", body: compressed, headers: { "Content-Type": "image/jpeg" } });
      if (!putRes.ok) throw new Error("업로드 실패");
      onChange(public_url);
    } catch (e) {
      setErr(String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div
        className="relative w-full h-32 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden cursor-pointer hover:border-periwinkle transition-colors"
        onClick={() => document.getElementById(`img-pick-${uploadType}`)?.click()}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <span className="text-2xl text-gray-300">📷</span>
            <span className="text-xs text-gray-400">클릭하여 이미지 선택</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {value && !uploading && (
          <div className="absolute bottom-1 right-1">
            <span className="text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">변경</span>
          </div>
        )}
      </div>
      <input
        id={`img-pick-${uploadType}`}
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   배너(Trend) 섹션
═══════════════════════════════════════════════════ */
const EMPTY_TREND = { title: "", description: "", image_url: "", blog_link: "", display_order: 0 };

function TrendForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<TrendItem>;
  onSave: (data: typeof EMPTY_TREND) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_TREND, ...initial, image_url: initial?.image_url ?? "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof EMPTY_TREND, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title.trim()) { setErr("제목을 입력해주세요."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl">
      <ImagePickerField value={form.image_url} onChange={(u) => set("image_url", u)} uploadType="trend" />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="제목 *"
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <textarea
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle resize-none"
        placeholder="설명"
        rows={2}
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="블로그 링크 (https://...)"
        value={form.blog_link}
        onChange={(e) => set("blog_link", e.target.value)}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 shrink-0">노출 순서</label>
        <input
          type="number"
          className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
          value={form.display_order}
          onChange={(e) => set("display_order", Number(e.target.value))}
        />
        <span className="text-xs text-gray-400">(작을수록 먼저 표시)</span>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white">
          취소
        </button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function BannerSection() {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const orderChanged = JSON.stringify(items.map((t) => t.id)) !== JSON.stringify(savedIds);

  useEffect(() => {
    fetch("/api/dashboard/admin/trends")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setItems(list);
        setSavedIds(list.map((t: TrendItem) => t.id));
      })
      .catch(() => setErr("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    setItems((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    setErr("");
    try {
      await Promise.all(
        items.map((t, idx) =>
          fetch(`/api/dashboard/admin/trends/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: idx }),
          })
        )
      );
      setItems((prev) => prev.map((t, idx) => ({ ...t, display_order: idx })));
      setSavedIds(items.map((t) => t.id));
    } catch {
      setErr("순서 저장에 실패했습니다.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function create(data: typeof EMPTY_TREND) {
    const res = await fetch("/api/dashboard/admin/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, display_order: items.length }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setItems((prev) => [...prev, d]);
    setSavedIds((prev) => [...prev, d.id]);
    setShowForm(false);
  }

  async function update(id: number, data: typeof EMPTY_TREND) {
    const res = await fetch(`/api/dashboard/admin/trends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "수정 실패");
    setItems((prev) => prev.map((t) => (t.id === id ? d : t)));
    setEditId(null);
  }

  async function remove(id: number) {
    if (!confirm("배너를 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/admin/trends/${id}`, { method: "DELETE" });
    if (!res.ok) { setErr("삭제 실패"); return; }
    setItems((prev) => prev.filter((t) => t.id !== id));
    setSavedIds((prev) => prev.filter((x) => x !== id));
  }

  if (loading) return <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      <div className="flex flex-col gap-2 mb-3">
        {items.map((t, idx) =>
          editId === t.id ? (
            <TrendForm
              key={t.id}
              initial={{ ...t }}
              onSave={(d) => update(t.id, d)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <div key={t.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
              {/* 순서 이동 버튼 */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▼
                </button>
              </div>
              {t.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image_url} alt={t.title} className="w-20 h-12 object-cover rounded-lg shrink-0 bg-gray-200" />
              ) : (
                <div className="w-20 h-12 rounded-lg bg-gray-200 shrink-0 flex items-center justify-center">
                  <span className="text-gray-400 text-xs">없음</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                {t.description && <p className="text-xs text-gray-400 truncate mt-0.5">{t.description}</p>}
                {t.blog_link && (
                  <a href={t.blog_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-periwinkle hover:underline">
                    블로그 →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditId(t.id)} className="text-xs text-gray-400 hover:text-periwinkle px-1.5 py-1 rounded hover:bg-gray-100">
                  수정
                </button>
                <button onClick={() => remove(t.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 rounded hover:bg-red-50">
                  삭제
                </button>
              </div>
            </div>
          )
        )}
        {items.length === 0 && !showForm && (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400">등록된 배너가 없습니다.</p>
          </div>
        )}
      </div>
      {/* 순서 저장 버튼 */}
      {orderChanged && !showForm && (
        <button
          onClick={saveOrder}
          disabled={savingOrder}
          className="w-full py-2.5 mb-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-60 transition-colors"
        >
          {savingOrder ? "저장 중..." : "순서 저장"}
        </button>
      )}
      {showForm ? (
        <TrendForm onSave={create} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 배너 추가
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   팝업(PopupCampaign) 섹션
═══════════════════════════════════════════════════ */
const toLocalDT = (iso: string) => iso ? iso.slice(0, 16).replace(" ", "T") : "";
const EMPTY_POPUP = { title: "", image_url: "", instagram_url: "", start_at: "", end_at: "", is_active: true, display_order: 0 };

function PopupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<PopupItem>;
  onSave: (data: typeof EMPTY_POPUP) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    ...EMPTY_POPUP,
    ...initial,
    image_url: initial?.image_url ?? "",
    start_at: initial?.start_at ? toLocalDT(initial.start_at) : "",
    end_at: initial?.end_at ? toLocalDT(initial.end_at) : "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (k: keyof typeof EMPTY_POPUP, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title.trim()) { setErr("제목을 입력해주세요."); return; }
    if (!form.image_url) { setErr("이미지를 업로드해주세요."); return; }
    if (!form.start_at || !form.end_at) { setErr("기간을 입력해주세요."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl">
      <ImagePickerField value={form.image_url} onChange={(u) => set("image_url", u)} uploadType="popup" />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="제목 *"
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="인스타그램 링크 (https://...)"
        value={form.instagram_url}
        onChange={(e) => set("instagram_url", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">시작일시 *</label>
          <input
            type="datetime-local"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            value={form.start_at}
            onChange={(e) => set("start_at", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">종료일시 *</label>
          <input
            type="datetime-local"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            value={form.end_at}
            onChange={(e) => set("end_at", e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4 accent-periwinkle" />
          <span className="text-xs text-gray-600">활성화</span>
        </label>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">노출 순서</label>
          <input
            type="number"
            className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            value={form.display_order}
            onChange={(e) => set("display_order", Number(e.target.value))}
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function PopupSection() {
  const [items, setItems] = useState<PopupItem[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const orderChanged = JSON.stringify(items.map((p) => p.id)) !== JSON.stringify(savedIds);

  useEffect(() => {
    fetch("/api/dashboard/admin/popup-campaigns")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setItems(list);
        setSavedIds(list.map((p: PopupItem) => p.id));
      })
      .catch(() => setErr("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    setItems((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    setErr("");
    try {
      await Promise.all(
        items.map((p, idx) =>
          fetch(`/api/dashboard/admin/popup-campaigns/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: idx }),
          })
        )
      );
      setItems((prev) => prev.map((p, idx) => ({ ...p, display_order: idx })));
      setSavedIds(items.map((p) => p.id));
    } catch {
      setErr("순서 저장에 실패했습니다.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function create(data: typeof EMPTY_POPUP) {
    const res = await fetch("/api/dashboard/admin/popup-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, display_order: items.length }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setItems((prev) => [...prev, d]);
    setSavedIds((prev) => [...prev, d.id]);
    setShowForm(false);
  }

  async function update(id: number, data: typeof EMPTY_POPUP) {
    const res = await fetch(`/api/dashboard/admin/popup-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "수정 실패");
    setItems((prev) => prev.map((p) => (p.id === id ? d : p)));
    setEditId(null);
  }

  async function remove(id: number) {
    if (!confirm("팝업을 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/admin/popup-campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) { setErr("삭제 실패"); return; }
    setItems((prev) => prev.filter((p) => p.id !== id));
    setSavedIds((prev) => prev.filter((x) => x !== id));
  }

  async function toggleActive(p: PopupItem) {
    const res = await fetch(`/api/dashboard/admin/popup-campaigns/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    const d = await res.json();
    if (res.ok) setItems((prev) => prev.map((x) => (x.id === p.id ? d : x)));
  }

  const fmtDate = (iso: string) => iso ? iso.slice(0, 10) : "";
  const now = new Date().toISOString();

  if (loading) return <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      <div className="flex flex-col gap-2 mb-3">
        {items.map((p, idx) =>
          editId === p.id ? (
            <PopupForm
              key={p.id}
              initial={p}
              onSave={(d) => update(p.id, d)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
              {/* 순서 이동 버튼 */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▼
                </button>
              </div>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt={p.title} className="w-20 h-12 object-cover rounded-lg shrink-0 bg-gray-200" />
              ) : (
                <div className="w-20 h-12 rounded-lg bg-gray-200 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                  {p.end_at < now ? (
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">종료</span>
                  ) : p.is_active ? (
                    <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full shrink-0">활성</span>
                  ) : (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">비활성</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400">{fmtDate(p.start_at)} ~ {fmtDate(p.end_at)}</p>
                {p.instagram_url && (
                  <a href={p.instagram_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-periwinkle hover:underline">
                    인스타그램 →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(p)}
                  className={`text-xs px-1.5 py-1 rounded transition-colors ${
                    p.is_active ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"
                  }`}
                >
                  {p.is_active ? "중단" : "활성"}
                </button>
                <button onClick={() => setEditId(p.id)} className="text-xs text-gray-400 hover:text-periwinkle px-1.5 py-1 rounded hover:bg-gray-100">
                  수정
                </button>
                <button onClick={() => remove(p.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 rounded hover:bg-red-50">
                  삭제
                </button>
              </div>
            </div>
          )
        )}
        {items.length === 0 && !showForm && (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400">등록된 팝업이 없습니다.</p>
          </div>
        )}
      </div>
      {/* 순서 저장 버튼 */}
      {orderChanged && !showForm && (
        <button
          onClick={saveOrder}
          disabled={savingOrder}
          className="w-full py-2.5 mb-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-60 transition-colors"
        >
          {savingOrder ? "저장 중..." : "순서 저장"}
        </button>
      )}
      {showForm ? (
        <PopupForm onSave={create} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 팝업 추가
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 알림 관리
═══════════════════════════════════════════════════ */
const TEST_KAKAO_ID = 4424485763;

interface PushNotification {
  id: number;
  title: string;
  body: string;
  content: string;
  scheduled_time: string;
  sent: boolean;
  sent_at: string | null;
  target_kakao_ids: number[] | null;
  test_only: boolean;
  created_at: string;
}

function fmtKST(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// KST 기준 현재 시각을 datetime-local input 기본값으로 변환
function nowKSTInput() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function NotificationsTab() {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 폼 상태
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scheduledTime, setScheduledTime] = useState(nowKSTInput);
  const [testOnly, setTestOnly] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState("");

  // 즉시발송 상태
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<{ id: number; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/dashboard/admin/notifications");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "불러오기 실패");
      setNotifications(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!title.trim()) { setFormErr("제목을 입력하세요."); return; }
    setSubmitting(true);
    setFormErr("");
    try {
      // datetime-local 값은 KST 기준이므로 UTC로 변환
      const kstDate = new Date(scheduledTime + ":00");
      const utcIso = new Date(kstDate.getTime() - 9 * 60 * 60 * 1000).toISOString();
      const res = await fetch("/api/dashboard/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, scheduled_time: utcIso, test_only: testOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "생성 실패");
      setNotifications((prev) => [data, ...prev]);
      setTitle("");
      setBody("");
      setScheduledTime(nowKSTInput());
    } catch (e: unknown) {
      setFormErr(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("이 알림 예약을 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/admin/notifications/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } else {
      const d = await res.json();
      alert(d?.detail ?? "삭제 실패");
    }
  }

  async function sendNow(id: number) {
    setSendingId(id);
    setSendResult(null);
    try {
      const res = await fetch(`/api/dashboard/admin/notifications/${id}/send-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "발송 실패");
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, sent: true, sent_at: data.notification?.sent_at ?? null } : n
        )
      );
      setSendResult({ id, msg: `발송 완료 — 성공 ${data.success}건 / 실패 ${data.failure}건 (토큰 ${data.tokens_tried}개)` });
    } catch (e: unknown) {
      setSendResult({ id, msg: `오류: ${e instanceof Error ? e.message : "발송 실패"}` });
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 알림 작성 폼 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-700">알림 예약</h2>

        {/* 테스트 모드 배너 */}
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
          testOnly ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-red-50 text-red-600 border border-red-200"
        }`}>
          <span>{testOnly ? `🧪 테스트 모드 — 카카오 ID ${TEST_KAKAO_ID}에게만 발송됩니다` : "⚠️ 전체 발송 모드 — 앱 전체 사용자에게 발송됩니다"}</span>
          <button
            onClick={() => setTestOnly((v) => !v)}
            className={`ml-auto shrink-0 relative w-9 h-5 rounded-full transition-colors ${testOnly ? "bg-amber-400" : "bg-red-500"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${testOnly ? "translate-x-0.5" : "translate-x-4"}`} />
          </button>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">제목 *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="알림 제목"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">내용</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="알림 본문 내용 (선택)"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40 resize-none"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">발송 예약 시간 (KST)</label>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
          />
          <p className="text-[10px] text-gray-400 mt-1">Cloud Scheduler가 매 5분 주기로 예약된 알림을 자동 발송합니다.</p>
        </div>

        {formErr && <p className="text-xs text-red-500">{formErr}</p>}

        <button
          onClick={create}
          disabled={submitting}
          className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 disabled:opacity-60 transition-colors"
        >
          {submitting ? "예약 중..." : "알림 예약"}
        </button>
      </div>

      {/* 예약 목록 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">예약 / 발송 내역</h2>
          <button onClick={load} className="text-[10px] text-gray-400 hover:text-periwinkle">새로고침</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : err ? (
          <p className="text-xs text-red-500 px-4 py-4">{err}</p>
        ) : notifications.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">예약된 알림이 없습니다.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map((n) => (
              <div key={n.id} className={`px-4 py-3 ${n.sent ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {n.sent ? (
                        <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">발송됨</span>
                      ) : (
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">예약</span>
                      )}
                      {n.test_only ? (
                        <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">테스트</span>
                      ) : (
                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">전체발송</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">
                      예약: {fmtKST(n.scheduled_time)}
                      {n.sent_at && ` · 발송: ${fmtKST(n.sent_at)}`}
                    </p>
                    {/* 발송 결과 인라인 표시 */}
                    {sendResult?.id === n.id && (
                      <p className={`text-[10px] mt-1 ${sendResult.msg.startsWith("오류") ? "text-red-500" : "text-green-600"}`}>
                        {sendResult.msg}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!n.sent && (
                      <button
                        onClick={() => sendNow(n.id)}
                        disabled={sendingId === n.id}
                        className="text-[10px] px-2 py-1.5 bg-periwinkle text-white rounded-lg hover:bg-periwinkle/90 disabled:opacity-60 transition-colors font-semibold"
                      >
                        {sendingId === n.id ? "발송 중..." : "지금 발송"}
                      </button>
                    )}
                    {!n.sent && (
                      <button
                        onClick={() => remove(n.id)}
                        className="text-[10px] px-2 py-1 rounded-lg border border-gray-100 text-gray-300 hover:border-red-200 hover:text-red-400 transition-colors"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 배너 & 팝업
═══════════════════════════════════════════════════ */
function ContentTab() {
  return (
    <div className="flex flex-col gap-4">
      {/* 배너 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">배너</h2>
            <p className="text-xs text-gray-400 mt-0.5">앱 메인화면 슬라이드 · GET /trends/trend_list/</p>
          </div>
        </div>
        <div className="p-4">
          <BannerSection />
        </div>
      </div>
      {/* 팝업 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">팝업</h2>
            <p className="text-xs text-gray-400 mt-0.5">앱 실행 시 표시 · GET /trends/popup_campaigns/</p>
          </div>
        </div>
        <div className="p-4">
          <PopupSection />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 비밀번호 / 관리자 설정
═══════════════════════════════════════════════════ */
function SettingsTab() {
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
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">관리자 비밀번호</h2>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {msg && (
          <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
            {msg.text}
          </p>
        )}
        <button
          onClick={() => { setActiveForm(activeForm === "main" ? null : "main"); setMsg(null); }}
          className="text-left text-sm font-medium text-gray-700 py-2 flex items-center justify-between"
        >
          일반 비밀번호 변경
          <span className="text-gray-400 text-xs">{activeForm === "main" ? "▲" : "▶"}</span>
        </button>
        {activeForm === "main" && (
          <div className="flex flex-col gap-2 pb-2">
            {(["현재 비밀번호", "새 비밀번호", "새 비밀번호 확인"] as const).map((label, i) => {
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
            <button onClick={() => submit("main")} disabled={saving} className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}

        <hr className="border-gray-100" />

        <button
          onClick={() => { setActiveForm(activeForm === "secondary" ? null : "secondary"); setMsg(null); }}
          className="text-left text-sm font-medium text-gray-700 py-2 flex items-center justify-between"
        >
          2차 비밀번호 설정 (삭제 확인용)
          <span className="text-gray-400 text-xs">{activeForm === "secondary" ? "▲" : "▶"}</span>
        </button>
        {activeForm === "secondary" && (
          <div className="flex flex-col gap-2 pb-2">
            <input type="password" placeholder="현재 2차 비밀번호 (최초 설정 시 빈칸)" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            <input type="password" placeholder="새 2차 비밀번호" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            <input type="password" placeholder="새 2차 비밀번호 확인" value={form.next2} onChange={(e) => setForm((f) => ({ ...f, next2: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            <button onClick={() => submit("secondary")} disabled={saving} className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 식당 관리
═══════════════════════════════════════════════════ */
function RestaurantsTab() {
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
    setRestaurants((prev) => prev.map((r) => (r.restaurant_id === next.restaurant_id ? next : r)));
  }

  function handleDeleted(id: number) {
    setRestaurants((prev) => prev.filter((r) => r.restaurant_id !== id));
  }

  return (
    <>
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
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
      <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
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
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
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

      {selected && (
        <RestaurantDrawer
          r={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════
   메인 페이지
═══════════════════════════════════════════════════ */
const TABS: { key: Tab; label: string }[] = [
  { key: "restaurants", label: "식당 관리" },
  { key: "content", label: "배너 & 팝업" },
  { key: "notifications", label: "알림" },
  { key: "settings", label: "관리자 설정" },
];

export default function AdminHomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("restaurants");

  return (
    <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto">
      {/* 탭 헤더 */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === key
                ? "bg-white text-navy shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === "restaurants" && <RestaurantsTab />}
      {activeTab === "content" && <ContentTab />}
      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}
