"use client";

import { useState } from "react";
import Link from "next/link";

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

/* ─── 상수 ────────────────────────────────────────── */
const TIER_BADGE: Record<string, string> = {
  FREE:    "bg-gray-200 text-gray-600",
  BOOST:   "bg-amber-400 text-amber-900",
  CONTENT: "bg-indigo-500 text-white",
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

const CAMP_TYPE: Record<string, { week: number; label: string; icon: string; color: string; dotCls: string }> = {
  BANNER:          { week: 1, label: "배너",           icon: "📌", color: "bg-sky-50 text-sky-700 border-sky-200",       dotCls: "bg-sky-400"    },
  COUPON_CAMPAIGN: { week: 2, label: "한정쿠폰 캠페인", icon: "🎟", color: "bg-violet-50 text-violet-700 border-violet-200", dotCls: "bg-violet-400" },
  MILEAGE_DOUBLE:  { week: 3, label: "마일리지 2배",    icon: "⚡", color: "bg-amber-50 text-amber-700 border-amber-200",  dotCls: "bg-amber-400"  },
  INSTANT_BANNER:  { week: 4, label: "즉석 배너",       icon: "📣", color: "bg-rose-50 text-rose-700 border-rose-200",    dotCls: "bg-rose-400"   },
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
function CouponCard({ coupon, restaurantName }: { coupon: CouponBenefit; restaurantName: string }) {
  const bl = benefitLabel(coupon.benefit_json);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-navy p-5 text-white shadow-lg">
      {/* 장식 원 */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
      <div className="absolute -bottom-4 -right-2 w-16 h-16 rounded-full bg-white/5" />

      <p className="text-[11px] text-gray-400 mb-1 font-medium tracking-wide">{restaurantName}</p>
      <p className="text-xl font-extrabold leading-tight mb-1">{coupon.title}</p>
      {bl && <p className="text-sm font-semibold text-amber-300 mb-2">{bl}</p>}
      {coupon.subtitle && <p className="text-xs text-gray-400 mb-1">{coupon.subtitle}</p>}
      {coupon.notes && (
        <p className="text-[10px] text-gray-500 border-t border-white/10 mt-2 pt-2">
          ● {coupon.notes}
        </p>
      )}

      {/* 좌우 노치 효과 */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-gray-100" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-gray-100" />
    </div>
  );
}

/* ─── 홍보물 다운로드 블록 ───────────────────────── */
function PromoMaterialsBlock() {
  const [tapped, setTapped] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-base">📦</span>
          <div>
            <h2 className="text-sm font-bold text-gray-800">홍보물</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">포스터 · QR 스티커 · 현수막</p>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2">
        {[
          { icon: "🖼", name: "포스터 (A4)", desc: "매장 비치용 인쇄 파일" },
          { icon: "📱", name: "QR 스티커",   desc: "우주라이크 앱 QR 코드" },
        ].map(({ icon, name, desc }) => (
          <div key={name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-700">{name}</p>
                <p className="text-[10px] text-gray-400">{desc}</p>
              </div>
            </div>
            <button
              onClick={() => setTapped(true)}
              className="text-xs font-semibold text-periwinkle border border-periwinkle/30 px-3 py-1.5 rounded-xl hover:bg-periwinkle/5 transition-colors"
            >
              다운로드
            </button>
          </div>
        ))}
        {tapped && (
          <p className="text-[11px] text-center text-gray-400 py-1">
            파일은 <span className="font-semibold text-gray-600">우주라이크 팀</span>에서 직접 제공합니다.
          </p>
        )}
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
  ridParam,
}: {
  stats: Stats;
  campaigns: CampaignApp[];
  notifications: NotifSchedule[];
  coupons: CouponBenefit[];
  ridParam: string;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [showHistory, setShowHistory]  = useState(false);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 선택된 월 계산
  const selDate  = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const selYear  = selDate.getFullYear();
  const selMonth = selDate.getMonth(); // 0-indexed
  const monthLabel = selDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });

  // 선택된 달의 캠페인 (week_start 기준)
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
      const key = c.week_start.slice(0, 7); // YYYY-MM
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">{stats.restaurant_name}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{monthLabel}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full mt-1 ${TIER_BADGE[stats.tier] ?? "bg-gray-200 text-gray-600"}`}>
          {TIER_NAME[stats.tier] ?? stats.tier}
        </span>
      </div>

      {/* ── 마케팅 현황 블록 ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

        {/* 블록 헤더 + 월 네비게이터 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">마케팅 현황</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">계약 일정에 따라 자동 운영됩니다</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonthOffset((v) => v - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 19L9 12l6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="text-xs font-semibold text-gray-600 min-w-[64px] text-center">
              {selDate.toLocaleDateString("ko-KR", { month: "short" }).replace(" ", "").replace(".", "")} {selYear}
            </span>
            <button
              onClick={() => setMonthOffset((v) => v + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 19l6-7-6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>

        {/* 이번 주 활성 캠페인 (현재 달일 때만) */}
        {isCurrentMonth && activeCampaign && (() => {
          const tp = CAMP_TYPE[activeCampaign.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
          return (
            <div className="mx-4 mb-3">
              <div className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-green-100/50 -translate-y-4 translate-x-4" />
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-xs font-bold text-green-700">이번 주 진행 중</span>
                </div>
                <p className="text-sm font-bold text-green-800">
                  {tp.icon} {tp.week}주차 · {tp.label}
                </p>
                <p className="text-[11px] text-green-600 mt-0.5">
                  {fmtMD(activeCampaign.week_start)} ~ {fmtMD(activeCampaign.week_end)}
                </p>
              </div>
            </div>
          );
        })()}

        {/* 이달 캠페인 일정 */}
        <div className="px-4 pb-1">
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
                  <li key={c.id} className={`flex items-center gap-3 py-3 ${isPast && !isActive ? "opacity-50" : ""}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 ${tp.dotCls} bg-opacity-15`}>
                      <span>{tp.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400">
                        {fmtMD(c.week_start)} ~ {fmtMD(c.week_end)}
                        {isActive && <span className="ml-1.5 text-green-600 font-semibold">● 진행중</span>}
                      </p>
                      <p className="text-sm font-semibold text-gray-700 mt-0.5">
                        <span className="text-gray-400 text-xs font-normal mr-1">{tp.week}주차</span>
                        {tp.label}
                      </p>
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

        {/* 예정 알림 (소형) */}
        {upcomingNotifs.length > 0 && (
          <div className="px-4 pb-2">
            <div className="bg-blue-50 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold text-blue-400 mb-1.5 uppercase tracking-wide">예정 알림</p>
              {upcomingNotifs.map((n) => (
                <div key={n.id} className="flex items-center gap-2 text-xs text-blue-700">
                  <span>🔔</span>
                  <span className="text-blue-500">{fmtMD(n.date)} {SLOT_LABEL[n.slot]}</span>
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`transition-transform ${showHistory ? "rotate-180" : ""}`}>
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
                      <div className="flex flex-col divide-y divide-gray-50 bg-gray-50 rounded-xl overflow-hidden">
                        {camps.map((c) => {
                          const tp = CAMP_TYPE[c.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
                          const st = CAMP_STATUS[c.status] ?? CAMP_STATUS.PENDING;
                          return (
                            <div key={c.id} className="flex items-center gap-2.5 px-3 py-2.5">
                              <span className="text-sm">{tp.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-gray-400">{fmtMD(c.week_start)}~{fmtMD(c.week_end)}</p>
                                <p className="text-xs font-medium text-gray-700">{tp.week}주 · {tp.label}</p>
                              </div>
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${st.cls}`}>{st.label}</span>
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
        {activeCoupon && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-2">
              적용 중인 쿠폰
            </p>
            <CouponCard coupon={activeCoupon} restaurantName={stats.restaurant_name} />
          </div>
        )}

        {/* 쿠폰 없음 안내 */}
        {!activeCoupon && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-2">
              적용 중인 쿠폰
            </p>
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-center">
              <p className="text-xs text-gray-400">등록된 쿠폰이 없습니다</p>
              <Link href={`/dashboard/owner/restaurant${ridParam}`} className="text-[11px] text-periwinkle font-medium mt-0.5 inline-block">
                쿠폰 등록하기 →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── 홍보물 블록 ── */}
      <PromoMaterialsBlock />

      {/* ── 통계 ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4 flex flex-col gap-1">
          <p className="text-[11px] text-gray-400">이번 달 재방문</p>
          <p className="text-2xl font-bold text-navy">
            {stats.revisit_this_month}
            <span className="text-sm font-normal text-gray-400 ml-1">명</span>
          </p>
          <p className="text-[10px] text-gray-400">
            누적 단골 <span className="font-semibold text-gray-600">{stats.loyal_total}명</span>
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4 flex flex-col gap-1">
          <p className="text-[11px] text-gray-400">찜한 사용자</p>
          <p className="text-2xl font-bold text-navy">
            {stats.wishlist_count ?? 0}
            <span className="text-sm font-normal text-gray-400 ml-1">명</span>
          </p>
          <p className="text-[10px] text-gray-400">알림 발송 대상</p>
        </div>
      </div>

      {/* ── 빠른 메뉴 (2블록) ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/dashboard/owner/restaurant${ridParam}`}
          className="flex flex-col gap-2 bg-white rounded-2xl shadow-sm px-4 py-4 hover:bg-gray-50 transition-colors"
        >
          <span className="text-2xl">🏪</span>
          <div>
            <p className="text-sm font-bold text-gray-800">식당 정보</p>
            <p className="text-[10px] text-gray-400 mt-0.5">정보 수정 · PIN 변경</p>
          </div>
        </Link>
        <Link
          href={`/dashboard/owner/restaurant${ridParam ? `${ridParam}&tab=coupon` : "?tab=coupon"}`}
          className="flex flex-col gap-2 bg-white rounded-2xl shadow-sm px-4 py-4 hover:bg-gray-50 transition-colors"
        >
          <span className="text-2xl">🎟</span>
          <div>
            <p className="text-sm font-bold text-gray-800">쿠폰 & 스탬프</p>
            <p className="text-[10px] text-gray-400 mt-0.5">쿠폰 수정 · 스탬프 확인</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
