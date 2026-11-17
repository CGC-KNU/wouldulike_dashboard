import type { HomeMetrics } from "@/lib/owner/homeMetrics";
import { IconAlertCircle } from "@tabler/icons-react";

const number = (value: number | null | undefined, unit: string) => value == null ? "—" : `${value.toLocaleString("ko-KR")}${unit}`;
const status = (value?: string) => ({ pending: "집계 준비 중", partial: "일부 데이터만 집계", stale: "수집 지연", unavailable: "집계 미확인", unknown_start: "입점 기준일 미등록", unmapped: "게시물 연결 확인 필요" }[value ?? ""] ?? "");

function MetricNote({ message }: { message: string }) {
  const unavailable = message.includes("집계 미확인");
  return <span className={unavailable ? "inline-flex items-start gap-1 rounded-lg bg-red-50 px-2 py-1 text-[11.5px] font-semibold text-red-600" : "text-[11.5px] text-gray-400"}>
    {unavailable && <IconAlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />}
    <span>{message}</span>
  </span>;
}

function ValuePair({ month, total, compact = false, disabled = false }: { month: string; total: string; compact?: boolean; disabled?: boolean }) {
  return <p className="font-bold text-gray-900 tabular-nums tracking-[-0.02em] leading-relaxed">
    <span className="sr-only">이번 달 </span>
    <span className={compact ? "text-[14px]" : "text-[24px]"}>{month}</span>
    {!disabled && <>
      <span aria-hidden="true" className="text-[12px] font-normal text-gray-400"> / </span>
      <span className="sr-only">입점 후 </span>
      <span className={`font-semibold text-navy ${compact ? "text-[11.5px]" : "text-[14px]"}`}>누적 {total}</span>
    </>}
  </p>;
}

const notes = (items: string[]) => [...new Set(items.filter(Boolean))].join(" · ");

export default function HomeMetricCards({ metrics, fallback, stampOn, card }: {
  metrics?: HomeMetrics; fallback: { coupon_used: number; stamp: number }; stampOn: boolean; card: string;
}) {
  const views = metrics?.store_views, promo = metrics?.promotion;
  const rows = [
    { title: "홍보 게시물 도달·조회", month: `조회 ${number(promo?.month?.views, "회")}`, total: number(promo?.total?.views, "회"),
      secondPair: { month: `도달 ${number(promo?.month?.reach, "")}`, total: number(promo?.total?.reach, "") },
      note: notes([status(promo?.month?.status ?? promo?.status), status(promo?.total?.status), promo?.month?.captured_at ? `${promo.month.captured_at.slice(0, 10)} 수집` : ""]) },
    { title: "매장 상세 열람", month: number(views?.month, "회"), total: number(views?.total, "회"),
      note: notes([status(views?.month_status), status(views?.total_status), views?.through ? `${views.through}까지` : ""]) },
    { title: "쿠폰 사용", month: number(metrics?.coupon_used.month ?? fallback.coupon_used, "장"), total: number(metrics?.coupon_used.total, "장"), note: "" },
    { title: "스탬프 적립", month: stampOn ? number(metrics?.stamp.month ?? fallback.stamp, "개") : "미사용",
      total: stampOn ? number(metrics?.stamp.total, "개") : "미사용", note: "", disabled: !stampOn },
  ];
  return <>
    <section aria-label="매장 지표" className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5">
      {rows.map((row) => <div key={row.title} className={`${card} p-3.5 min-w-0`}>
        <h2 className="text-[13px] text-gray-500">{row.title}</h2>
        <div className="mt-3">
          <ValuePair month={row.month} total={row.total} compact={Boolean(row.secondPair)} disabled={row.disabled} />
          {row.secondPair && <ValuePair {...row.secondPair} compact />}
        </div>
        {row.note && <div className="mt-2"><MetricNote message={row.note} /></div>}
      </div>)}
    </section>
    <p className="text-[11.5px] text-gray-400 leading-relaxed">
      홍보 성과는 매장에 연결된 게시물 중 각 기간에 게시한 글의 최신 수치입니다. 도달은 게시물 간 중복을 포함합니다.
      {metrics?.since ? ` 누적 기준일 ${metrics.since}(계약 시작일).` : " 입점 기준일이 등록되면 누적을 표시합니다."}
      {views?.total_status === "partial" && ` 상세 열람은 ${views.available_from}부터 집계한 일부 기간입니다.`}
    </p>
  </>;
}

export function InstagramSummary({ metrics, card }: { metrics?: HomeMetrics; card: string }) {
  return <section aria-label="우주라이크 전체 인스타 성과" className={`${card} p-4 bg-navy/[0.03] border-transparent`}>
      <h2 className="text-[13px] font-bold text-navy">우주라이크 전체 인스타 성과</h2>
      <p className="text-[17px] font-bold text-gray-900 mt-2 tabular-nums">조회 {number(metrics?.instagram?.views, "회")}</p>
      <p className="text-[12px] text-gray-500 mt-1">게시물 도달 합계 {number(metrics?.instagram?.reach, "")} · 게시물 간 중복 포함</p>
      <p className="text-[11.5px] text-gray-400 mt-2">수집된 전체 게시물의 최신 누적 성과 · 내 매장 성과와 별도
        {metrics?.instagram?.captured_at ? ` · ${metrics.instagram.captured_at.slice(0, 10)} 수집` : ""}
      </p>
      {status(metrics?.instagram?.status) && <div className="mt-2"><MetricNote message={status(metrics?.instagram?.status)} /></div>}
    </section>;
}
