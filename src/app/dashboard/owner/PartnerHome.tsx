"use client";

import Link from "next/link";
import { IconBrandInstagram, IconChevronRight, IconDownload, IconMessage2, IconQrcode } from "@tabler/icons-react";

/**
 * 파트너 홈 — 점주가 보는 첫 화면 (민열님 0919 승인 시안, 애딧 파트너 모드 뼈대).
 *
 * 전에는 '식당 관리' 입력 폼이 첫 화면이었다. 점주가 앱을 열어 제일 먼저 알고 싶은 건
 * **"이번 달 우리 가게에 무슨 일이 있었나"** 와 **"우주라이크가 우리를 위해 뭘 하고 있나"** 다.
 * 폼은 '매장' 탭으로 내려갔다.
 *
 * 숫자는 관리자 화면과 같은 원본이다. 못 읽은 값은 '—' — 0 이 아니다.
 * 40~60대가 폰으로 보는 화면이라 글자는 13px 이상, 관리자 화면과 같은 부품(카드·칩·목록)을 쓴다.
 */

export interface PartnerHomeData {
  store: {
    restaurant_id: number; name: string; category: string | null; address: string | null; main_menu: string | null;
    tier: string | null; campus: string | null; contract_started_on: string | null; contract_ends_on: string | null; contract_days: number | null;
    coupon_basic: string | null; coupon_limited: string | null; stamp_count: string | null; stamp_reward: string | null;
  };
  month: string;
  stats: { this: { coupon_used: number; stamp: number; revisit: number }; prev: { coupon_used: number; stamp: number; revisit: number }; loyal_total: number };
  feed: { kind: "post" | "activity" | "milestone" | "campaign"; date: string; end?: string; title: string; state: "published" | "scheduled" | "failed" | "done" | "active"; permalink?: string; by?: string }[];
  manager: { name: string; title: string; slack: string } | null;
  billing: { monthly_fee: number | null; pay_cycle: string | null; invoice: { total: number; status: string; paid_at: string | null } | null };
}

const TIER_NAME: Record<string, string> = { FREE: "Free", BOOST: "Boost", CONTENT: "Premium" };
const TIER_CLS: Record<string, string> = { FREE: "bg-gray-100 text-gray-600", BOOST: "bg-navy text-white", CONTENT: "bg-periwinkle text-white" };
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const won = (n: number) => `${n.toLocaleString()}원`;

function Delta({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev;
  if (prev === 0 && now === 0) return <span className="text-[12px] text-gray-400">—</span>;
  if (diff === 0) return <span className="text-[12px] text-gray-400">전월과 같음</span>;
  return <span className={`text-[12px] font-bold tabular-nums ${diff > 0 ? "text-emerald-600" : "text-red-600"}`}>{diff > 0 ? "▲" : "▼"} 전월 {diff > 0 ? "+" : ""}{diff}</span>;
}

const FEED_CHIP: Record<PartnerHomeData["feed"][number]["state"], string> = {
  published: "bg-emerald-50 text-emerald-700", scheduled: "bg-navy/[0.07] text-navy", failed: "bg-red-50 text-red-600",
  done: "bg-gray-100 text-gray-600", active: "bg-amber-50 text-amber-800",
};
const FEED_LABEL: Record<PartnerHomeData["feed"][number]["state"], string> = { published: "게시됨", scheduled: "예정", failed: "실패", done: "완료", active: "진행 중" };
const KIND_LABEL: Record<PartnerHomeData["feed"][number]["kind"], string> = { post: "콘텐츠", activity: "소통", milestone: "운영", campaign: "캠페인" };

export default function PartnerHome({ data, ridParam, promo }: { data: PartnerHomeData; ridParam: string; promo: { poster_url: string; qr_url: string } }) {
  const { store, stats, feed, manager, billing } = data;
  const month = Number(data.month.slice(5));
  const tier = store.tier ?? "FREE";
  const card = "bg-white rounded-[18px] border border-gray-200 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
  const daysToReport = store.contract_days === null ? null : Math.max(0, 30 - store.contract_days);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-5 pb-8 space-y-3">
      {/* 매장 헤더 */}
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-navy/[0.07] text-navy grid place-items-center text-[16px] font-bold shrink-0" aria-hidden="true">{store.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold text-gray-900 leading-tight truncate">{store.name} <span className={`ml-1 align-middle text-[10.5px] font-bold px-1.5 py-0.5 rounded-full ${TIER_CLS[tier] ?? TIER_CLS.FREE}`}>{TIER_NAME[tier] ?? tier}</span></p>
          <p className="text-[12px] text-gray-500 truncate">
            {[store.campus, store.contract_started_on && store.contract_ends_on ? `이용기간 ${md(store.contract_started_on)}~${md(store.contract_ends_on)}` : null, manager ? `담당 ${manager.name}` : null].filter(Boolean).join(" · ") || "계약 정보를 아직 안 적었습니다"}
          </p>
        </div>
      </div>

      {/* 이번 달 숫자 — 관리자 화면과 같은 원본 */}
      <section aria-label={`${month}월 지표`} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {([
          ["쿠폰 사용", stats.this.coupon_used, stats.prev.coupon_used, "장"],
          ["스탬프 적립", stats.this.stamp, stats.prev.stamp, "개"],
          ["재방문", stats.this.revisit, stats.prev.revisit, "명"],
        ] as const).map(([label, now, prev, unit]) => (
          <div key={label} className={`${card} p-3.5`}>
            <p className="text-[12px] text-gray-500">{label}</p>
            <p className="text-[24px] font-bold text-gray-900 tabular-nums tracking-[-0.02em] leading-none mt-1.5">{now}<span className="text-[12px] font-medium text-gray-400 ml-0.5">{unit}</span></p>
            <div className="mt-2"><Delta now={now} prev={prev} /></div>
          </div>
        ))}
        <div className={`${card} p-3.5`}>
          <p className="text-[12px] text-gray-500">단골 누적</p>
          <p className="text-[24px] font-bold text-gray-900 tabular-nums tracking-[-0.02em] leading-none mt-1.5">{stats.loyal_total}<span className="text-[12px] font-medium text-gray-400 ml-0.5">명</span></p>
          <p className="text-[12px] text-gray-400 mt-2">스탬프 3번 이상</p>
        </div>
      </section>
      <p className="text-[11.5px] text-gray-400 -mt-1">{month}월 1일부터 오늘까지. 우주라이크 앱에서 실제로 찍힌 것만 셉니다.</p>

      {/* 우주라이크가 한 일 — 애딧 '비즈니스 팀' 블록 */}
      <section className={`${card} p-4 bg-navy/[0.03] border-transparent`} aria-label="우주라이크가 한 일">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[14px] font-bold text-gray-900">우주라이크가 {store.name}을 위해 한 일</h2>
          <Link href={`/dashboard/owner/content${ridParam}`} className="text-[12px] font-semibold text-navy hover:underline">전체 보기 →</Link>
        </div>
        {feed.length === 0 ? (
          <p className="text-[12.5px] text-gray-500">아직 기록이 없습니다. 콘텐츠가 올라가거나 담당자가 연락을 남기면 여기에 쌓입니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {feed.slice(0, 6).map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 py-2">
                <span className="w-11 shrink-0 text-[11px] font-bold text-gray-500 tabular-nums">{md(f.date)}{f.end ? `~${md(f.end)}` : ""}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-gray-900 truncate">{f.title}</span>
                  <span className="block text-[11px] text-gray-400">{KIND_LABEL[f.kind]}{f.by ? ` · ${f.by}` : ""}</span>
                </span>
                <span className={`shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full ${FEED_CHIP[f.state]}`}>{FEED_LABEL[f.state]}</span>
                {f.permalink && <a href={f.permalink} target="_blank" rel="noreferrer" aria-label="인스타그램에서 보기" className="shrink-0 w-8 h-8 rounded-lg grid place-items-center text-navy hover:bg-navy/[0.06]"><IconBrandInstagram size={17} aria-hidden="true" /></a>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 내 매장 */}
        <section className={`${card} p-4`} aria-label="내 매장">
          <div className="flex items-baseline justify-between mb-2"><h2 className="text-[14px] font-bold text-gray-900">내 매장</h2><Link href={`/dashboard/owner/restaurant${ridParam}`} className="text-[12px] font-semibold text-navy hover:underline">정보 수정 →</Link></div>
          <p className="text-[12.5px] text-gray-600">{[store.category, store.main_menu].filter(Boolean).join(" · ") || "업종·대표 메뉴를 적어 주세요"}</p>
          {daysToReport !== null && (
            <div className="mt-3 rounded-xl bg-navy/[0.04] px-3 py-2.5">
              <p className="text-[12.5px] font-semibold text-gray-900">{daysToReport > 0 ? "데이터를 쌓는 중이에요" : "월간 리포트가 준비됩니다"}</p>
              <p className="text-[11.5px] text-gray-500 mt-0.5">{daysToReport > 0 ? `계약 ${store.contract_days}일차. 30일이 되면 첫 월간 리포트가 여기 뜹니다.` : "담당자가 매달 A4 한 장으로 정리해 드립니다."}</p>
              <div className="h-[6px] rounded-full bg-black/[0.06] overflow-hidden mt-2"><div className="h-full rounded-full bg-[linear-gradient(90deg,#050072,#6366E0)]" style={{ width: `${Math.min(100, ((store.contract_days ?? 0) / 30) * 100)}%` }} /></div>
            </div>
          )}
          <ul className="mt-3 space-y-1 text-[12.5px] text-gray-700">
            {store.coupon_basic && <li>· 기본 쿠폰: {store.coupon_basic}</li>}
            {store.coupon_limited && <li>· 한정 쿠폰: {store.coupon_limited}</li>}
            {store.stamp_count && <li>· 스탬프 {store.stamp_count}개{store.stamp_reward ? ` → ${store.stamp_reward}` : ""}</li>}
            {!store.coupon_basic && !store.coupon_limited && !store.stamp_count && <li className="text-gray-400">혜택이 아직 안 적혔습니다 — <Link href={`/dashboard/owner/restaurant?tab=coupon${ridParam ? `&${ridParam.slice(1)}` : ""}`} className="text-navy font-semibold">혜택 탭</Link>에서 등록</li>}
          </ul>
          {(promo.poster_url || promo.qr_url) && (
            <div className="mt-3 flex gap-1.5">
              {promo.poster_url && <a href={promo.poster_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-gray-200 text-[12px] font-semibold text-navy"><IconDownload size={13} aria-hidden="true" />포스터</a>}
              {promo.qr_url && <a href={promo.qr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-gray-200 text-[12px] font-semibold text-navy"><IconQrcode size={13} aria-hidden="true" />QR</a>}
            </div>
          )}
        </section>

        <div className="space-y-3">
          {/* 담당 매니저 */}
          <section className={`${card} p-4`} aria-label="담당 매니저">
            <h2 className="text-[14px] font-bold text-gray-900 mb-2">담당 매니저</h2>
            {manager ? (
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-full bg-navy text-white grid place-items-center text-[13px] font-bold shrink-0" aria-hidden="true">{manager.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-gray-900">{manager.name}</span><span className="block text-[11.5px] text-gray-500">{manager.title || "우주라이크 영업"}</span></span>
                <a href="mailto:hello@wouldulike.kr" className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-navy text-white text-[12px] font-semibold"><IconMessage2 size={13} aria-hidden="true" />문의</a>
              </div>
            ) : (
              <p className="text-[12.5px] text-gray-500">담당자가 곧 배정됩니다. 급하면 <a href="mailto:hello@wouldulike.kr" className="text-navy font-semibold">hello@wouldulike.kr</a></p>
            )}
          </section>

          {/* 플랜 · 정산 */}
          <section className={`${card} p-4`} aria-label="플랜과 정산">
            <div className="flex items-baseline justify-between mb-2"><h2 className="text-[14px] font-bold text-gray-900">플랜 · 정산</h2><Link href={`/dashboard/owner/plan${ridParam}`} className="text-[12px] font-semibold text-navy hover:underline inline-flex items-center gap-0.5">자세히 <IconChevronRight size={13} aria-hidden="true" /></Link></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
              <dt className="text-gray-500">플랜</dt><dd className="font-semibold text-gray-900">{TIER_NAME[tier] ?? tier}{billing.monthly_fee ? ` · 월 ${won(billing.monthly_fee)}` : ""}</dd>
              <dt className="text-gray-500">{month}월 청구</dt><dd className="font-semibold text-gray-900">{billing.invoice ? <>{won(billing.invoice.total)} <span className={`ml-1 text-[10.5px] px-1.5 py-0.5 rounded-full ${billing.invoice.paid_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{billing.invoice.paid_at ? "입금 확인" : "대기"}</span></> : <span className="text-gray-400 font-normal">청구 없음</span>}</dd>
              {billing.pay_cycle && <><dt className="text-gray-500">납부</dt><dd className="font-semibold text-gray-900">{billing.pay_cycle === "LUMP" ? "일시납" : "월납 · 매월 1일"}</dd></>}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
