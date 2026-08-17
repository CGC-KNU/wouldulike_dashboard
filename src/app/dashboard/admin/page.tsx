"use client";

import { useEffect, useState, useCallback } from "react";
import SatelliteTab from "./satellite/SatelliteTab";
import BannerLabComposer from "./bannerlab/BannerLabComposer";

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
type Tab = "restaurants" | "content" | "notifications" | "satellite" | "settings";

type Department = "SUPERADMIN" | "ADMIN" | "MARKETING" | "SALES";
type SatelliteRole = "LEAD" | "MEMBER";

interface Permissions {
  can_restaurants: boolean;
  can_content: boolean;
  can_marketing: boolean;
  can_satellite: boolean;
}

interface AdminMe {
  username: string;
  display_name: string;
  department: Department;
  department_label: string;
  satellite_role: SatelliteRole;
  is_superadmin: boolean;
  is_admin: boolean;
  is_marketing: boolean;
  account_id: number | null;
  kakao_id: number | null;
  permissions: Permissions;
}

interface CampaignApp {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  week_start: string;
  week_end: string;
  coupon_title: string;
  coupon_subtitle: string | null;
  coupon_notes: string | null;
  benefit_type: string;
  benefit_value: string | null;
  benefit_label: string;
  campaign_description: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}
interface WeekGroup {
  week_start: string;
  week_end: string;
  max_slots: number;
  occupied_slots: number;
  available_slots: number;
  applications: CampaignApp[];
}
interface WeekConfig {
  id: number;
  week_start: string | null;
  max_slots: number;
  is_default: boolean;
}
type PlanLimits = { FREE: number; BOOST: number; CONTENT: number };

/* ─── 상수 ─── */
const TIER_ORDER: Record<string, number> = { CONTENT: 3, BOOST: 2, FREE: 1 };
const TIER_STYLE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600",
  BOOST: "bg-amber-100 text-amber-700",
  CONTENT: "bg-indigo-100 text-indigo-700",
};
const CAMP_STATUS_LABEL: Record<string, string> = {
  PENDING: "검토 중", APPROVED: "승인", REJECTED: "반려",
  REJECTED_HOLD: "반려(재신청)", CANCELLED: "취소",
};
const CAMP_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-600",
  REJECTED_HOLD: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-gray-100 text-gray-500",
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
  const [campaignCount, setCampaignCount] = useState<number | null>(null);
  const [deleteStep, setDeleteStep] = useState<null | "confirm1" | "confirm2">(null);
  const [secondaryPw, setSecondaryPw] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [actionPending, setActionPending] = useState(false);

  // 홍보물 관리
  const [posterUrl, setPosterUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [promoLoading, setPromoLoading] = useState(true);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoSaved, setPromoSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/dashboard/stats?rid=${r.restaurant_id}`)
      .then((res) => res.json())
      .then((data) => setStats(data.stats ?? null))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
    fetch(`/api/dashboard/admin/campaigns/history?rid=${r.restaurant_id}`)
      .then((res) => res.json())
      .then((data: unknown[]) => setCampaignCount(Array.isArray(data) ? data.length : null))
      .catch(() => setCampaignCount(null));
    fetch(`/api/dashboard/admin/promo-files/${r.restaurant_id}`)
      .then((res) => res.json())
      .then((data: { poster_url?: string; qr_url?: string }) => {
        setPosterUrl(data.poster_url ?? "");
        setQrUrl(data.qr_url ?? "");
      })
      .catch(() => {})
      .finally(() => setPromoLoading(false));
  }, [r.restaurant_id]);

  async function savePromoFiles() {
    setPromoSaving(true);
    setPromoSaved(false);
    const res = await fetch(`/api/dashboard/admin/promo-files/${r.restaurant_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poster_url: posterUrl, qr_url: qrUrl }),
    });
    if (res.ok) setPromoSaved(true);
    setPromoSaving(false);
  }

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
                {campaignCount !== null && (
                  <div className="bg-white rounded-lg p-3 col-span-2">
                    <p className="text-[10px] text-gray-400">캠페인 신청 이력</p>
                    <p className="text-xl font-bold text-navy mt-0.5">
                      {campaignCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-1">통계를 불러오지 못했습니다.</p>
            )}
          </div>

          {/* ── 홍보물 파일 관리 ── */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500">홍보물 파일</p>
              {!promoLoading && (
                <div className="flex items-center gap-2">
                  {(posterUrl || qrUrl) && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">설정됨</span>
                  )}
                  {promoSaved && (
                    <span className="text-[10px] text-periwinkle">저장됨 ✓</span>
                  )}
                </div>
              )}
            </div>
            {promoLoading ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">포스터 URL</label>
                  <input
                    type="url"
                    value={posterUrl}
                    onChange={(e) => { setPosterUrl(e.target.value); setPromoSaved(false); }}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-periwinkle transition-colors"
                  />
                  {posterUrl && (
                    <a href={posterUrl} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-periwinkle mt-0.5 inline-block hover:underline">
                      미리보기 →
                    </a>
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">QR 스티커 URL</label>
                  <input
                    type="url"
                    value={qrUrl}
                    onChange={(e) => { setQrUrl(e.target.value); setPromoSaved(false); }}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-periwinkle transition-colors"
                  />
                  {qrUrl && (
                    <a href={qrUrl} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-periwinkle mt-0.5 inline-block hover:underline">
                      미리보기 →
                    </a>
                  )}
                </div>
                <button
                  onClick={savePromoFiles}
                  disabled={promoSaving}
                  className="mt-1 w-full py-2 rounded-lg bg-periwinkle text-white text-xs font-bold hover:bg-navy transition-colors disabled:opacity-60"
                >
                  {promoSaving ? "저장 중..." : "홍보물 URL 저장"}
                </button>
              </div>
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

/* ═══════════════════════════════════════════════════
   식당 알림 캘린더 패널 (관리자)
═══════════════════════════════════════════════════ */
interface RestaurantSchedule {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  date: string;
  slot: "noon" | "evening";
  content: string;
  scheduled_datetime: string;
  sent: boolean;
  sent_at: string | null;
}

const R_SLOT_LABEL: Record<string, string> = { noon: "정오 12:00", evening: "저녁 18:00" };
/* ═══════════════════════════════════════════════════
   캠페인 주 상세 드로어
═══════════════════════════════════════════════════ */
function WeekDetailDrawer({
  week,
  onClose,
  onAction,
}: {
  week: WeekGroup;
  onClose: () => void;
  onAction: (id: number, action: string, notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [acting, setActing] = useState<number | null>(null);

  function getNote(id: number) { return notes[id] ?? ""; }
  function setNote(id: number, v: string) { setNotes((prev) => ({ ...prev, [id]: v })); }

  async function act(id: number, action: string) {
    setActing(id);
    await onAction(id, action, getNote(id));
    setActing(null);
  }

  function fmtMD(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-navy">
                {fmtMD(week.week_start)} ~ {fmtMD(week.week_end)}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {week.occupied_slots}/{week.max_slots} 슬롯 · 신청 {week.applications.length}건
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          {week.applications.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">이 주의 캠페인 신청이 없습니다</p>
          ) : (
            <div className="flex flex-col gap-3">
              {week.applications.map((app) => (
                <div key={app.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-sm font-bold text-gray-800">{app.restaurant_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{app.coupon_title}</p>
                      <p className="text-xs text-periwinkle mt-0.5">{app.benefit_label}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${CAMP_STATUS_STYLE[app.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {CAMP_STATUS_LABEL[app.status] ?? app.status}
                    </span>
                  </div>

                  {app.campaign_description && (
                    <p className="text-xs text-gray-500 mb-2">{app.campaign_description}</p>
                  )}
                  {app.admin_notes && (
                    <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                      관리자 메모: {app.admin_notes}
                    </p>
                  )}

                  {app.status === "PENDING" && (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea
                        value={getNote(app.id)}
                        onChange={(e) => setNote(app.id, e.target.value)}
                        placeholder="관리자 메모 (선택)"
                        rows={2}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-periwinkle/40 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => act(app.id, "approve")}
                          disabled={acting === app.id}
                          className="flex-1 py-2 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors disabled:opacity-60"
                        >
                          {acting === app.id ? "..." : "승인"}
                        </button>
                        <button
                          onClick={() => act(app.id, "reject_hold")}
                          disabled={acting === app.id}
                          className="flex-1 py-2 rounded-lg bg-orange-400 text-white text-xs font-bold hover:bg-orange-500 transition-colors disabled:opacity-60"
                        >
                          {acting === app.id ? "..." : "반려(슬롯유지)"}
                        </button>
                        <button
                          onClick={() => act(app.id, "reject")}
                          disabled={acting === app.id}
                          className="flex-1 py-2 rounded-lg bg-red-400 text-white text-xs font-bold hover:bg-red-500 transition-colors disabled:opacity-60"
                        >
                          {acting === app.id ? "..." : "반려"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════
   캠페인 캘린더 패널
═══════════════════════════════════════════════════ */
function CampaignCalendarPanel() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<WeekGroup | null>(null);

  // 설정
  const [defaultSlots, setDefaultSlots] = useState<number | null>(null);
  const [editSlots, setEditSlots] = useState("");
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null);
  const [editLimits, setEditLimits] = useState<PlanLimits>({ FREE: 0, BOOST: 0, CONTENT: 0 });
  const [savingSlots, setSavingSlots] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadWeeks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/admin/campaigns?year=${year}&month=${month}`);
      if (res.ok) setWeeks(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadWeeks(); }, [loadWeeks]);

  useEffect(() => {
    fetch("/api/dashboard/admin/campaigns/week-config")
      .then((r) => r.json())
      .then((configs: WeekConfig[]) => {
        const def = configs.find((c) => c.is_default);
        if (def) { setDefaultSlots(def.max_slots); setEditSlots(String(def.max_slots)); }
      })
      .catch(() => {});
    fetch("/api/dashboard/admin/campaigns/plan-limits")
      .then((r) => r.json())
      .then((lim: PlanLimits) => { setPlanLimits(lim); setEditLimits(lim); })
      .catch(() => {});
  }, []);

  async function handleAction(appId: number, action: string, adminNotes: string) {
    const res = await fetch(`/api/dashboard/admin/campaigns/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, admin_notes: adminNotes }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d?.detail ?? "처리 실패");
      return;
    }
    const updated: CampaignApp = await res.json();
    setWeeks((prev) =>
      prev.map((w) => ({
        ...w,
        applications: w.applications.map((a) => (a.id === updated.id ? updated : a)),
      }))
    );
    setSelectedWeek((prev) =>
      prev
        ? { ...prev, applications: prev.applications.map((a) => (a.id === updated.id ? updated : a)) }
        : null
    );
  }

  async function saveSlots() {
    setSavingSlots(true);
    const res = await fetch("/api/dashboard/admin/campaigns/week-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_slots: Number(editSlots) }),
    });
    setSavingSlots(false);
    if (res.ok) { setDefaultSlots(Number(editSlots)); alert("저장되었습니다."); }
    else { const d = await res.json(); alert(d?.detail ?? "저장 실패"); }
  }

  async function saveLimits() {
    setSavingLimits(true);
    const res = await fetch("/api/dashboard/admin/campaigns/plan-limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editLimits),
    });
    setSavingLimits(false);
    if (res.ok) { setPlanLimits(editLimits); alert("저장되었습니다."); }
    else { const d = await res.json(); alert(d?.detail ?? "저장 실패"); }
  }

  function prevMonth() { if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1); }

  function fmtMD(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  })();

  // 월 캘린더 주 배열 빌드 (월요일 시작)
  const calWeeks = (() => {
    const firstDay = new Date(year, month - 1, 1);
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalWeeks = Math.ceil((firstDayOfWeek + daysInMonth) / 7);
    const calStart = new Date(year, month - 1, 1 - firstDayOfWeek);
    const result: { date: Date; inMonth: boolean; dateStr: string }[][] = [];
    for (let w = 0; w < totalWeeks; w++) {
      const weekDays: { date: Date; inMonth: boolean; dateStr: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(calStart);
        dt.setDate(calStart.getDate() + w * 7 + d);
        const inMonth = dt.getMonth() + 1 === month && dt.getFullYear() === year;
        const ds = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
        weekDays.push({ date: dt, inMonth, dateStr: ds });
      }
      result.push(weekDays);
    }
    return result;
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* 월간 캘린더 */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
          <span className="text-sm font-bold text-gray-700">{year}년 {month}월 캠페인</span>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
        </div>

        {/* 요일 헤더 (월~일) */}
        <div className="grid grid-cols-7 mb-0.5">
          {["월","화","수","목","금","토","일"].map((d) => (
            <div key={d} className="text-[10px] text-center text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            {calWeeks.map((weekDays, wi) => {
              const weekStart = weekDays[0].dateStr;
              const w = weeks.find((g) => g.week_start === weekStart);
              const pendingCount = w?.applications.filter((a) => a.status === "PENDING").length ?? 0;
              const approvedCount = w?.applications.filter((a) => a.status === "APPROVED").length ?? 0;
              const isFull = w && w.available_slots === 0;

              let barCls = "bg-gray-50 border-gray-100 text-gray-400";
              if (pendingCount > 0) barCls = "bg-amber-50 border-amber-200 text-amber-700";
              else if (approvedCount > 0) barCls = "bg-green-50 border-green-200 text-green-600";
              else if (isFull) barCls = "bg-red-50 border-red-100 text-red-400";
              else if (w) barCls = "bg-periwinkle/5 border-periwinkle/20 text-gray-500";

              return (
                <div key={wi} className="mb-1">
                  {/* 날짜 셀 행 */}
                  <div className="grid grid-cols-7">
                    {weekDays.map(({ date, inMonth, dateStr }) => {
                      const isToday = dateStr === todayStr;
                      return (
                        <div key={dateStr} className="flex items-center justify-center h-7">
                          <span className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday
                              ? "bg-periwinkle text-white font-bold"
                              : inMonth
                              ? "text-gray-700"
                              : "text-gray-300"
                          }`}>
                            {date.getDate()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* 주 요약 바 */}
                  {w ? (
                    <button
                      onClick={() => setSelectedWeek(w)}
                      className={`w-full mb-2 rounded-lg px-2.5 py-1.5 text-left border flex items-center gap-2 hover:opacity-75 transition-opacity ${barCls}`}
                    >
                      <div className="flex items-center gap-0.5 shrink-0">
                        {Array.from({ length: w.max_slots }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${i < w.occupied_slots ? "bg-current opacity-70" : "bg-current opacity-20"}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-medium flex-1 truncate">
                        {w.applications.length === 0
                          ? `${w.available_slots}/${w.max_slots} 슬롯`
                          : `신청 ${w.applications.length}건${pendingCount > 0 ? ` · 검토 ${pendingCount}` : ""}${approvedCount > 0 ? ` · 승인 ${approvedCount}` : ""} · ${w.occupied_slots}/${w.max_slots}슬롯`}
                      </span>
                      {w.applications.length > 0 && <span className="text-[10px] opacity-50 shrink-0">›</span>}
                    </button>
                  ) : (
                    <div className="mb-2 h-7" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 캠페인 설정 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between"
        >
          <span className="text-sm font-semibold text-gray-700">캠페인 설정</span>
          <span className="text-gray-400 text-xs">{settingsOpen ? "▲" : "▼"}</span>
        </button>
        {settingsOpen && (
          <div className="px-4 pb-4 flex flex-col gap-4 border-t border-gray-50">
            {/* 기본 슬롯 수 */}
            <div className="pt-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">주당 최대 슬롯 수 (기본값)</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={editSlots}
                  onChange={(e) => setEditSlots(e.target.value)}
                  className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
                />
                <span className="text-xs text-gray-400">슬롯 / 주</span>
                <button
                  onClick={saveSlots}
                  disabled={savingSlots}
                  className="ml-auto px-3 py-1.5 bg-periwinkle text-white text-xs font-semibold rounded-lg hover:bg-navy transition-colors disabled:opacity-60"
                >
                  {savingSlots ? "저장 중..." : "저장"}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                현재: {defaultSlots !== null ? `${defaultSlots}슬롯` : "—"} · 진행 중인 주는 변경 불가
              </p>
            </div>

            {/* 플랜별 월간 한도 */}
            <div className="border-t border-gray-50 pt-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">플랜별 월간 캠페인 신청 한도</p>
              <div className="flex flex-col gap-2">
                {(["FREE", "BOOST", "CONTENT"] as const).map((plan) => (
                  <div key={plan} className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-16 ${
                      plan === "FREE" ? "text-gray-500" : plan === "BOOST" ? "text-amber-600" : "text-indigo-600"
                    }`}>
                      {plan}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={editLimits[plan]}
                      onChange={(e) => setEditLimits((prev) => ({ ...prev, [plan]: Number(e.target.value) }))}
                      className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
                    />
                    <span className="text-xs text-gray-400">건/월</span>
                    {planLimits && planLimits[plan] !== editLimits[plan] && (
                      <span className="text-[10px] text-amber-500">변경됨</span>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={saveLimits}
                disabled={savingLimits}
                className="mt-3 w-full py-2 bg-periwinkle text-white text-xs font-semibold rounded-lg hover:bg-navy transition-colors disabled:opacity-60"
              >
                {savingLimits ? "저장 중..." : "한도 저장"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 주 상세 드로어 */}
      {selectedWeek && (
        <WeekDetailDrawer
          week={selectedWeek}
          onClose={() => setSelectedWeek(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}

const R_SLOT_DOT:   Record<string, string> = { noon: "bg-amber-400", evening: "bg-indigo-400" };
const R_SLOT_BG:    Record<string, string> = { noon: "bg-amber-50 text-amber-700", evening: "bg-indigo-50 text-indigo-700" };
const DAY_KO2 = ["일", "월", "화", "수", "목", "금", "토"];

function RestaurantCalendarPanel() {
  const today = new Date();
  const [year, setYear]       = useState(today.getFullYear());
  const [month, setMonth]     = useState(today.getMonth() + 1);
  const [schedules, setSchedules] = useState<RestaurantSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/admin/restaurant-notifications?year=${year}&month=${month}`);
      if (res.ok) setSchedules(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); }

  async function deleteSchedule(id: number) {
    if (!confirm("이 식당 알림 예약을 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/admin/restaurant-notifications/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setSchedules(prev => prev.filter(s => s.id !== id));
    } else {
      const d = await res.json();
      alert(d?.detail ?? "삭제 실패");
    }
  }

  // 월 그리드 계산
  const firstDay     = new Date(year, month - 1, 1).getDay();
  const daysInMonth  = new Date(year, month, 0).getDate();
  const totalCells   = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const dateStr = (d: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const getSched = (d: number, slot: "noon" | "evening") =>
    schedules.find(s => s.date === dateStr(d) && s.slot === slot);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl shadow-sm p-4">
        {/* 월 네비 */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
          <span className="text-sm font-bold text-gray-700">{year}년 {month}월</span>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
        </div>
        {/* 범례 */}
        <div className="flex gap-4 mb-3">
          {(["noon", "evening"] as const).map(slot => (
            <div key={slot} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${R_SLOT_DOT[slot]}`} />
              <span className="text-xs text-gray-500">{R_SLOT_LABEL[slot]}</span>
            </div>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_KO2.map(d => (
                <div key={d} className="text-[10px] text-center text-gray-400 font-medium py-1">{d}</div>
              ))}
            </div>
            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: totalCells }, (_, i) => {
                const day = i - firstDay + 1;
                if (day < 1 || day > daysInMonth) return <div key={i} className="min-h-[60px]" />;
                const ds     = dateStr(day);
                const isToday = ds === todayStr;
                const isPast  = ds < todayStr;
                const noon = getSched(day, "noon");
                const eve  = getSched(day, "evening");
                return (
                  <div key={i} className={`border border-gray-100 rounded-lg p-1 min-h-[60px] ${isPast ? "bg-gray-50" : "bg-white"}`}>
                    <div className={`text-[10px] font-semibold mb-1 ${isToday ? "text-periwinkle" : isPast ? "text-gray-300" : "text-gray-600"}`}>
                      {day}
                    </div>
                    {/* 정오 */}
                    {noon ? (
                      <div className={`text-[8px] rounded px-1 py-0.5 mb-0.5 flex items-center gap-0.5 ${noon.sent ? "bg-gray-100 text-gray-400" : "bg-amber-50 text-amber-700"}`}>
                        <span className="truncate flex-1">{noon.restaurant_name}</span>
                        {!noon.sent && <button onClick={() => deleteSchedule(noon.id)} className="shrink-0 text-red-400 hover:text-red-600">×</button>}
                      </div>
                    ) : <div className="h-4 mb-0.5" />}
                    {/* 저녁 */}
                    {eve ? (
                      <div className={`text-[8px] rounded px-1 py-0.5 flex items-center gap-0.5 ${eve.sent ? "bg-gray-100 text-gray-400" : "bg-indigo-50 text-indigo-700"}`}>
                        <span className="truncate flex-1">{eve.restaurant_name}</span>
                        {!eve.sent && <button onClick={() => deleteSchedule(eve.id)} className="shrink-0 text-red-400 hover:text-red-600">×</button>}
                      </div>
                    ) : <div className="h-4" />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 예약 리스트 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{month}월 식당 알림 예약 ({schedules.length}건)</h3>
          <button onClick={load} className="text-[10px] text-gray-400 hover:text-periwinkle">새로고침</button>
        </div>
        {schedules.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">예약된 식당 알림이 없습니다</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {[...schedules]
              .sort((a, b) => new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime())
              .map(s => (
                <div key={s.id} className="px-4 py-3 flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${s.sent ? "bg-gray-300" : R_SLOT_DOT[s.slot]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-0.5">{s.date} · {R_SLOT_LABEL[s.slot]}</p>
                    <p className="text-sm font-semibold text-gray-800">{s.restaurant_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.content}</p>
                  </div>
                  <div className="shrink-0">
                    {s.sent ? (
                      <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">발송됨</span>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${R_SLOT_BG[s.slot]}`}>예약</span>
                        <button onClick={() => deleteSchedule(s.id)} className="text-[10px] text-red-400 hover:text-red-600">삭제</button>
                      </div>
                    )}
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
   탭: 알림 (푸시 알림 + 식당 알림 캘린더)
═══════════════════════════════════════════════════ */
function MarketingTab() {
  const [subTab, setSubTab] = useState<"campaign" | "restaurant" | "push">("campaign");
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 푸시 알림 2차 비번 잠금
  const [pushUnlocked, setPushUnlocked] = useState(false);
  const [pushSecPw, setPushSecPw] = useState("");
  const [pushVerifying, setPushVerifying] = useState(false);
  const [pushVerifyErr, setPushVerifyErr] = useState("");

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

  // 푸시 알림은 잠금 해제 후에만 로드
  useEffect(() => { if (pushUnlocked) load(); }, [pushUnlocked, load]);

  async function verifyPush() {
    if (!pushSecPw) { setPushVerifyErr("2차 비밀번호를 입력해주세요."); return; }
    setPushVerifying(true); setPushVerifyErr("");
    const res = await fetch("/api/dashboard/admin/verify-secondary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pushSecPw }),
    });
    const data = await res.json();
    setPushVerifying(false);
    if (data.valid) {
      setPushUnlocked(true);
      setPushSecPw("");
    } else if (data.not_set) {
      setPushVerifyErr("2차 비밀번호가 설정되지 않았습니다. 서버 환경변수 ADMIN_SECONDARY_PASSWORD를 설정해주세요.");
    } else {
      setPushVerifyErr(data.detail ?? "인증 실패");
    }
  }

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
    <div className="flex flex-col gap-4">
      {/* 서브탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
        {([
          { key: "campaign", label: "캠페인 캘린더" },
          { key: "restaurant", label: "식당 알림" },
          { key: "push", label: "푸시 알림" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === key ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "restaurant" && <RestaurantCalendarPanel />}
      {subTab === "campaign" && <CampaignCalendarPanel />}

      {subTab === "push" && (!pushUnlocked ? (
        <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🔒</span>
            <p className="text-sm font-semibold text-gray-700">푸시 알림</p>
          </div>
          <p className="text-xs text-gray-500">접근하려면 2차 비밀번호를 입력하세요.</p>
          {pushVerifyErr && <p className="text-xs text-red-500">{pushVerifyErr}</p>}
          <div className="flex gap-2">
            <input
              type="password"
              value={pushSecPw}
              onChange={(e) => setPushSecPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") verifyPush(); }}
              placeholder="2차 비밀번호"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            />
            <button
              onClick={verifyPush}
              disabled={pushVerifying}
              className="px-4 py-2 bg-periwinkle text-white text-xs font-semibold rounded-lg hover:bg-navy transition-colors disabled:opacity-60"
            >
              {pushVerifying ? "확인 중..." : "인증"}
            </button>
          </div>
        </div>
      ) : <div className="flex flex-col gap-5">
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
      </div>)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 배너 & 팝업
═══════════════════════════════════════════════════ */
function ContentTab() {
  return (
    <div className="flex flex-col gap-4">
      {/* 배너 자동화 (배너랩) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">배너 자동화 (배너랩)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              사진+문구 조합을 자동 합성해 슬랙으로 발송 · Phase 1 (AI 배경생성 없음)
            </p>
          </div>
        </div>
        <div className="p-4">
          <BannerLabComposer />
        </div>
      </div>
      {/* 배너 (기존 수동 URL 등록) */}
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: "", next: "", next2: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submitMainPw() {
    if (form.next !== form.next2) { setMsg({ ok: false, text: "새 비밀번호가 일치하지 않습니다." }); return; }
    if (form.next.length < 4) { setMsg({ ok: false, text: "4자 이상 입력해주세요." }); return; }
    setSaving(true); setMsg(null);
    const res = await fetch("/api/dashboard/admin/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "main", current_password: form.current, new_password: form.next }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ ok: true, text: "변경되었습니다." });
      setForm({ current: "", next: "", next2: "" });
      setOpen(false);
    } else {
      setMsg({ ok: false, text: data.detail ?? "변경에 실패했습니다." });
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 로그인 비밀번호 변경 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">로그인 비밀번호</h2>
          <p className="text-xs text-gray-400 mt-0.5">슈퍼어드민 계정의 로그인 비밀번호를 변경합니다</p>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {msg && (
            <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
              {msg.text}
            </p>
          )}
          <button
            onClick={() => { setOpen((v) => !v); setMsg(null); }}
            className="text-left text-sm font-medium text-gray-700 py-1 flex items-center justify-between"
          >
            비밀번호 변경
            <span className="text-gray-400 text-xs">{open ? "▲" : "▶"}</span>
          </button>
          {open && (
            <div className="flex flex-col gap-2 pt-1">
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
              <button onClick={submitMainPw} disabled={saving} className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 계정 관리 (2차 인증 필요) */}
      <AdminAccountsSection />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   대시보드 계정 관리 (슈퍼관리자 + 2차 인증)

   로그인은 카카오(신원) + 공용 관리자 비번(관문) 2단계라
   여기서 계정별 비밀번호를 다루지 않는다. 카카오 ID 가 곧 열쇠다.
═══════════════════════════════════════════════════ */
interface AdminAccountItem {
  username: string;
  kakao_id: number | null;
  display_name: string;
  department: Department;
  department_label: string;
  satellite_role: SatelliteRole;
  weekly_quota: number;
  is_active: boolean;
  active_from: string | null;
  active_until: string | null;
  created_at: string;
}
interface DepartmentInfo {
  code: Department;
  label: string;
  used: number;
  max: number;
  permissions: Permissions;
}

const DEPT_CHIP: Record<Department, string> = {
  SUPERADMIN: "bg-navy text-white",
  ADMIN: "bg-periwinkle/15 text-periwinkle",
  MARKETING: "bg-gold/20 text-gold",
  SALES: "bg-emerald-100 text-emerald-700",
};
const DEPT_ORDER: Department[] = ["SUPERADMIN", "ADMIN", "MARKETING", "SALES"];
const PERM_FIELDS: { key: keyof Permissions; label: string }[] = [
  { key: "can_restaurants", label: "식당" },
  { key: "can_content", label: "배너" },
  { key: "can_marketing", label: "마케팅" },
  { key: "can_satellite", label: "세틀라이트" },
];

function AdminAccountsSection() {
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null);
  // 2차 인증
  const [unlocked, setUnlocked] = useState(false);
  const [secPw, setSecPw] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState("");
  // 목록
  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  // 신규 계정
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newKakao, setNewKakao] = useState("");
  const [newDept, setNewDept] = useState<Department>("ADMIN");
  const [newSatRole, setNewSatRole] = useState<SatelliteRole>("MEMBER");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  // 카카오 ID 편집
  const [kakaoTarget, setKakaoTarget] = useState<string | null>(null);
  const [kakaoValue, setKakaoValue] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/admin/me")
      .then((r) => r.json())
      .then((d) => setIsSuperadmin(!!d.is_superadmin))
      .catch(() => setIsSuperadmin(false));
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/admin/accounts");
      if (res.ok) {
        const d = await res.json();
        setAccounts(d.accounts ?? []);
        setDepartments(d.departments ?? []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (unlocked) loadAccounts(); }, [unlocked, loadAccounts]);

  async function verify2FA() {
    if (!secPw) { setVerifyErr("2차 비밀번호를 입력해주세요."); return; }
    setVerifying(true); setVerifyErr("");
    const res = await fetch("/api/dashboard/admin/verify-secondary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: secPw }),
    });
    const data = await res.json();
    setVerifying(false);
    if (data.valid) { setUnlocked(true); setSecPw(""); }
    else if (data.not_set) setVerifyErr("2차 비밀번호가 설정되지 않았습니다. 서버 환경변수 ADMIN_SECONDARY_PASSWORD를 설정해주세요.");
    else setVerifyErr(data.detail ?? "인증 실패");
  }

  async function create() {
    if (!newId.trim()) { setErr("내부 ID를 입력해주세요."); return; }
    setCreating(true); setErr("");
    const res = await fetch("/api/dashboard/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: newId.trim(),
        display_name: newName.trim(),
        kakao_id: newKakao.trim() || null,
        department: newDept,
        satellite_role: newSatRole,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setNewId(""); setNewName(""); setNewKakao("");
      await loadAccounts();
    } else setErr(data.detail ?? "생성 실패");
  }

  async function patchAccount(username: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/dashboard/admin/accounts/${username}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.detail ?? "변경 실패"); return false; }
    await loadAccounts();
    return true;
  }

  async function remove(username: string) {
    if (!confirm(`"${username}" 계정을 삭제할까요?`)) return;
    const res = await fetch(`/api/dashboard/admin/accounts/${username}`, { method: "DELETE" });
    if (res.ok || res.status === 204) loadAccounts();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.detail ?? "삭제 실패");
    }
  }

  async function saveKakaoId() {
    if (!kakaoTarget) return;
    const ok = await patchAccount(kakaoTarget, { kakao_id: kakaoValue.trim() || null });
    if (ok) { setKakaoTarget(null); setKakaoValue(""); }
  }

  async function togglePerm(dept: Department, field: keyof Permissions, next: boolean) {
    const res = await fetch(`/api/dashboard/admin/department-permissions/${dept}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: next }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.detail ?? "권한 변경 실패"); return; }
    setDepartments((prev) =>
      prev.map((x) => (x.code === dept ? { ...x, permissions: { ...x.permissions, [field]: next } } : x))
    );
  }

  if (isSuperadmin === null || !isSuperadmin) return null;

  const totalUsed = departments.reduce((s, q) => s + q.used, 0);
  const totalMax = departments.reduce((s, q) => s + q.max, 0);
  const isFull = (dept: Department) => {
    const q = departments.find((x) => x.code === dept);
    return q ? q.used >= q.max : false;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mt-4">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">구성원 · 권한 관리</h2>
          <p className="text-xs text-gray-400 mt-0.5">슈퍼관리자 전용 · 카카오 ID로 로그인</p>
        </div>
        <span className={`text-xs flex items-center gap-1 ${unlocked ? "text-green-500" : "text-gray-400"}`}>
          {unlocked ? `🔓 ${totalUsed}/${totalMax}` : "🔒 잠김"}
        </span>
      </div>

      {/* 2차 인증 게이트 */}
      {!unlocked ? (
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-500">구성원 명단과 직무별 권한을 관리하려면 2차 비밀번호를 입력하세요.</p>
          {verifyErr && <p className="text-xs text-red-500">{verifyErr}</p>}
          <div className="flex gap-2">
            <input
              type="password"
              value={secPw}
              onChange={(e) => setSecPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") verify2FA(); }}
              placeholder="2차 비밀번호"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            />
            <button onClick={verify2FA} disabled={verifying}
              className="px-4 py-2 bg-periwinkle text-white text-xs font-semibold rounded-lg hover:bg-navy transition-colors disabled:opacity-60">
              {verifying ? "확인 중..." : "인증"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 직무별 권한 */}
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-[11px] font-semibold text-gray-500 mb-2">직무별 접근 권한</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-400">
                    <th className="text-left font-semibold py-1 w-[84px]">직무</th>
                    {PERM_FIELDS.map((f) => (
                      <th key={f.key} className="font-semibold py-1">{f.label}</th>
                    ))}
                    <th className="font-semibold py-1 w-[48px]">인원</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.code} className="border-t border-gray-50">
                      <td className="py-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${DEPT_CHIP[d.code]}`}>
                          {d.label}
                        </span>
                      </td>
                      {PERM_FIELDS.map((f) => (
                        <td key={f.key} className="text-center py-1.5">
                          <input
                            type="checkbox"
                            checked={d.permissions[f.key]}
                            disabled={d.code === "SUPERADMIN"}
                            onChange={(e) => togglePerm(d.code, f.key, e.target.checked)}
                            className="w-3.5 h-3.5 accent-periwinkle cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                      <td className={`text-center py-1.5 text-[11px] ${d.used >= d.max ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
                        {d.used}/{d.max}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
              관리자 설정(이 화면)은 항상 슈퍼관리자 전용입니다. 슈퍼관리자 직무의 권한은 끌 수 없습니다.
            </p>
          </div>

          {/* 계정 목록 */}
          {loading ? (
            <div className="flex justify-center py-5"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>
          ) : accounts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-5">등록된 구성원이 없습니다</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {accounts.map((a) => (
                <div key={a.username} className="px-4 py-3 flex flex-col gap-2">
                  {/* 1행 — 이름 · 직무 · 상태 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      {a.display_name || a.username}
                    </span>
                    <span className="text-[11px] text-gray-400">{a.username}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${DEPT_CHIP[a.department]}`}>
                      {a.department_label}
                    </span>
                    {a.satellite_role === "LEAD" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-periwinkle/10 text-periwinkle">
                        세틀 리드
                      </span>
                    )}
                    {a.kakao_id == null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-50 text-red-500">
                        카카오 ID 없음
                      </span>
                    )}
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      a.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {a.is_active ? "활성" : "비활성"}
                    </span>
                  </div>

                  {/* 2행 — 카카오 ID */}
                  <button
                    onClick={() => { setKakaoTarget(a.username); setKakaoValue(a.kakao_id ? String(a.kakao_id) : ""); }}
                    className="text-left text-[11px] font-mono text-gray-500 hover:text-periwinkle w-fit"
                  >
                    카카오 {a.kakao_id ?? "— 미등록"} <span className="font-sans">✎</span>
                  </button>

                  {/* 3행 — 조작 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={a.department}
                      onChange={(e) => patchAccount(a.username, { department: e.target.value })}
                      className="text-[10px] text-gray-600 border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-periwinkle"
                    >
                      {DEPT_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {departments.find((x) => x.code === d)?.label ?? d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={a.satellite_role}
                      onChange={(e) => patchAccount(a.username, { satellite_role: e.target.value })}
                      className="text-[10px] text-gray-600 border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-periwinkle"
                    >
                      <option value="MEMBER">세틀 멤버</option>
                      <option value="LEAD">세틀 리드</option>
                    </select>
                    <label className="flex items-center gap-1 text-[10px] text-gray-400">
                      주
                      <input
                        type="number" min={0} max={20}
                        defaultValue={a.weekly_quota}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== a.weekly_quota) patchAccount(a.username, { weekly_quota: v });
                        }}
                        className="w-10 text-[10px] text-gray-600 border border-gray-200 rounded-lg px-1 py-1 text-center focus:outline-none focus:border-periwinkle"
                      />
                      건
                    </label>

                    <button
                      onClick={() => patchAccount(a.username, { is_active: !a.is_active })}
                      disabled={!a.is_active && a.kakao_id == null}
                      title={!a.is_active && a.kakao_id == null ? "카카오 ID를 먼저 등록하세요" : ""}
                      className={`ml-auto text-[10px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        a.is_active
                          ? "text-amber-500 border-amber-100 hover:border-amber-400"
                          : "text-green-500 border-green-100 hover:border-green-400"
                      }`}
                    >
                      {a.is_active ? "비활성화" : "활성화"}
                    </button>
                    {a.department !== "MARKETING" && a.department !== "SUPERADMIN" && (
                      <button
                        onClick={() => remove(a.username)}
                        className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg border border-red-100 hover:border-red-300"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 카카오 ID 편집 */}
          {kakaoTarget && (
            <div className="mx-4 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-2">
              <p className="text-xs font-semibold text-amber-700">{kakaoTarget} 카카오 ID</p>
              <input
                type="text"
                inputMode="numeric"
                value={kakaoValue}
                onChange={(e) => setKakaoValue(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") saveKakaoId(); }}
                placeholder="예: 4424485763 (비우면 로그인 차단)"
                className="w-full px-3 py-2 text-sm font-mono border border-amber-200 rounded-lg focus:outline-none bg-white"
              />
              <div className="flex gap-2">
                <button onClick={() => { setKakaoTarget(null); setKakaoValue(""); }}
                  className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 bg-white">취소</button>
                <button onClick={saveKakaoId}
                  className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold">저장</button>
              </div>
            </div>
          )}

          {/* 새 계정 추가 */}
          <div className="p-4 border-t border-gray-50 flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-gray-500">구성원 추가</p>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="내부 ID (영문)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            </div>
            <input
              value={newKakao}
              onChange={(e) => setNewKakao(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="카카오 ID (비우면 비활성 placeholder 로 생성)"
              inputMode="numeric"
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            />
            <div className="flex gap-2">
              <select value={newDept} onChange={(e) => setNewDept(e.target.value as Department)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle">
                {DEPT_ORDER.map((d) => (
                  <option key={d} value={d} disabled={isFull(d)}>
                    {departments.find((x) => x.code === d)?.label ?? d}{isFull(d) ? " (정원 초과)" : ""}
                  </option>
                ))}
              </select>
              <select value={newSatRole} onChange={(e) => setNewSatRole(e.target.value as SatelliteRole)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle">
                <option value="MEMBER">세틀라이트 멤버</option>
                <option value="LEAD">세틀라이트 리드</option>
              </select>
            </div>
            <button onClick={create} disabled={creating || isFull(newDept)}
              className="w-full py-2 bg-periwinkle text-white text-xs font-semibold rounded-lg hover:bg-navy transition-colors disabled:opacity-60">
              {creating ? "추가 중..." : "구성원 추가"}
            </button>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              비밀번호는 설정하지 않습니다. 카카오로 로그인한 뒤 팀 공용 관리자 비번을 입력하는 방식이라,
              카카오 ID 가 등록돼 있고 계정이 활성이면 바로 접속됩니다.
            </p>
          </div>
        </>
      )}
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
      <div className="grid grid-cols-1 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400">전체 식당</p>
          <p className="text-2xl font-bold text-navy mt-1">{loading ? "—" : restaurants.length}</p>
        </div>
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
/**
 * 탭 노출은 직무별 권한(DepartmentPermission)으로 결정된다.
 * 관리자 설정만은 권한 설정과 무관하게 슈퍼관리자 전용이다 —
 * 권한 설정을 권한 설정으로 열 수 있으면 누구나 자기 권한을 올릴 수 있다.
 */
const TABS: { key: Tab; label: string; allow: (me: AdminMe) => boolean }[] = [
  { key: "restaurants", label: "식당 관리", allow: (me) => me.permissions.can_restaurants },
  { key: "content", label: "배너 & 팝업", allow: (me) => me.permissions.can_content },
  { key: "notifications", label: "마케팅", allow: (me) => me.permissions.can_marketing },
  { key: "satellite", label: "세틀라이트", allow: (me) => me.permissions.can_satellite },
  { key: "settings", label: "관리자 설정", allow: (me) => me.is_superadmin },
];

const FALLBACK_ME: AdminMe = {
  username: "",
  display_name: "",
  department: "MARKETING",
  department_label: "마케팅",
  satellite_role: "MEMBER",
  is_superadmin: false,
  is_admin: false,
  is_marketing: true,
  account_id: null,
  kakao_id: null,
  permissions: {
    can_restaurants: false,
    can_content: false,
    can_marketing: false,
    can_satellite: true,
  },
};

export default function AdminHomePage() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AdminMe | null) => {
        if (!d) {
          // 신원을 못 읽으면 최소 권한으로 취급한다
          setMe(FALLBACK_ME);
          return;
        }
        // 구 토큰 호환 — permissions 가 없으면 is_admin/is_marketing 으로 역산
        if (!d.permissions) {
          d.permissions = {
            can_restaurants: !!d.is_admin,
            can_content: !!d.is_admin,
            can_marketing: !!d.is_admin,
            can_satellite: !!d.is_marketing,
          };
        }
        setMe(d);
      })
      .catch(() => setMe(FALLBACK_ME));
  }, []);

  // 권한이 정해지면 기본 탭 결정 — ?tab= 이 있으면 그쪽을 우선한다
  useEffect(() => {
    if (!me || activeTab) return;
    const wanted = new URL(window.location.href).searchParams.get("tab") as Tab | null;
    const allowed = TABS.filter((t) => t.allow(me));
    if (wanted && allowed.some((t) => t.key === wanted)) {
      setActiveTab(wanted);
    } else {
      setActiveTab(allowed[0]?.key ?? "satellite");
    }
  }, [me, activeTab]);

  if (!me || !activeTab) {
    return (
      <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto">
        <div className="h-9 bg-gray-100 rounded-2xl animate-pulse mb-5" />
        <div className="h-40 bg-white rounded-2xl border border-gray-100 animate-pulse" />
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => t.allow(me));

  if (visibleTabs.length === 0) {
    return (
      <div className="px-4 pt-10 pb-20 max-w-md mx-auto text-center">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-10">
          <p className="text-sm font-bold text-gray-700">접근 가능한 메뉴가 없습니다</p>
          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
            {me.department_label} 직무에 허용된 기능이 없습니다.
            <br />
            슈퍼관리자에게 권한 설정을 요청하세요.
          </p>
        </div>
      </div>
    );
  }

  const isSatelliteOnly = visibleTabs.length === 1 && visibleTabs[0].key === "satellite";

  return (
    <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto">
      {/* 세틀라이트만 보이는 계정이면 탭 바 대신 제목을 보여준다 */}
      {isSatelliteOnly ? (
        <div className="flex items-center justify-between mb-5 px-1">
          <div>
            <p className="text-[10px] font-semibold text-periwinkle uppercase tracking-widest">Satellite</p>
            <h1 className="text-lg font-bold text-navy leading-tight">인스타그램 제작 콘솔</h1>
          </div>
          <span className="text-[11px] text-gray-400">
            {me.display_name || me.username}
            <span className="ml-1.5 text-[10px] font-semibold text-periwinkle">
              {me.satellite_role === "LEAD" ? "리드" : "멤버"}
            </span>
          </span>
        </div>
      ) : (
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-5">
          {visibleTabs.map(({ key, label }) => (
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
      )}

      {/* 탭 컨텐츠 */}
      {activeTab === "restaurants" && <RestaurantsTab />}
      {activeTab === "content" && <ContentTab />}
      {activeTab === "notifications" && <MarketingTab />}
      {activeTab === "satellite" && <SatelliteTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}
