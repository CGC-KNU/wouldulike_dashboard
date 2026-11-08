"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button, Card, Kpi, Notice, PageHeader, Skeleton } from "../_shared/ui";
import { TagChip } from "./kit";
import { LIVE_FAILURES, LIVE_STEPS, type Ga4Live } from "@/lib/bigquery/liveShape";
import type { LiveDb } from "@/app/api/probe/live/route";

/**
 * Probe · 실시간 지표 — 지금부터 24시간(민찬 1108). 매장 지표와 앱 지표 사이.
 *
 * DB 칸(쿠폰 · 스탬프 · 가입 · QR · 응모)은 원장이라 바로 반영된다. GA4 칸(활성 기기 · 단계 · 실패)은 당일분 테이블이라
 * 수 분~1시간 늦게 붙는 **잠정값**이다 — 칸마다 출처 칩을 단다.
 *
 * 하루 볼륨이 작아 증감에는 색을 입히지 않는다. 비교 기준은 「4주 평균」 =
 * 지난 4주 같은 요일 · 같은 시각 창의 평균(직전 24시간과 견주면 요일 차이가 그대로 증감으로 보인다).
 * 화면은 5분마다 저절로 다시 읽는다(GA4 캐시도 5분).
 */

interface Payload { db: LiveDb | null; ga4: Ga4Live | null; generated_at: string }

const H = 3_600_000;
const kst = (iso: string) => new Date(Date.parse(iso) + 9 * H).toISOString();
const hm = (iso: string) => kst(iso).slice(11, 16);
const mdhm = (iso: string) => { const s = kst(iso); return `${+s.slice(5, 7)}/${+s.slice(8, 10)} ${s.slice(11, 16)}`; };
/** "YYYY-MM-DDTHH" → "19시" */
const hourLabel = (key: string) => `${+key.slice(11, 13)}시`;
const ago = (iso: string | null, now: number) => {
  if (!iso) return null;
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 ${m % 60}분 전`;
};

const KIND_KO: Record<string, string> = {
  signups: "가입", coupon_redeemed: "쿠폰 사용", stamp_earned: "스탬프 적립", qr_visits: "QR 방문 적립", mileage_entries: "식사권 응모",
};
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "미확인" : v.toLocaleString());
const avg = (v: number | null | undefined) => (v === null || v === undefined ? "4주 평균 미확인" : `4주 평균 ${v.toLocaleString()}`);

function Sub({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-gray-500 mt-0.5 truncate">{children}</p>;
}

function Title({ children, tag }: { children: string; tag: string }) {
  return <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-gray-900 mb-2">{children} <TagChip>{tag}</TagChip></p>;
}

/** 시간대 막대 — 한 계열. 첫 · 끝 칸은 창 경계에서 잘린 반쪽이다 */
function HourBars({ rows, unit, tip }: { rows: { label: string; n: number; tip?: string }[]; unit: string; tip: string }) {
  if (!rows.length) return <p className="text-[13px] text-gray-500">읽지 못했습니다 — 0 이 아니라 모름입니다.</p>;
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={5} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} formatter={(n: number, _k, p) => [`${n}${unit}${p.payload.tip ? ` · ${p.payload.tip}` : ""}`, tip]} labelFormatter={(l) => String(l)} />
          <Bar dataKey="n" fill="#6366F1" radius={[3, 3, 0, 0]} minPointSize={0} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function LiveMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
  const v = (x: number | null | undefined) => (loading && !data ? "-" : fmt(x));
  const failTotal = g ? LIVE_FAILURES.reduce((a, [ev]) => a + g.counts.failures[ev].count, 0) : null;
  const provisional = g?.days.some((d) => d.table === "provisional");
  const missing = g?.days.filter((d) => d.table === "missing") ?? [];

  const gaHours = (g?.hourly ?? []).map((h) => ({ label: hourLabel(h.hour), n: h.active, tip: `화면 ${h.views}회` }));
  const dbHours = (db?.hourly ?? []).map((h) => {
    const c = Number(h.coupon_redeemed), st = Number(h.stamp_earned), q = Number(h.qr_visits);
    return { label: `${hm(String(h.start))}`, n: c + st + q, tip: `쿠폰 ${c} · 스탬프 ${st} · QR ${q} (${hm(String(h.start))}~${hm(String(h.end))})` };
  });

  return (
    <>
      <PageHeader
        title="실시간 지표"
        description="지금부터 24시간 전까지 앱에서 일어난 일입니다. 쿠폰 · 스탬프 · 가입은 DB 원장이라 바로 반영되고, GA4 칸은 앱이 이벤트를 묶어 보내 수 분~1시간 늦게 붙는 잠정값입니다. 「미확인」은 0 이 아니라 읽지 못한 값입니다."
        actions={<Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>}
      />

      {!loading && failed && (
        <div className="mb-4"><Notice tone="red" title="지금 읽지 못했습니다">실시간 지표를 읽지 못했습니다. 없는 것이 아니라 확인하지 못한 것입니다 — 다시 불러와 주세요.</Notice></div>
      )}
      {data && !db && (
        <div className="mb-4"><Notice tone="amber" title="DB 칸을 읽지 못했습니다">백엔드(app-stats/live)가 답하지 않았습니다. 쿠폰 · 스탬프 · 가입 칸은 「미확인」입니다.</Notice></div>
      )}
      {data && !g && (
        <div className="mb-4"><Notice tone="amber" title="GA4 칸을 읽지 못했습니다">BigQuery 당일분을 읽지 못했습니다. 활성 기기 · 단계 · 실패 칸은 「미확인」입니다.</Notice></div>
      )}
      {missing.length > 0 && (
        <div className="mb-4"><Notice tone="amber" title="GA4 에 없는 날이 있습니다">{missing.map((d) => `${+d.date.slice(4, 6)}/${+d.date.slice(6, 8)}`).join(" · ")} 은 확정 · 당일분 테이블이 모두 없어 GA4 칸이 그만큼 비어 있습니다.</Notice></div>
      )}

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-2">
        <Kpi label="활성 기기" value={v(g?.counts.active)} suffix={g ? "대" : undefined} hint={avg(g?.baseline?.active ?? (g ? null : undefined))}
          extra={g ? <Sub>iOS {g.counts.active_ios} · 안드로이드 {g.counts.active_android} · GA4</Sub> : undefined} />
        <Kpi label="신규 설치" value={v(g?.counts.new_devices)} suffix={g ? "대" : undefined} hint={avg(g?.baseline?.new_devices ?? (g ? null : undefined))}
          extra={<Sub>first_open · GA4</Sub>} />
        <Kpi label="가입" value={v(s?.signups)} suffix={s ? "명" : undefined} hint={avg(b?.signups)} extra={<Sub>DB</Sub>} />
        <Kpi label="쿠폰 사용" value={v(s?.coupon_redeemed)} suffix={s ? "건" : undefined} hint={avg(b?.coupon_redeemed)}
          extra={s ? <Sub>쓴 사람 {fmt(s.coupon_users)}명 · DB</Sub> : undefined} />
        <Kpi label="스탬프 적립" value={v(s?.stamp_earned)} suffix={s ? "회" : undefined} hint={avg(b?.stamp_earned)}
          extra={s ? <Sub>받은 사람 {fmt(s.stamp_users)}명 · DB</Sub> : undefined} />
        <Kpi label="QR 방문 적립" value={v(s?.qr_visits)} suffix={s ? "회" : undefined} hint={avg(b?.qr_visits)} extra={<Sub>DB</Sub>} />
        <Kpi label="매장에서 쓴 사람" value={v(s?.users_redeemed)} suffix={s ? "명" : undefined} hint="쿠폰 또는 스탬프"
          extra={s ? <Sub>활동 매장 {fmt(s.active_restaurants)}곳 · DB</Sub> : undefined} />
        <Kpi label="실패 이벤트" value={loading && !data ? "-" : failTotal ?? "미확인"} suffix={g ? "건" : undefined} tone="alert" hint="쿠폰 · 스탬프 · 식사권"
          extra={<Sub>앱이 보낸 실패 · GA4</Sub>} />
      </div>
      <p className="text-[12px] text-gray-600 mb-4">
        {db ? `창 ${mdhm(db.since)} → ${mdhm(db.until)}` : g ? `창 ${mdhm(g.since)} → ${mdhm(g.until)}` : "창 지금부터 24시간"}
        {db?.last_event_at && ` · DB 마지막 기록 ${hm(db.last_event_at)}(${ago(db.last_event_at, now)})`}
        {g && ` · GA4 ${provisional ? "당일분(잠정)" : "확정"} 마지막 이벤트 ${g.last_event_at ? `${hm(g.last_event_at)}(${ago(g.last_event_at, now)})` : "없음"}`}
        {g?.last_loaded_at && ` · 마지막 도착 ${hm(g.last_loaded_at)}`}
        . 4주 평균 = 지난 4주 같은 요일 · 같은 시각 창의 평균입니다. 하루 볼륨이 작아 증감에는 색을 입히지 않습니다. 테스트 계정은 DB 칸에서 뺍니다.
      </p>

      {loading && !data ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : !data ? null : (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <Card>
            <Title tag="GA4 · 잠정 · 기기">시간대별 활성 기기</Title>
            <HourBars rows={gaHours} unit="대" tip="활성 기기" />
            <p className="text-[12px] text-gray-500 mt-2">첫 · 끝 칸은 창 경계에서 잘린 반쪽입니다. 최근 한 시간은 아직 덜 들어왔을 수 있습니다.</p>
          </Card>

          <Card>
            <Title tag="DB · 바로 반영">시간대별 매장 활동</Title>
            <HourBars rows={dbHours} unit="건" tip="쿠폰 사용 + 스탬프 + QR" />
            <p className="text-[12px] text-gray-500 mt-2">쿠폰 사용 · 스탬프 적립 · QR 방문 적립을 더한 건수입니다. 막대에 올리면 나눠 보입니다.</p>
          </Card>

          <Card>
            <Title tag="GA4 · 잠정 · 기기">단계별 기기</Title>
            {!g ? <p className="text-[13px] text-gray-500">읽지 못했습니다 — 0 이 아니라 모름입니다.</p> : (
              <ul className="divide-y divide-black/[0.05]">
                {LIVE_STEPS.map(([ev, label], i) => (
                  <li key={ev} className={`flex items-center justify-between py-1.5 text-[13.5px] ${i === 5 || i === 8 ? "border-t border-black/[0.12]" : ""}`}>
                    <span className="text-gray-800">{label}</span>
                    <span className="tabular-nums"><b className="text-gray-900">{g.counts.steps[ev].toLocaleString()}대</b>
                      <span className="text-gray-500 ml-2 text-[12px]">{g.baseline ? `평균 ${g.baseline.steps[ev]}` : "평균 미확인"}</span></span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-gray-500 mt-2">단계마다 그 이벤트를 보낸 기기 수를 따로 셉니다(앞 단계를 거쳤는지는 보지 않음). 쿠폰 사용은 앱 이벤트라 DB 건수와 다를 수 있습니다.</p>
          </Card>

          <Card>
            <Title tag="GA4 · 잠정">실패 이벤트</Title>
            {!g ? <p className="text-[13px] text-gray-500">읽지 못했습니다 — 0 이 아니라 모름입니다.</p> : (
              <ul className="divide-y divide-black/[0.05]">
                {LIVE_FAILURES.map(([ev, label]) => {
                  const f = g.counts.failures[ev];
                  return (
                    <li key={ev} className="flex items-center justify-between py-1.5 text-[13.5px]">
                      <span className="text-gray-800">{label}</span>
                      <span className="tabular-nums"><b className={f.count > 0 ? "text-red-600" : "text-gray-900"}>{f.count}건</b>
                        <span className="text-gray-500 ml-2 text-[12px]">{f.devices}대 · {g.baseline ? `평균 ${g.baseline.failures[ev]}` : "평균 미확인"}</span></span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-[12px] text-gray-500 mt-2">학생이 매장에서 쿠폰 · 스탬프를 못 쓴 순간입니다. 붉은 숫자가 보이면 매장 지표의 「사용 실패 매장」을 같이 보세요.</p>
          </Card>

          <Card>
            <Title tag="DB · 바로 반영 · 최근 30건">최근 활동</Title>
            {!db ? <p className="text-[13px] text-gray-500">읽지 못했습니다 — 0 이 아니라 모름입니다.</p>
              : db.recent.length === 0 ? <p className="text-[13px] text-gray-500">지난 24시간 동안 기록이 없습니다.</p> : (
                <ul className="divide-y divide-black/[0.05] max-h-[420px] overflow-y-auto">
                  {db.recent.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="flex items-baseline gap-3 py-1.5 text-[13.5px]">
                      <span className="tabular-nums text-gray-500 shrink-0 w-[42px]">{hm(e.at)}</span>
                      <span className="text-gray-900 font-medium shrink-0">{KIND_KO[e.kind] ?? e.kind}</span>
                      <span className="text-gray-600 min-w-0 truncate">
                        {[e.restaurant ?? (e.restaurant_id ? `매장 ${e.restaurant_id}` : null), e.detail || null].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>

          <Card>
            <Title tag="DB · 바로 반영">그 밖</Title>
            {!s ? <p className="text-[13px] text-gray-500">읽지 못했습니다 — 0 이 아니라 모름입니다.</p> : (
              <ul className="divide-y divide-black/[0.05]">
                {([
                  ["쿠폰 발급", s.coupon_issued, "장", "캠페인 자동 지급 포함 · 4주 평균 없음(만료 쿠폰이 지워져 지난 주가 줄어 보임)"],
                  ["스탬프 보상 쿠폰", s.stamp_reward, "장", null],
                  ["식사권 응모", s.mileage_entries, "건", b?.mileage_entries !== undefined ? avg(b.mileage_entries) : null],
                  ["마일리지 적립", s.mileage_points_earned, "P", null],
                  ["응모에 쓴 마일리지", s.mileage_points_spent, "P", null],
                  ["쿠폰 교환", s.mileage_exchanges, "건", null],
                  ["푸시 캠페인", s.push_campaigns, "번", s.push_targets !== null ? `대상 ${fmt(s.push_targets)}명` : null],
                ] as [string, number | null, string, string | null][]).map(([label, n, unit, note]) => (
                  <li key={label} className="flex items-center justify-between gap-2 py-1.5 text-[13.5px]">
                    <span className="text-gray-800 min-w-0">{label}{note && <span className="block text-[11.5px] text-gray-500">{note}</span>}</span>
                    <b className="tabular-nums text-gray-900 shrink-0">{fmt(n)}{n !== null ? unit : ""}</b>
                  </li>
                ))}
              </ul>
            )}
            {db && db.failed.length > 0 && <p className="text-[12px] text-amber-700 mt-2">못 센 칸: {db.failed.join(", ")}</p>}
          </Card>
        </div>
      )}
    </>
  );
}
