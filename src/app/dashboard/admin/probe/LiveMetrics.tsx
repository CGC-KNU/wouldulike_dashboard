"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button, Card, Kpi, Notice, PageHeader, Skeleton } from "../_shared/ui";
import { LIVE_FAILURES, LIVE_STEPS, flowOf, peakOf, type Ga4Live } from "@/lib/bigquery/liveShape";
import type { LiveDb } from "@/app/api/probe/live/route";
import NowCard from "./NowCard";
import { BAR_NOW, BAR_PAST, Fold, FlowCard as FlowShell } from "./kit";

/**
 * Probe · 실시간 지표 — 지금부터 24시간(민찬 1108). 매장 지표와 앱 지표 사이.
 *
 * 1116 민찬: 직관적으로 · 지금의 흐름을 숫자 + 그래프로 · 간단하게. 화면은 세 층이다.
 *  ① 지금 — 최근 30분 몇 명(NowCard)
 *  ② 지난 24시간 흐름 — 「앱을 연 기기」 · 「매장에서 쓴 것」 두 칸. 칸마다 숫자 하나 + 평소와 견준 말 + 시간대 막대
 *  ③ 숫자 넷 + 최근 활동. 나머지(단계별 · 실패 내역 · 그 밖 · 읽는 법)는 접어 둔다
 *
 * 「평소」 = 지난 4주 같은 요일 · 같은 시각 창의 평균. 하루 볼륨이 작아 차이가 ±2√(지금+평소) 안이면 「비슷」이라 한다(flowOf).
 * DB 칸(쿠폰 · 스탬프 · 가입 · QR)은 원장이라 바로 반영되고, GA4 칸(기기 · 단계 · 실패)은 수 분~1시간 늦게 붙는 잠정값이다.
 * 화면은 5분마다 저절로 다시 읽는다(GA4 캐시도 5분).
 */

interface Payload { db: LiveDb | null; ga4: Ga4Live | null; generated_at: string }

const H = 3_600_000;
const kst = (iso: string) => new Date(Date.parse(iso) + 9 * H).toISOString();
const hm = (iso: string) => kst(iso).slice(11, 16);
const ago = (iso: string | null, now: number) => {
  if (!iso) return null;
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 ${m % 60}분 전`;
};

const KIND_KO: Record<string, string> = {
  signups: "가입", coupon_redeemed: "쿠폰 사용", stamp_earned: "스탬프 적립", qr_visits: "QR 방문 적립", mileage_entries: "식사권 응모",
};
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "미확인" : v.toLocaleString());
const usual = (v: number | null | undefined) => (v === null || v === undefined ? "평소 미확인" : `평소 ${v.toLocaleString()}`);
const UNREAD = <p className="text-[13px] text-gray-500">읽지 못했습니다 — 0 이 아니라 모름입니다.</p>;
const RECENT_SHOWN = 8;

const FLOW_TEXT = { up: "평소보다 많음", same: "평소와 비슷", down: "평소보다 적음" } as const;

interface HourRow { label: string; n: number; tip?: string }

/** 흐름 한 칸 — 숫자 하나 · 평소와 견준 말 · 시간대 막대(오른쪽 끝 짙은 칸이 지금) */
function FlowCard({ title, value, unit, base, sub, rows, tipName, loading }: {
  title: string; value: number | null | undefined; unit: string; base: number | null | undefined;
  sub?: ReactNode; rows: HourRow[]; tipName: string; loading: boolean;
}) {
  const flow = flowOf(value, base);
  const peak = peakOf(rows);
  const known = value !== null && value !== undefined;
  return (
    <FlowShell title={title} value={value} unit={unit} loading={loading} tag={flow ? { flow, text: FLOW_TEXT[flow] } : null}
      sub={known ? <>{usual(base)}{base !== null && base !== undefined ? unit : ""}{sub && <> · {sub}</>}</> : null}>
      {loading ? <div className="h-32 mt-3 rounded-lg bg-black/[0.03] animate-pulse" /> : !rows.length ? <div className="mt-3">{UNREAD}</div> : (
        <>
          <div className="h-32 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={5} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} labelFormatter={(l) => String(l)}
                  formatter={(n, _k, p) => [`${Number(n)}${unit}${p.payload.tip ? ` · ${p.payload.tip}` : ""}`, tipName]} />
                <Bar dataKey="n" radius={[3, 3, 0, 0]} minPointSize={0}>
                  {rows.map((r, i) => <Cell key={i} fill={i === rows.length - 1 ? BAR_NOW : BAR_PAST} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[12px] text-gray-500 mt-1.5">
            {peak ? <>가장 많았던 때 <b className="font-semibold text-gray-800">{peak.label}</b> · {peak.n}{unit}</> : "지난 24시간 동안 없었습니다."}
          </p>
        </>
      )}
    </FlowShell>
  );
}

function Rows({ items }: { items: [string, ReactNode, ReactNode?][] }) {
  return (
    <ul className="divide-y divide-black/[0.05]">
      {items.map(([label, value, note]) => (
        <li key={label} className="flex items-center justify-between gap-2 py-1.5 text-[13.5px]">
          <span className="text-gray-800 min-w-0">{label}</span>
          <span className="tabular-nums shrink-0"><b className="text-gray-900">{value}</b>{note && <span className="text-gray-500 ml-2 text-[12px]">{note}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LiveMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [allRecent, setAllRecent] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    fetch("/api/probe/live")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Payload) => { setData(d); setNow(Date.now()); })
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // 화면이 보일 때만 5분마다 — 탭을 열어 둔 채 자리를 비워도 BigQuery 를 계속 부르지 않게
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const db = data?.db ?? null;
  const g = data?.ga4 ?? null;
  const s = db?.stats;
  const b = db?.baseline;
  const first = loading && !data;
  const v = (x: number | null | undefined) => (first ? "-" : fmt(x));
  const failTotal = g ? LIVE_FAILURES.reduce((a, [ev]) => a + g.counts.failures[ev].count, 0) : null;
  const provisional = g?.days.some((d) => d.table === "provisional");
  const missing = g?.days.filter((d) => d.table === "missing") ?? [];

  // 매장에서 쓴 것 = 쿠폰 사용 + 스탬프 적립 + QR 방문 적립. 하나라도 모르면 합도 모른다
  const sum3 = (o: Record<string, number | null> | undefined) => {
    const xs = [o?.coupon_redeemed, o?.stamp_earned, o?.qr_visits];
    return xs.every((x): x is number => typeof x === "number") ? Math.round(xs.reduce((a, x) => a + x, 0) * 10) / 10 : null;
  };
  const storeNow = sum3(s), storeBase = sum3(b);

  const last = <T,>(rows: T[], i: number) => i === rows.length - 1;
  const gaHours: HourRow[] = (g?.hourly ?? []).map((h, i, a) => ({ label: last(a, i) ? "지금" : `${+h.hour.slice(11, 13)}시`, n: h.active, tip: `화면 ${h.views}회` }));
  const dbHours: HourRow[] = (db?.hourly ?? []).map((h, i, a) => {
    const c = Number(h.coupon_redeemed), st = Number(h.stamp_earned), q = Number(h.qr_visits);
    return { label: last(a, i) ? "지금" : `${+hm(String(h.start)).slice(0, 2)}시`, n: c + st + q, tip: `쿠폰 ${c} · 스탬프 ${st} · QR ${q}` };
  });
  const recent = db?.recent ?? [];

  return (
    <>
      <PageHeader
        title="실시간 지표"
        description="지금 앱을 쓰는 사람과, 지난 24시간이 평소와 견줘 어떤지 봅니다. 막대는 오른쪽 끝(짙은 칸)이 지금입니다."
        actions={<Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>}
      />

      {!loading && failed && (
        <div className="mb-4"><Notice tone="red" title="지금 읽지 못했습니다">지난 24시간 지표를 읽지 못했습니다. 없는 것이 아니라 확인하지 못한 것입니다 — 다시 불러와 주세요.</Notice></div>
      )}
      {data && (!db || !g) && (
        <div className="mb-4"><Notice tone="amber" title="일부를 읽지 못했습니다">
          {!db && "쿠폰 · 스탬프 · 가입(DB)을 읽지 못했습니다. "}{!g && "앱을 연 기기 · 실패 이벤트(GA4)를 읽지 못했습니다. "}해당 칸은 「미확인」입니다.
        </Notice></div>
      )}
      {missing.length > 0 && (
        <div className="mb-4"><Notice tone="amber" title="GA4 에 없는 날이 있습니다">{missing.map((d) => `${+d.date.slice(4, 6)}/${+d.date.slice(6, 8)}`).join(" · ")} 분이 비어 있어 「앱을 연 기기」가 그만큼 적게 보입니다.</Notice></div>
      )}

      <div className="mb-4"><NowCard /></div>

      <p className="text-[13px] font-semibold text-gray-900 mb-2">지난 24시간 흐름</p>
      <div className="grid gap-4 lg:grid-cols-2 items-start mb-4">
        <FlowCard title="앱을 연 기기" value={g?.counts.active} unit="대" base={g ? g.baseline?.active ?? null : undefined}
          sub={g ? `iOS ${g.counts.active_ios} · 안드로이드 ${g.counts.active_android}` : undefined}
          rows={gaHours} tipName="앱을 연 기기" loading={first} />
        <FlowCard title="매장에서 쓴 것" value={s ? storeNow : undefined} unit="건" base={s ? storeBase : undefined}
          sub={s ? `쓴 사람 ${fmt(s.users_redeemed)}명 · 매장 ${fmt(s.active_restaurants)}곳` : undefined}
          rows={dbHours} tipName="쿠폰 + 스탬프 + QR" loading={first} />
      </div>

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <Kpi label="쿠폰 사용" value={v(s?.coupon_redeemed)} suffix={s ? "건" : undefined} hint={usual(b?.coupon_redeemed)} />
        <Kpi label="스탬프 적립" value={v(s?.stamp_earned)} suffix={s ? "회" : undefined} hint={usual(b?.stamp_earned)} />
        <Kpi label="가입" value={v(s?.signups)} suffix={s ? "명" : undefined} hint={usual(b?.signups)} />
        <Kpi label="실패 이벤트" value={first ? "-" : failTotal ?? "미확인"} suffix={g ? "건" : undefined} tone="alert" hint="쿠폰 · 스탬프 · 식사권" />
      </div>

      {first ? (
        <Card flush><Skeleton rows={5} cols={3} /></Card>
      ) : !data ? null : (
        <Card>
          <p className="text-[13px] font-semibold text-gray-900 mb-1.5">방금 일어난 일</p>
          {!db ? UNREAD : recent.length === 0 ? <p className="text-[13px] text-gray-500">지난 24시간 동안 기록이 없습니다.</p> : (
            <>
              <ul className="divide-y divide-black/[0.05]">
                {(allRecent ? recent : recent.slice(0, RECENT_SHOWN)).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex items-baseline gap-3 py-1.5 text-[13.5px]">
                    <span className="tabular-nums text-gray-500 shrink-0 w-[84px]">{ago(e.at, now)}</span>
                    <span className="text-gray-900 font-medium shrink-0">{KIND_KO[e.kind] ?? e.kind}</span>
                    <span className="text-gray-600 min-w-0 truncate">
                      {[e.restaurant ?? (e.restaurant_id ? `매장 ${e.restaurant_id}` : null), e.detail || null].filter(Boolean).join(" · ")}
                    </span>
                    <span className="tabular-nums text-gray-400 text-[12px] ml-auto shrink-0">{hm(e.at)}</span>
                  </li>
                ))}
              </ul>
              {recent.length > RECENT_SHOWN && (
                <button type="button" onClick={() => setAllRecent((x) => !x)} className="mt-2 text-[12.5px] font-medium text-indigo-600 hover:text-indigo-800">
                  {allRecent ? "접기" : `${recent.length - RECENT_SHOWN}건 더 보기`}
                </button>
              )}
            </>
          )}

          <Fold label="자세히 — 단계별 · 실패 내역 · 그 밖">
            <div className="grid gap-x-8 gap-y-5 lg:grid-cols-3 items-start">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-gray-700 mb-1">단계별 기기</p>
                {!g ? UNREAD : (
                  <Rows items={[
                    ["신규 설치", `${g.counts.new_devices.toLocaleString()}대`, usual(g.baseline?.new_devices)] as [string, ReactNode, ReactNode],
                    ...LIVE_STEPS.map(([ev, label]) => [label, `${g.counts.steps[ev].toLocaleString()}대`, usual(g.baseline?.steps[ev])] as [string, ReactNode, ReactNode]),
                  ]} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-gray-700 mb-1">실패 이벤트</p>
                {!g ? UNREAD : (
                  <Rows items={LIVE_FAILURES.map(([ev, label]) => {
                    const f = g.counts.failures[ev];
                    return [label, <span key={ev} className={f.count > 0 ? "text-red-600" : undefined}>{f.count}건</span>, `${f.devices}대 · ${usual(g.baseline?.failures[ev])}`];
                  })} />
                )}
                <p className="text-[12px] text-gray-500 mt-2">붉은 숫자가 보이면 매장 지표의 「사용 실패 매장」을 같이 보세요.</p>
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-gray-700 mb-1">그 밖</p>
                {!s ? UNREAD : (
                  <Rows items={[
                    ["QR 방문 적립", `${fmt(s.qr_visits)}${s.qr_visits !== null ? "회" : ""}`, usual(b?.qr_visits)],
                    ["쿠폰 발급", `${fmt(s.coupon_issued)}${s.coupon_issued !== null ? "장" : ""}`],
                    ["스탬프 보상 쿠폰", `${fmt(s.stamp_reward)}${s.stamp_reward !== null ? "장" : ""}`],
                    ["식사권 응모", `${fmt(s.mileage_entries)}${s.mileage_entries !== null ? "건" : ""}`, b?.mileage_entries !== undefined ? usual(b.mileage_entries) : undefined],
                    ["마일리지 적립", `${fmt(s.mileage_points_earned)}${s.mileage_points_earned !== null ? "P" : ""}`],
                    ["응모에 쓴 마일리지", `${fmt(s.mileage_points_spent)}${s.mileage_points_spent !== null ? "P" : ""}`],
                    ["쿠폰 교환", `${fmt(s.mileage_exchanges)}${s.mileage_exchanges !== null ? "건" : ""}`],
                    ["푸시 캠페인", `${fmt(s.push_campaigns)}${s.push_campaigns !== null ? "번" : ""}`, s.push_targets !== null ? `대상 ${fmt(s.push_targets)}명` : undefined],
                  ]} />
                )}
                {db && db.failed.length > 0 && <p className="text-[12px] text-amber-700 mt-2">못 센 칸: {db.failed.join(", ")}</p>}
              </div>
            </div>
            <p className="text-[12px] text-gray-500 mt-4">
              「평소」는 지난 4주 같은 요일 · 같은 시각 24시간의 평균입니다. 하루 건수가 작아 차이가 크지 않으면 「비슷」으로 봅니다.
              쿠폰 · 스탬프 · 가입은 DB 기록이라 바로 반영되고(테스트 계정 제외), 앱을 연 기기 · 단계 · 실패는 GA4{provisional ? " 당일분(잠정)" : ""}이라 수 분~1시간 늦게 붙습니다.
              단계는 그 이벤트를 보낸 기기 수를 따로 센 값입니다. 쿠폰 발급은 만료 쿠폰이 지워져 평소 값을 내지 않습니다. 「미확인」은 0 이 아니라 읽지 못한 값입니다.
              {db?.last_event_at && ` DB 마지막 기록 ${hm(db.last_event_at)}(${ago(db.last_event_at, now)}).`}
              {g && ` GA4 마지막 이벤트 ${g.last_event_at ? `${hm(g.last_event_at)}(${ago(g.last_event_at, now)})` : "없음"}.`}
            </p>
          </Fold>
        </Card>
      )}
    </>
  );
}
