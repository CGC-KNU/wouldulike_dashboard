"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/* ─── 타입 ─── */
interface SlotWeek {
  week_start: string;
  week_end: string;
  max_slots: number;
  occupied_slots: number;
  available_slots: number;
  can_apply: boolean;
  deadline: string;
}

interface CampaignApp {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  week_start: string;
  week_end: string;
  coupon_title: string;
  coupon_subtitle: string;
  coupon_notes: string;
  benefit_type: string;
  benefit_value: number | null;
  benefit_label: string;
  campaign_description: string;
  status: string;
  admin_notes: string;
  created_at: string;
  reviewed_at: string | null;
}

/* ─── 상수 ─── */
const STATUS_LABEL: Record<string, string> = {
  PENDING: "검토 중",
  APPROVED: "승인",
  REJECTED: "반려",
  REJECTED_HOLD: "반려(재신청 가능)",
  CANCELLED: "취소",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-600 border-red-200",
  REJECTED_HOLD: "bg-orange-50 text-orange-600 border-orange-200",
  CANCELLED: "bg-gray-100 text-gray-400 border-gray-200",
};
const BENEFIT_TYPES = [
  { value: "PERCENT", label: "할인율(%)" },
  { value: "FIXED", label: "할인금액(원)" },
  { value: "FREE", label: "무료 제공" },
  { value: "OTHER", label: "기타" },
];

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
  });
}
function fmtKST(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric",
  });
}

/* ═══════════════════════════════════════════════════════ */
export default function OwnerCampaignsPage() {
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");

  const [slots, setSlots] = useState<SlotWeek[]>([]);
  const [history, setHistory] = useState<CampaignApp[]>([]);
  const [loading, setLoading] = useState(true);

  /* 신청 폼 상태 */
  const [formOpen, setFormOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<SlotWeek | null>(null);
  const [form, setForm] = useState({
    coupon_title: "",
    coupon_subtitle: "",
    coupon_notes: "",
    benefit_type: "OTHER",
    benefit_value: "",
    campaign_description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  /* 상세 보기 */
  const [detailApp, setDetailApp] = useState<CampaignApp | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        fetch("/api/dashboard/owner/campaigns/slots"),
        fetch("/api/dashboard/owner/campaigns"),
      ]);
      if (sRes.ok) setSlots(await sRes.json());
      if (hRes.ok) setHistory(await hRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* 슬롯 선택 → 폼 열기 */
  function openForm(week: SlotWeek) {
    setSelectedWeek(week);
    setForm({ coupon_title: "", coupon_subtitle: "", coupon_notes: "", benefit_type: "OTHER", benefit_value: "", campaign_description: "" });
    setFormError("");
    setFormOpen(true);
  }

  async function submitApplication() {
    if (!selectedWeek) return;
    if (!form.coupon_title.trim()) { setFormError("쿠폰 제목을 입력해주세요."); return; }
    setSubmitting(true);
    setFormError("");
    try {
      const body: Record<string, unknown> = {
        week_start: selectedWeek.week_start,
        coupon_title: form.coupon_title.trim(),
        coupon_subtitle: form.coupon_subtitle.trim(),
        coupon_notes: form.coupon_notes.trim(),
        benefit_type: form.benefit_type,
        campaign_description: form.campaign_description.trim(),
      };
      if (form.benefit_value && ["PERCENT", "FIXED"].includes(form.benefit_type)) {
        body.benefit_value = Number(form.benefit_value);
      }
      const res = await fetch("/api/dashboard/owner/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setFormError(d.detail || "신청에 실패했습니다.");
        return;
      }
      setFormOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelApp(id: number) {
    if (!confirm("캠페인 신청을 취소하시겠어요?")) return;
    await fetch(`/api/dashboard/owner/campaigns/${id}`, { method: "DELETE" });
    load();
  }

  /* 슬롯 아이콘 */
  function SlotDots({ week }: { week: SlotWeek }) {
    return (
      <div className="flex gap-0.5 mt-1">
        {Array.from({ length: week.max_slots }).map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${i < week.occupied_slots ? "bg-periwinkle" : "bg-gray-200"}`}
          />
        ))}
      </div>
    );
  }

  /* 기존 신청 있는 주인지 */
  function getExistingApp(weekStart: string) {
    return history.find(
      (a) => a.week_start === weekStart && a.status !== "CANCELLED" && a.status !== "REJECTED"
    );
  }

  return (
    <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-navy mb-1">캠페인 신청</h1>
      <p className="text-xs text-gray-400 mb-5">
        1주일 단위로 캠페인을 신청하면 승인 후 앱 접속 고객에게 쿠폰이 자동 발급됩니다.
      </p>

      {/* ── 슬롯 캘린더 ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">신청 가능한 주</h2>
          <p className="text-xs text-gray-400 mt-0.5">슬롯이 남아 있고 1주일 이상 남은 주만 신청 가능합니다</p>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {slots.map((week) => {
              const existing = getExistingApp(week.week_start);
              const isFull = week.available_slots <= 0;
              const isPastDeadline = !week.can_apply && !existing;
              return (
                <div key={week.week_start} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {fmtDate(week.week_start)} — {fmtDate(week.week_end)}
                    </p>
                    <SlotDots week={week} />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {week.available_slots}/{week.max_slots} 슬롯 남음 · 신청 마감 {fmtDate(week.deadline)}
                    </p>
                  </div>
                  {existing ? (
                    <button
                      onClick={() => setDetailApp(existing)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium ${STATUS_COLOR[existing.status]}`}
                    >
                      {STATUS_LABEL[existing.status]}
                    </button>
                  ) : isFull ? (
                    <span className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-400 border border-red-200 font-medium">
                      마감
                    </span>
                  ) : isPastDeadline ? (
                    <span className="text-xs text-gray-300">기한 초과</span>
                  ) : (
                    <button
                      onClick={() => openForm(week)}
                      className="text-xs px-3 py-1.5 rounded-full bg-periwinkle text-white font-semibold hover:bg-periwinkle/80 transition-colors"
                    >
                      신청
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 이력 ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">신청 이력</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : history.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">신청 이력이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {history.map((app) => (
              <div
                key={app.id}
                className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setDetailApp(app)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">
                    {fmtDate(app.week_start)} — {fmtDate(app.week_end)}
                  </p>
                  <p className="text-sm font-medium text-gray-800 truncate">{app.coupon_title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{app.benefit_label}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[app.status]}`}>
                  {STATUS_LABEL[app.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ 신청 폼 모달 ══ */}
      {formOpen && selectedWeek && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-5 pb-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">캠페인 신청</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDate(selectedWeek.week_start)} — {fmtDate(selectedWeek.week_end)}
                  &nbsp;·&nbsp;잔여 {selectedWeek.available_slots}슬롯
                </p>
              </div>
              <button onClick={() => setFormOpen(false)} className="text-gray-400 text-xl leading-none">✕</button>
            </div>

            {/* 쿠폰 제목 */}
            <label className="block text-xs font-medium text-gray-600 mb-1">쿠폰 제목 *</label>
            <input
              value={form.coupon_title}
              onChange={(e) => setForm((f) => ({ ...f, coupon_title: e.target.value }))}
              placeholder="예: 고니식탁 방문 할인 쿠폰"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-periwinkle"
            />

            {/* 혜택 타입 */}
            <label className="block text-xs font-medium text-gray-600 mb-1">혜택 유형</label>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {BENEFIT_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  onClick={() => setForm((f) => ({ ...f, benefit_type: bt.value }))}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                    form.benefit_type === bt.value
                      ? "bg-periwinkle text-white border-periwinkle"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {bt.label}
                </button>
              ))}
            </div>

            {/* 혜택 값 */}
            {["PERCENT", "FIXED"].includes(form.benefit_type) && (
              <>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {form.benefit_type === "PERCENT" ? "할인율 (%)" : "할인 금액 (원)"}
                </label>
                <input
                  type="number"
                  value={form.benefit_value}
                  onChange={(e) => setForm((f) => ({ ...f, benefit_value: e.target.value }))}
                  placeholder={form.benefit_type === "PERCENT" ? "예: 10" : "예: 3000"}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-periwinkle"
                />
              </>
            )}

            {/* 쿠폰 부제 */}
            <label className="block text-xs font-medium text-gray-600 mb-1">쿠폰 부제 (선택)</label>
            <input
              value={form.coupon_subtitle}
              onChange={(e) => setForm((f) => ({ ...f, coupon_subtitle: e.target.value }))}
              placeholder="예: [캠페인 기간 한정]"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-periwinkle"
            />

            {/* 쿠폰 비고 */}
            <label className="block text-xs font-medium text-gray-600 mb-1">쿠폰 이용 조건/비고 (선택)</label>
            <textarea
              value={form.coupon_notes}
              onChange={(e) => setForm((f) => ({ ...f, coupon_notes: e.target.value }))}
              placeholder="예: 1인 1매 · 음료 제외 · 주말 사용 불가"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none h-16 mb-3 focus:outline-none focus:border-periwinkle"
            />

            {/* 캠페인 설명 */}
            <label className="block text-xs font-medium text-gray-600 mb-1">캠페인 소개 (선택)</label>
            <textarea
              value={form.campaign_description}
              onChange={(e) => setForm((f) => ({ ...f, campaign_description: e.target.value }))}
              placeholder="이번 캠페인에 대한 간단한 소개를 입력해주세요"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none h-20 mb-4 focus:outline-none focus:border-periwinkle"
            />

            {formError && <p className="text-xs text-red-500 mb-3">{formError}</p>}

            <button
              onClick={submitApplication}
              disabled={submitting}
              className="w-full py-3 bg-periwinkle text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? "신청 중…" : "캠페인 신청"}
            </button>
          </div>
        </div>
      )}

      {/* ══ 상세 보기 모달 ══ */}
      {detailApp && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-5 pb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">캠페인 상세</h3>
              <button onClick={() => setDetailApp(null)} className="text-gray-400 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${STATUS_COLOR[detailApp.status]}`}>
                  {STATUS_LABEL[detailApp.status]}
                </span>
                <span className="text-xs text-gray-400">
                  {fmtDate(detailApp.week_start)} — {fmtDate(detailApp.week_end)}
                </span>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <Row label="쿠폰 제목" value={detailApp.coupon_title} />
                {detailApp.coupon_subtitle && <Row label="부제" value={detailApp.coupon_subtitle} />}
                <Row label="혜택" value={detailApp.benefit_label} />
                {detailApp.coupon_notes && <Row label="이용조건" value={detailApp.coupon_notes} />}
                {detailApp.campaign_description && <Row label="캠페인 소개" value={detailApp.campaign_description} />}
              </div>

              {detailApp.admin_notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-amber-700 mb-0.5">관리자 메모</p>
                  <p className="text-sm text-amber-800">{detailApp.admin_notes}</p>
                </div>
              )}

              <p className="text-[10px] text-gray-400">
                신청일 {fmtKST(detailApp.created_at)}
                {detailApp.reviewed_at && ` · 검토일 ${fmtKST(detailApp.reviewed_at)}`}
              </p>
            </div>

            {(detailApp.status === "PENDING" || detailApp.status === "REJECTED_HOLD") && (
              <button
                onClick={() => { cancelApp(detailApp.id); setDetailApp(null); }}
                className="w-full py-2.5 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50"
              >
                신청 취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <span className="text-xs text-gray-700 flex-1">{value}</span>
    </div>
  );
}
