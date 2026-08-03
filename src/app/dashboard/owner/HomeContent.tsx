"use client";

import { useState } from "react";
import Link from "next/link";
import { useViewMode } from "@/contexts/ViewModeContext";

/* ─── SVG 아이콘 ─────────────────────────────────────── */
const IC = {
  Store: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1-5h16l1 5"/>
      <path d="M3 9h18"/>
      <path d="M5 11v8a1 1 0 001 1h12a1 1 0 001-1v-8"/>
      <rect x="9" y="14" width="6" height="6" rx="0.5"/>
    </svg>
  ),
  Ticket: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
    </svg>
  ),
  Image: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  Qr: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="14" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="2" y="14" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="4.5" y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="16.5" y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="4.5" y="16.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="14" y="14" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="18.5" y="14" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="14" y="18.5" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="18.5" y="18.5" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
    </svg>
  ),
  Download: ({ size = 13 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Bell: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Monitor: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  Phone: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <line x1="12" y1="18" x2="12" y2="18.01"/>
    </svg>
  ),
  ChevronRight: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
};

/* ─── 타입 ────────────────────────────────────────── */
interface Stats {
  revisit_this_month: number;
  loyal_total: number;
  wishlist_count: number;
  restaurant_name: string;
  tier: string;
}
interface CampaignApp {
  id: number;
  week_start: string;
  week_end: string;
  campaign_type: string;
  status: string;
  admin_notes: string;
  coupon_title: string;
  campaign_description: string;
}
interface NotifSchedule {
  id: number;
  date: string;
  slot: "noon" | "evening";
  content: string;
  scheduled_datetime: string;
  sent: boolean;
}
interface CouponBenefit {
  id: number;
  coupon_type_code: string;
  benefit_json: Record<string, unknown>;
  title: string;
  subtitle: string;
  notes: string;
  active: boolean;
}
interface PromoFiles {
  poster_url: string;
  qr_url: string;
}

/* ─── 상수 ────────────────────────────────────────── */
const TIER_BADGE: Record<string, string> = {
  FREE:    "bg-gray-100 text-gray-500 border border-gray-200",
  BOOST:   "bg-gold text-white",
  CONTENT: "bg-periwinkle text-white",
};
const TIER_NAME: Record<string, string> = {
  FREE: "Free", BOOST: "Boost", CONTENT: "Premium",
};
const CAMP_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:       { label: "검토중",  cls: "bg-amber-50 text-amber-700 border-amber-200"    },
  APPROVED:      { label: "진행",    cls: "bg-green-50 text-green-700 border-green-200"    },
  REJECTED_HOLD: { label: "보류",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
  REJECTED:      { label: "반려",    cls: "bg-red-50 text-red-600 border-red-200"          },
  CANCELLED:     { label: "취소",    cls: "bg-gray-100 text-gray-400 border-gray-200"      },
};
const CAMP_TYPE: Record<string, { week: number; label: string; dotCls: string; badgeCls: string; bgCls: string }> = {
  BANNER:          { week: 1, label: "배너",      dotCls: "bg-sky-400",    badgeCls: "bg-sky-100 text-sky-700",       bgCls: "bg-sky-50/80"    },
  COUPON_CAMPAIGN: { week: 2, label: "한정쿠폰",  dotCls: "bg-violet-400", badgeCls: "bg-violet-100 text-violet-700", bgCls: "bg-violet-50/80" },
  MILEAGE_DOUBLE:  { week: 3, label: "마일리지2배", dotCls: "bg-amber-400", badgeCls: "bg-amber-100 text-amber-700",  bgCls: "bg-amber-50/80"  },
  INSTANT_BANNER:  { week: 4, label: "즉석배너",  dotCls: "bg-rose-400",   badgeCls: "bg-rose-100 text-rose-700",     bgCls: "bg-rose-50/80"   },
};
const SLOT_LABEL: Record<string, string> = { noon: "정오", evening: "저녁" };
const DAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

/* ─── 유틸 ────────────────────────────────────────── */
function fmtMD(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function benefitLabel(bj: Record<string, unknown>): string {
  if (!bj || typeof bj !== "object") return "";
  const { type, value, max } = bj as { type?: string; value?: number; max?: number };
  if (type === "fixed")   return `${(value ?? 0).toLocaleString()}원 할인`;
  if (type === "percent") return `${value}% 할인${max ? ` (최대 ${max.toLocaleString()}원)` : ""}`;
  return "";
}

/* ─── 쿠폰 카드 ─────────────────────────────────── */
function CouponCard({ coupon, restaurantName, href }: { coupon: CouponBenefit; restaurantName: string; href: string }) {
  const bl = benefitLabel(coupon.benefit_json);
  return (
    <Link href={href} className="block group">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card via-[#0d1a35] to-navy p-5 text-white shadow-md group-hover:shadow-xl transition-shadow duration-200">
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-periwinkle/10" />
        <div className="absolute -bottom-6 right-6 w-20 h-20 rounded-full bg-periwinkle/8" />
        <div className="flex items-start justify-between mb-1">
          <p className="text-[11px] text-gray-400 font-medium">{restaurantName}</p>
          <span className="text-[10px] text-periwinkle/70 flex items-center gap-0.5 font-semibold">
            쿠폰 수정 <IC.ChevronRight size={10} />
          </span>
        </div>
        <p className="text-xl font-extrabold leading-tight mb-1">{coupon.title}</p>
        {bl && <p className="text-sm font-bold text-gold mb-2">{bl}</p>}
        {coupon.subtitle && <p className="text-xs text-gray-400 mb-1">{coupon.subtitle}</p>}
        {coupon.notes && (
          <p className="text-[11px] text-gray-500 border-t border-white/10 mt-2 pt-2 leading-relaxed">{coupon.notes}</p>
        )}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-background" />
      </div>
    </Link>
  );
}

/* ─── 홍보물 블록 ────────────────────────────────── */
function PromoMaterialsBlock({ promoFiles }: { promoFiles: PromoFiles }) {
  const items = [
    { Icon: IC.Image, name: "포스터 (A4)", desc: "매장 비치용 인쇄 파일", iconCls: "bg-periwinkle/10 text-periwinkle", url: promoFiles.poster_url },
    { Icon: IC.Qr,    name: "QR 스티커",  desc: "우주라이크 앱 QR 코드", iconCls: "bg-navy/8 text-navy",              url: promoFiles.qr_url    },
  ];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex flex-col gap-1">
        {items.map(({ Icon, name, desc, iconCls, url }) => (
          <div key={name} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconCls}`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{name}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
            </div>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-periwinkle border border-periwinkle/25 px-3 py-1.5 rounded-xl hover:bg-periwinkle/5 active:scale-95 transition-all">
                <IC.Download size={13} />다운로드
              </a>
            ) : (
              <span className="text-xs text-gray-300 px-2">준비 중</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 마케팅 캘린더 그리드 ───────────────────────── */
function MarketingCalendar({
  campaigns, selYear, selMonth, todayStr, onPrev, onNext, upcomingNotifs, showHistory, onToggleHistory, historyByMonth,
}: {
  campaigns: CampaignApp[];
  selYear: number;
  selMonth: number;
  todayStr: string;
  onPrev: () => void;
  onNext: () => void;
  upcomingNotifs: NotifSchedule[];
  showHistory: boolean;
  onToggleHistory: () => void;
  historyByMonth: [string, CampaignApp[]][];
}) {
  const selDate  = new Date(selYear, selMonth, 1);
  const monthLabel = selDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const firstDow = new Date(selYear, selMonth, 1).getDay();

  // 캘린더 셀 배열 (null = 빈 칸)
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function campForDay(day: number): CampaignApp | undefined {
    const d = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return campaigns.find((c) => c.week_start <= d && d <= c.week_end);
  }

  const activeCampaign = campaigns.find(
    (c) => c.week_start <= todayStr && todayStr <= c.week_end && c.status === "APPROVED"
  );

  // 이 달에 등장하는 캠페인 타입 목록 (범례용)
  const monthCamps = campaigns.filter((c) => {
    const ws = new Date(c.week_start);
    return ws.getFullYear() === selYear && ws.getMonth() === selMonth;
  });
  const legendTypes = Array.from(new Set(monthCamps.map((c) => c.campaign_type)));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 rounded-full bg-periwinkle" />
          <div>
            <h2 className="text-sm font-bold text-gray-800">마케팅 현황</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">계약 일정에 따라 자동 운영됩니다</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={onPrev} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 19L9 12l6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="text-xs font-semibold text-gray-600 min-w-[64px] text-center">
            {selDate.toLocaleDateString("ko-KR", { month: "short" }).replace(" ", "").replace(".", "")} {selYear}
          </span>
          <button onClick={onNext} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 19l6-7-6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* 진행 중 배너 */}
      {activeCampaign && (() => {
        const tp = CAMP_TYPE[activeCampaign.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
        return (
          <div className="mx-4 mt-3 mb-1">
            <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-2.5 flex items-center gap-3">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-green-700">이번 주 진행 중 — </span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${tp.badgeCls}`}>{tp.label}</span>
              </div>
              <p className="text-[11px] text-green-600 shrink-0">{fmtMD(activeCampaign.week_start)}~{fmtMD(activeCampaign.week_end)}</p>
            </div>
          </div>
        );
      })()}

      {/* 캘린더 그리드 */}
      <div className="px-4 pt-3 pb-2">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_KR.map((d, i) => (
            <div key={d} className={`text-center text-[10px] font-semibold py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 주 단위 행 */}
        <div className="flex flex-col gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0.5">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="h-10" />;
                const camp = campForDay(day);
                const tp = camp ? (CAMP_TYPE[camp.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN) : null;
                const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const isWeekStart = camp && camp.week_start === dateStr;

                return (
                  <div
                    key={di}
                    className={`h-10 rounded-lg flex flex-col items-center justify-center relative overflow-hidden transition-all
                      ${camp ? tp!.bgCls + " border border-current/5" : ""}
                      ${isToday && !camp ? "ring-1 ring-periwinkle/40" : ""}
                    `}
                  >
                    {/* 오늘 표시 */}
                    {isToday && (
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-periwinkle" />
                    )}
                    {/* 날짜 숫자 */}
                    <span className={`text-[11px] leading-none
                      ${isToday ? "font-black text-navy" : camp ? "font-semibold text-gray-700" : "font-normal text-gray-400"}
                      ${di === 0 ? "text-red-400" : di === 6 ? "text-blue-400" : ""}
                    `}>
                      {day}
                    </span>
                    {/* 캠페인 시작일에만 타입 도트 표시 */}
                    {camp && isWeekStart && (
                      <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${tp!.dotCls}`} />
                    )}
                    {/* 진행 중 날짜 하이라이트 */}
                    {camp && camp.week_start <= todayStr && todayStr <= camp.week_end && camp.status === "APPROVED" && (
                      <div className="absolute inset-0 border-2 border-green-400/30 rounded-lg pointer-events-none" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 범례 */}
        {legendTypes.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-50 flex flex-wrap gap-x-3 gap-y-1.5">
            {legendTypes.map((type) => {
              const tp = CAMP_TYPE[type];
              if (!tp) return null;
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${tp.dotCls}`} />
                  <span className="text-[10px] text-gray-500">{tp.label}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-periwinkle" />
              <span className="text-[10px] text-gray-500">오늘</span>
            </div>
          </div>
        )}
      </div>

      {/* 예정 알림 */}
      {upcomingNotifs.length > 0 && (
        <div className="px-4 pb-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-semibold text-blue-400 mb-1.5 uppercase tracking-wide">예정 알림</p>
            {upcomingNotifs.map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-xs text-blue-700">
                <IC.Bell size={11} />
                <span className="text-blue-500 shrink-0">{fmtMD(n.date)} {SLOT_LABEL[n.slot]}</span>
                {n.content && <span className="truncate">{n.content}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 이력 */}
      <button
        onClick={onToggleHistory}
        className="w-full flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold text-gray-400 hover:text-periwinkle border-t border-gray-50 transition-colors"
      >
        {showHistory ? "이력 접기" : "캠페인 전체 이력 보기"}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {showHistory && (
        <div className="px-4 pb-4 border-t border-gray-50">
          {historyByMonth.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-4">캠페인 이력이 없습니다</p>
          ) : (
            <div className="flex flex-col gap-4 pt-3">
              {historyByMonth.map(([key, camps]) => {
                const [y, m] = key.split("-");
                const label = new Date(Number(y), Number(m) - 1, 1)
                  .toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
                return (
                  <div key={key}>
                    <p className="text-[11px] font-bold text-gray-500 mb-1.5">{label}</p>
                    <div className="flex flex-col divide-y divide-gray-100 bg-gray-50 rounded-xl overflow-hidden">
                      {camps.map((c) => {
                        const tp = CAMP_TYPE[c.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
                        const st = CAMP_STATUS[c.status] ?? CAMP_STATUS.PENDING;
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 px-3 py-2.5">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${tp.badgeCls}`}>
                              {tp.week}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-gray-400">{fmtMD(c.week_start)}~{fmtMD(c.week_end)}</p>
                              <p className="text-xs font-medium text-gray-700">{tp.label}</p>
                            </div>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${st.cls}`}>{st.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── 메인 컴포넌트 ──────────────────────────────── */
export default function HomeContent({
  stats,
  campaigns,
  notifications,
  coupons,
  promoFiles,
  ridParam,
}: {
  stats: Stats;
  campaigns: CampaignApp[];
  notifications: NotifSchedule[];
  coupons: CouponBenefit[];
  promoFiles: PromoFiles;
  ridParam: string;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [showHistory, setShowHistory]  = useState(false);
  const { mode, toggle: toggleViewMode } = useViewMode();

  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const selDate  = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const selYear  = selDate.getFullYear();
  const selMonth = selDate.getMonth();

  const historyByMonth = (() => {
    const sorted = [...campaigns].sort((a, b) => b.week_start.localeCompare(a.week_start));
    const groups: Record<string, CampaignApp[]> = {};
    sorted.forEach((c) => {
      const key = c.week_start.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  })();

  const upcomingNotifs = notifications
    .filter((n) => !n.sent && new Date(n.scheduled_datetime).getTime() > Date.now())
    .sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime))
    .slice(0, 2);

  const activeCoupon = coupons.find((c) => c.active) ?? null;
  const couponHref = `/dashboard/owner/restaurant${ridParam ? `${ridParam}&tab=coupon` : "?tab=coupon"}`;

  return (
    <div className="px-4 pt-5 max-w-lg mx-auto pb-8 flex flex-col gap-4">

      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">{stats.restaurant_name}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {selDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${TIER_BADGE[stats.tier] ?? TIER_BADGE.FREE}`}>
            {TIER_NAME[stats.tier] ?? stats.tier}
          </span>
          {/* PC/모바일 전환 토글 */}
          <button
            onClick={toggleViewMode}
            title={mode === "pc" ? "모바일 뷰로 전환" : "PC 뷰로 전환"}
            className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-periwinkle hover:border-periwinkle/30 transition-all active:scale-90"
          >
            {mode === "pc" ? <IC.Phone size={15} /> : <IC.Monitor size={15} />}
          </button>
        </div>
      </div>

      {/* ── 쿠폰 & 스탬프 CTA (상단 고정) ── */}
      <Link
        href={couponHref}
        className="flex items-center justify-between bg-navy rounded-2xl px-5 py-4 shadow-md hover:shadow-lg hover:bg-navy/90 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-periwinkle/20 flex items-center justify-center text-periwinkle">
            <IC.Ticket size={20} />
          </div>
          <div>
            <p className="text-white font-bold text-sm">쿠폰 & 스탬프 관리</p>
            <p className="text-white/50 text-xs mt-0.5">
              {activeCoupon ? `${activeCoupon.title} · 현재 적용 중` : "쿠폰 등록 또는 수정"}
            </p>
          </div>
        </div>
        <IC.ChevronRight size={14} />
      </Link>

      {/* ── 적용 중 쿠폰 카드 ── */}
      {activeCoupon && (
        <CouponCard coupon={activeCoupon} restaurantName={stats.restaurant_name} href={couponHref} />
      )}

      {/* ── 마케팅 현황 (캘린더 그리드) ── */}
      <MarketingCalendar
        campaigns={campaigns}
        selYear={selYear}
        selMonth={selMonth}
        todayStr={todayStr}
        onPrev={() => setMonthOffset((v) => v - 1)}
        onNext={() => setMonthOffset((v) => v + 1)}
        upcomingNotifs={upcomingNotifs}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((v) => !v)}
        historyByMonth={historyByMonth}
      />

      {/* ── 홍보물 ── */}
      <PromoMaterialsBlock promoFiles={promoFiles} />

      {/* ── 식당 정보 바로가기 ── */}
      <Link
        href={`/dashboard/owner/restaurant${ridParam}`}
        className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:border-periwinkle/30 hover:shadow-md transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-periwinkle/10 flex items-center justify-center text-periwinkle">
          <IC.Store size={18} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-800">식당 정보 수정</p>
          <p className="text-xs text-gray-400 mt-0.5">영업시간 · 메뉴판 · PIN 변경</p>
        </div>
        <IC.ChevronRight size={13} />
      </Link>
    </div>
  );
}
