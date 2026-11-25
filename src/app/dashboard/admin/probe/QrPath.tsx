"use client";

import { useCallback, useEffect, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button, Card, FilterPills, Notice, PageHeader, Table, Td, Th } from "../_shared/ui";
import { AsOf, BAR_NOW, BAR_PAST, Fold, FlowCard, MetricBox, md } from "./kit";
import { flowOf } from "@/lib/bigquery/liveShape";

/**
 * Probe · 매장 QR — 매장 QR(스티커·스탠드)로 온 손님이 앱·웹 중 어디서 무엇을 했는지 (1125 민찬).
 *
 * 숫자는 모두 백엔드 /api/probe/qr-path/(probe/qr_path.py)가 앱 DB 에서 센다 — GA4 를 섞지 않는다.
 *   · QR 방문 적립은 멱등 키로 앱·웹을 가른다(9/13 부터 같은 규칙).
 *   · 웹 스탬프 · 웹 가입은 백엔드 #224(11/25) 뒤 행부터 표시가 있다 — 그 전 기간이면 알림을 띄운다.
 *   · 하루 한도에 걸렸거나 로그인 전에 끝난 스캔은 DB 에 행이 없어 여기선 안 보인다.
 * 견준 말은 바로 앞 같은 길이 기간과 — flowOf(±2√합) 라 작은 차이는 「비슷」이다.
 */

interface Totals {
  visits_app: number; visits_web: number; visitors_app: number; visitors_web: number;
  stamps_web: number; coupons_issued: number; coupons_redeemed: number; web_signups: number; stores: number;
}
interface Day { date: string; app: number; web: number }
interface StoreRow {
  restaurant_id: number; name: string;
  visits_app: number; visits_web: number; stamps_web: number; coupons_issued: number; coupons_redeemed: number;
}
interface Payload extends Totals {
  start: string; end: string; as_of: string; web_marks_since: string;
  previous: Totals & { start: string; end: string };
  days: Day[]; store_rows: StoreRow[];
}

// 스티커·스탠드를 붙이고 브릿지가 앱 없는 손님을 웹으로 보내기 시작한 날(deeplink 859a211). 기간 버튼에만 쓴다.
const POSTED = "2026-11-16";
type RangeKey = "posted" | "d14" | "d30";

const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const rangeOf = (k: RangeKey): { start: string; end: string } => {
  const t = todayKst();
  if (k === "posted") return { start: POSTED, end: t };
  return { start: addDays(t, k === "d14" ? -13 : -29), end: t };
};
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const signed = (d: number) => `${d > 0 ? "+" : ""}${d.toLocaleString()}`;

function compare(now: number, prev: number, unit: string) {
  const f = flowOf(now, prev);
  if (!f) return null;
  return { flow: f, text: f === "same" ? `앞 기간과 비슷 (${signed(now - prev)}${unit})` : `앞 기간보다 ${signed(now - prev)}${unit}` };
}

function DayBars({ days, pick, color, label }: { days: Day[]; pick: (d: Day) => number; color: string; label: string }) {
  const rows = days.map((d) => ({ date: d.date, label: md(d.date), n: pick(d) }));
  return (
    <div className="h-32 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={rows.length > 16 ? 6 : 1} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} formatter={(n: number) => [`${n}건`, label]} labelFormatter={(l) => String(l)} />
          <Bar dataKey="n" radius={[3, 3, 0, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function QrPath() {
  const [range, setRange] = useState<RangeKey>("posted");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (k: RangeKey) => {
    setLoading(true);
    setErr(null);
    try {
      const { start, end } = rangeOf(k);
      const r = await fetch(`/api/probe/qr?${new URLSearchParams({ start, end })}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail ?? `응답 ${r.status}`);
      setData(j as Payload);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "읽지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(range); }, [range, load]);

  const span = data ? `${md(data.start)}~${md(data.end)}` : "";
  const prevSpan = data ? `앞 기간(${md(data.previous.start)}~${md(data.previous.end)})` : "";
  const webNow = data ? data.visits_web + data.stamps_web : null;
  const webPrev = data ? data.previous.visits_web + data.previous.stamps_web : 0;
  const marksLate = data ? data.start < data.web_marks_since : false;

  return (
    <>
      <PageHeader
        title="매장 QR"
        description="매장에 붙인 QR(스티커·스탠드)로 온 손님이 앱과 웹 중 어디서 무엇을 했는지 봅니다. 앱 DB 값이고, 테스트 계정은 빠져 있습니다."
        actions={<><AsOf at={data?.as_of} /><Button icon={<IconRefresh />} onClick={() => void load(range)} disabled={loading}>다시 읽기</Button></>}
      />

      <div className="mb-4">
        <FilterPills soft label="기간" value={range} onChange={setRange}
          options={[{ key: "posted", label: `붙인 뒤 ${md(POSTED)}~` }, { key: "d14", label: "최근 14일" }, { key: "d30", label: "최근 30일" }]} />
      </div>

      {err && <div className="mb-4"><Notice tone="red" title="매장 QR 숫자를 읽지 못했습니다">{err} — 0 이 아니라 모름입니다. 다시 읽어 주세요.</Notice></div>}

      {data && marksLate && (
        <div className="mb-4">
          <Notice tone="amber" title={`웹 스탬프 · 웹 가입은 ${md(data.web_marks_since)}부터 셉니다`}>
            그 전에 웹에서 찍은 스탬프와 웹에서 가입한 사람은 앱과 구분되지 않아 여기에 안 잡힙니다. 웹 QR 방문 적립은 처음부터 셉니다.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start mb-4">
        <FlowCard title={`앱으로 온 QR · ${span || "기간"}`} value={data?.visits_app} unit="건" loading={loading}
          tag={data ? compare(data.visits_app, data.previous.visits_app, "건") : null}
          sub={data ? `QR 방문 적립 · ${data.visitors_app.toLocaleString()}명 · ${prevSpan} ${data.previous.visits_app.toLocaleString()}건` : null}>
          {loading ? <div className="h-32 mt-3 rounded-lg bg-black/[0.03] animate-pulse" /> : data && <DayBars days={data.days} pick={(d) => d.app} color={BAR_PAST} label="앱" />}
        </FlowCard>
        <FlowCard title={`웹으로 온 QR · ${span || "기간"}`} value={webNow} unit="건" loading={loading}
          tag={data ? compare(webNow ?? 0, webPrev, "건") : null}
          sub={data ? `웹 QR 방문 ${data.visits_web.toLocaleString()} · 웹 스탬프 ${data.stamps_web.toLocaleString()} · ${prevSpan} ${webPrev.toLocaleString()}건` : null}>
          {loading ? <div className="h-32 mt-3 rounded-lg bg-black/[0.03] animate-pulse" /> : data && <DayBars days={data.days} pick={(d) => d.web} color={BAR_NOW} label="웹" />}
        </FlowCard>
      </div>

      {data && (
        <Card className="mb-4">
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            <MetricBox label="QR 쿠폰 받음" value={`${data.coupons_issued.toLocaleString()}장`} sub={`앞 기간 ${data.previous.coupons_issued.toLocaleString()}장`} />
            <MetricBox label="QR 쿠폰 씀" value={`${data.coupons_redeemed.toLocaleString()}장`} sub={`받은 것의 ${pct(data.coupons_redeemed, data.coupons_issued)}`} />
            <MetricBox label="웹에서 가입" value={`${data.web_signups.toLocaleString()}명`} sub={`앞 기간 ${data.previous.web_signups.toLocaleString()}명`} />
            <MetricBox label="QR 이 쓰인 매장" value={`${data.stores.toLocaleString()}곳`} sub={`앞 기간 ${data.previous.stores.toLocaleString()}곳`} />
          </div>
        </Card>
      )}

      {data && (
        <Card className="mb-4" title="매장별" description={`${span} · 많은 순 · QR 기록이 있는 매장만`}>
          {data.store_rows.length === 0 ? (
            <p className="text-[13px] text-gray-500">이 기간에는 QR 기록이 없습니다.</p>
          ) : (
            <Table minWidth="34rem">
              <thead>
                <tr><Th>매장</Th><Th align="right">앱 QR</Th><Th align="right">웹 QR</Th><Th align="right">웹 스탬프</Th><Th align="right">QR 쿠폰 받음</Th><Th align="right">씀</Th></tr>
              </thead>
              <tbody>
                {data.store_rows.map((s) => (
                  <tr key={s.restaurant_id}>
                    <Td>{s.name}</Td>
                    <Td align="right" numeric>{s.visits_app.toLocaleString()}</Td>
                    <Td align="right" numeric>{s.visits_web.toLocaleString()}</Td>
                    <Td align="right" numeric>{s.stamps_web.toLocaleString()}</Td>
                    <Td align="right" numeric>{s.coupons_issued.toLocaleString()}</Td>
                    <Td align="right" numeric>{s.coupons_redeemed.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Fold label="숫자 읽는 법">
        <ul className="text-[12px] text-gray-600 leading-relaxed list-disc pl-4 space-y-1">
          <li>QR 을 찍으면 브릿지가 앱이 있는 손님은 앱 식당 화면으로, 없는 손님은 웹 스탬프로 보냅니다(11/16 부터).</li>
          <li>「앱 QR」·「웹 QR」은 QR 방문 적립이 된 건수입니다. 앱과 웹은 요청 키 모양으로 가릅니다. 하루 한도에 걸렸거나 로그인 전에 끝난 스캔은 적립 기록이 없어 여기엔 안 잡힙니다.</li>
          <li>「웹 스탬프」는 웹 화면에서 PIN 으로 찍은 스탬프, 「웹에서 가입」은 웹 스탬프에서 카카오로 처음 가입한 사람입니다. 둘 다 11/25 부터 표시가 남습니다.</li>
          <li>QR 쿠폰은 하루짜리라 안 쓰면 다음 날 쿠폰함에서 지워집니다. 지우기 직전에 따로 적어 두어 「받음」은 줄지 않습니다(11/25 전에 지워진 것은 못 셉니다).</li>
          <li>앞 기간은 바로 앞 같은 길이 기간이고, 차이가 작으면 「비슷」으로 봅니다(±2√합). 앱 DB 값만 쓰고 GA4 는 섞지 않았습니다.</li>
        </ul>
      </Fold>
    </>
  );
}
