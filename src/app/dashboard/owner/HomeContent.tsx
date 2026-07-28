"use client";

import { useState } from "react";
import Link from "next/link";

/* ─── SVG 아이콘 ─────────────────────────────────────── */
const IC = {
  Box: ({ size = 18, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  Image: ({ size = 18, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  Qr: ({ size = 18, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75"/>
      <rect x="14" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75"/>
      <rect x="2" y="14" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75"/>
      <rect x="4.5" y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="16.5" y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="4.5" y="16.5" width="3" height="3" rx="0.5" fill="currentColor"/>
      <rect x="14" y="14" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="18.5" y="14" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="14" y="18.5" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="18.5" y="18.5" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
    </svg>
  ),
  Store: ({ size = 20, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Ticket: ({ size = 20, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
    </svg>
  ),
  Download: ({ size = 14, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Bell: ({ size = 13, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  ChevronRight: ({ size = 14, cls = "" }: { size?: number; cls?: string }) => (
    <svg width={size} height={size} className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  PENDING:       { label: "검토중",  cls: "bg-amber-50 text-amber-700 border-amber-200"  },
  APPROVED:      { label: "진행",    cls: "bg-green-50 text-green-700 border-green-200"  },
  REJECTED_HOLD: { label: "보류",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
  REJECTED:      { label: "반려",    cls: "bg-red-50 text-red-600 border-red-200"        },
  CANCELLED:     { label: "취소",    cls: "bg-gray-100 text-gray-400 border-gray-200"    },
};

const CAMP_TYPE: Record<string, { week: number; label: string; color: string; dotCls: string; badgeCls: string }> = {
  BANNER:          { week: 1, label: "배너",           color: "bg-sky-50 text-sky-700 border-sky-200",         dotCls: "bg-sky-400",    badgeCls: "bg-sky-100 text-sky-700"       },
  COUPON_CAMPAIGN: { week: 2, label: "한정쿠폰 캠페인", color: "bg-violet-50 text-violet-700 border-violet-200", dotCls: "bg-violet-400", badgeCls: "bg-violet-100 text-violet-700"  },
  MILEAGE_DOUBLE:  { week: 3, label: "마일리지 2배",    color: "bg-amber-50 text-amber-700 border-amber-200",   dotCls: "bg-amber-400",  badgeCls: "bg-amber-100 text-amber-700"   },
  INSTANT_BANNER:  { week: 4, label: "즉석 배너",       color: "bg-rose-50 text-rose-700 border-rose-200",     dotCls: "bg-rose-400",   badgeCls: "bg-rose-100 text-rose-700"     },
};

const SLOT_LABEL: Record<string, string> = { noon: "정오", evening: "저녁" };

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

/* ─── 쿠폰 카드 ──────────────────────────────────── */
function CouponCard({
  coupon,
  restaurantName,
  href,
}: {
  coupon: CouponBenefit;
  restaurantName: string;
  href: string;
}) {
  const bl = benefitLabel(coupon.benefit_json);
  return (
    <Link href={href} className="block group">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card via-[#0d1a35] to-navy p-5 text-white shadow-lg group-hover:shadow-xl transition-shadow duration-200">
        {/* 브랜드 퍼리윙클 장식 원 */}
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-periwinkle/10" />
        <div className="absolute -bottom-6 right-6 w-20 h-20 rounded-full bg-periwinkle/8" />

        <div className="flex items-start justify-between mb-1">
          <p className="text-[11px] text-gray-400 font-medium tracking-wide">{restaurantName}</p>
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            수정
            <IC.ChevronRight size={10} />
          </span>
        </div>
        <p className="text-xl font-extrabold leading-tight mb-1">{coupon.title}</p>
        {bl && <p className="text-sm font-bold text-gold mb-2">{bl}</p>}
        {coupon.subtitle && <p className="text-xs text-gray-400 mb-1">{coupon.subtitle}</p>}
        {coupon.notes && (
          <p className="text-[11px] text-gray-500 border-t border-white/10 mt-2 pt-2 leading-relaxed">
            {coupon.notes}
          </p>
        )}

        {/* 노치 효과 */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-background" />
      </div>
    </Link>
  );
}

/* ─── 홍보물 다운로드 블록 ───────────────────────── */
function PromoMaterialsBlock({ promoFiles }: { promoFiles: PromoFiles }) {
  const items = [
    {
      Icon: IC.Image,
      name: "포스터 (A4)",
      desc: "매장 비치용 인쇄 파일",
      iconCls: "bg-blue-50 text-blue-500",
      url: promoFiles.poster_url,
    },
    {
      Icon: IC.Qr,
      name: "QR 스티커",
      desc: "우주라이크 앱 QR 코드",
      iconCls: "bg-violet-50 text-violet-500",
      url: promoFiles.qr_url,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex flex-col gap-1">
        {items.map(({ Icon, name, desc, iconCls, url }) => (
          <div key={name} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconCls}`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{name}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
            </div>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-periwinkle border border-periwinkle/25 px-3 py-1.5 rounded-xl hover:bg-periwinkle/5 active:scale-95 transition-all duration-150"
              >
                <IC.Download size={13} />
                다운로드
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

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 선택된 월 계산
  const selDate  = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const selYear  = selDate.getFullYear();
  const selMonth = selDate.getMonth();
  const monthLabel = selDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });

  // 선택된 달의 캠페인
  const monthCamps = campaigns
    .filter((c) => {
      const ws = new Date(c.week_start);
      return ws.getFullYear() === selYear && ws.getMonth() === selMonth;
    })
    .sort((a, b) => a.week_start.localeCompare(b.week_start));

  // 오늘 진행 중인 캠페인
  const activeCampaign = campaigns.find(
    (c) => c.week_start <= todayStr && todayStr <= c.week_end && c.status === "APPROVED"
  ) ?? null;
  const isCurrentMonth = monthOffset === 0;

  // 전체 이력 (월별 그룹)
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

  // 예정 알림 (최대 2건)
  const upcomingNotifs = notifications
    .filter((n) => !n.sent && new Date(n.scheduled_datetime).getTime() > Date.now())
    .sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime))
    .slice(0, 2);

  // 적용 쿠폰 (첫 번째 활성 쿠폰)
  const activeCoupon = coupons.find((c) => c.active) ?? null;

  return (
    <div className="px-4 pt-5 max-w-lg mx-auto pb-8 flex flex-col gap-4">

      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">{stats.restaurant_name}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{monthLabel}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full mt-1 ${TIER_BADGE[stats.tier] ?? TIER_BADGE.FREE}`}>
          {TIER_NAME[stats.tier] ?? stats.tier}
        </span>
      </div>

      {/* ── 마케팅 현황 블록 (Primary Card) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* 블록 헤더 + 월 네비게이터 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-6 rounded-full bg-periwinkle" />
            <div>
              <h2 className="text-sm font-bold text-gray-800">마케팅 현황</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">계약 일정에 따라 자동 운영됩니다</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setMonthOffset((v) => v - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 19L9 12l6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="text-xs font-semibold text-gray-600 min-w-[64px] text-center">
              {selDate.toLocaleDateString("ko-KR", { month: "short" }).replace(" ", "").replace(".", "")} {selYear}
            </span>
            <button
              onClick={() => setMonthOffset((v) => v + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 19l6-7-6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>

        {/* 이번 주 활성 캠페인 */}
        {isCurrentMonth && activeCampaign && (() => {
          const tp = CAMP_TYPE[activeCampaign.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
          return (
            <div className="mx-4 mt-3 mb-1">
              <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 relative overflow-hidden">
                <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-green-100/40" />
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-xs font-bold text-green-700">이번 주 진행 중</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${tp.badgeCls}`}>
                    {tp.week}주차
                  </span>
                  <p className="text-sm font-bold text-green-800">{tp.label}</p>
                </div>
                <p className="text-[11px] text-green-600 mt-1">
                  {fmtMD(activeCampaign.week_start)} ~ {fmtMD(activeCampaign.week_end)}
                </p>
              </div>
            </div>
          );
        })()}

        {/* 이달 캠페인 일정 */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {monthLabel} 캠페인 일정
          </p>
          {monthCamps.length === 0 ? (
            <div className="py-5 text-center">
              <p className="text-xs text-gray-300">이 달에 등록된 캠페인이 없습니다</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-50">
              {monthCamps.map((c) => {
                const st = CAMP_STATUS[c.status] ?? CAMP_STATUS.PENDING;
                const tp = CAMP_TYPE[c.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
                const isActive = c.week_start <= todayStr && todayStr <= c.week_end && c.status === "APPROVED";
                const isPast   = c.week_end < todayStr;
                return (
                  <li key={c.id} className={`flex items-center gap-3 py-3 transition-opacity ${isPast && !isActive ? "opacity-40" : ""}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${tp.badgeCls}`}>
                      {tp.week}주
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400">
                        {fmtMD(c.week_start)} ~ {fmtMD(c.week_end)}
                        {isActive && <span className="ml-1.5 text-green-600 font-semibold">● 진행중</span>}
                      </p>
                      <p className="text-sm font-semibold text-gray-700 mt-0.5">{tp.label}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 예정 알림 */}
        {upcomingNotifs.length > 0 && (
          <div className="px-4 pb-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold text-blue-400 mb-1.5 uppercase tracking-wide">예정 알림</p>
              {upcomingNotifs.map((n) => (
                <div key={n.id} className="flex items-center gap-2 text-xs text-blue-700">
                  <IC.Bell size={12} cls="text-blue-400 shrink-0" />
                  <span className="text-blue-500 shrink-0">{fmtMD(n.date)} {SLOT_LABEL[n.slot]}</span>
                  {n.content && <span className="truncate text-blue-700">{n.content}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 전체 이력 토글 */}
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold text-gray-400 hover:text-periwinkle border-t border-gray-50 transition-colors"
        >
          <span>{showHistory ? "이력 접기" : "캠페인 전체 이력 보기"}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 전체 이력 펼침 */}
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

        {/* 적용 쿠폰 */}
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-2">
            적용 중인 쿠폰
          </p>
          {activeCoupon ? (
            <CouponCard
              coupon={activeCoupon}
              restaurantName={stats.restaurant_name}
              href={`/dashboard/owner/restaurant${ridParam ? `${ridParam}&tab=coupon` : "?tab=coupon"}`}
            />
          ) : (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
              <p className="text-xs text-gray-400">등록된 쿠폰이 없습니다</p>
              <Link
                href={`/dashboard/owner/restaurant${ridParam ? `${ridParam}&tab=coupon` : "?tab=coupon"}`}
                className="text-[11px] text-periwinkle font-medium mt-0.5 inline-block hover:underline"
              >
                쿠폰 등록하기 →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── 홍보물 블록 ── */}
      <PromoMaterialsBlock promoFiles={promoFiles} />

      {/* ── 통계 ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* 재방문 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-0.5 bg-periwinkle" />
          <div className="px-4 py-4 flex flex-col gap-1">
            <p className="text-[11px] text-gray-400">이번 달 재방문</p>
            <p className="text-2xl font-bold text-navy">
              {stats.revisit_this_month}
              <span className="text-sm font-normal text-gray-400 ml-1">명</span>
            </p>
            <p className="text-xs text-gray-400">
              누적 단골 <span className="font-semibold text-gray-600">{stats.loyal_total}명</span>
            </p>
          </div>
        </div>
        {/* 찜 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-0.5 bg-gold" />
          <div className="px-4 py-4 flex flex-col gap-1">
            <p className="text-[11px] text-gray-400">찜한 사용자</p>
            <p className="text-2xl font-bold text-navy">
              {stats.wishlist_count ?? 0}
              <span className="text-sm font-normal text-gray-400 ml-1">명</span>
            </p>
            <p className="text-xs text-gray-400">알림 발송 대상</p>
          </div>
        </div>
      </div>

      {/* ── 빠른 메뉴 (2블록) ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/dashboard/owner/restaurant${ridParam}`}
          className="group flex flex-col gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 hover:border-periwinkle/30 hover:shadow-md transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-periwinkle/10 flex items-center justify-center text-periwinkle group-hover:bg-periwinkle/15 transition-colors">
            <IC.Store size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">식당 정보</p>
            <p className="text-xs text-gray-400 mt-0.5">정보 수정 · PIN 변경</p>
          </div>
        </Link>
        <Link
          href={`/dashboard/owner/restaurant${ridParam ? `${ridParam}&tab=coupon` : "?tab=coupon"}`}
          className="group flex flex-col gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 hover:border-periwinkle/30 hover:shadow-md transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-navy/8 flex items-center justify-center text-navy group-hover:bg-navy/12 transition-colors">
            <IC.Ticket size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">쿠폰 & 스탬프</p>
            <p className="text-xs text-gray-400 mt-0.5">쿠폰 수정 · 스탬프 확인</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
