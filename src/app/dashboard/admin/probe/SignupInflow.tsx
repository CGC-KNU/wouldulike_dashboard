"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button, Card, Chip, FilterPills, Notice, PageHeader, Table, Td, Th, type ChipTone } from "../_shared/ui";
import { AsOf, BAR_INK, BAR_NOW, BAR_PAST, Fold, FlowCard, md } from "./kit";
import { flowOf } from "@/lib/bigquery/liveShape";

/**
 * Probe · 신규 유입 — 기간 안에 새로 가입한 사람을 대학가별로 보고, 계명대 프로모션 쿠폰이 어디까지 갔는지 본다 (1125 민찬).
 *
 * 숫자는 모두 백엔드 /api/probe/signup-inflow/(probe/signup_inflow.py)가 앱 DB 에서 센다 — GA4 를 섞지 않는다.
 *   · 대학가는 지금 프로필 값이다(바꾼 기록이 없다). 테스트 계정 제외. 탈퇴한 사람은 셀 수 없다.
 *   · 프로모션 쿠폰은 만료 뒤 쿠폰함을 열면 지워지는데, 백엔드가 지우기 전에 옮겨 적어 「받은 수」가 줄지 않는다.
 * 견준 말은 바로 앞 같은 길이 기간과 — flowOf(±2√합) 라 작은 차이는 「비슷」이다.
 */

const CAMPUSES = ["경북대", "영남대", "계명대", "미설정"] as const;
type Campus = (typeof CAMPUSES)[number];
type CampusCounts = Record<Campus, number>;
interface Day { date: string; total: number; campus: CampusCounts }
interface Cohort { signed_up: number; push: number; used_coupon: number; stamped: number }
interface Store { restaurant_id: number; name: string; issued: number; redeemed: number }
interface Week {
  key: string; label: string; start_at: string; end_at: string; state: "before" | "live" | "ended";
  types_ready: boolean; types_found: number; types_expected: number;
  issued: number; redeemed: number; archived: number;
  users: number; users_new: number; redeemed_users: number; redeemed_users_new: number; stores: Store[];
}
interface Promo {
  campus: string; start_at: string; end_at: string; weeks: Week[];
  new_users: { signed_up: number; push: number; got_promo: number; used_promo: number; used_any_coupon: number };
}
interface Payload {
  start: string; end: string; as_of: string;
  previous: { start: string; end: string; total: number; campus: CampusCounts };
  total: number; campus: CampusCounts; days: Day[]; cohort: Record<Campus, Cohort>;
  kmu_promo: Promo | null;
}

// 계명대 프로모션 기간 — 백엔드 coupons/kmu_promo.py WEEKS 와 같다. 기간 고르기 버튼에만 쓴다(숫자는 응답에서).
const PROMO = { start: "2026-11-26", end: "2026-12-09" };
type RangeKey = "promo" | "d14" | "d30";

const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const rangeOf = (k: RangeKey): { start: string; end: string } => {
  const t = todayKst();
  if (k === "promo") return PROMO;
  return { start: addDays(t, k === "d14" ? -13 : -29), end: t };
};
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const signed = (d: number) => `${d > 0 ? "+" : ""}${d.toLocaleString()}`;
const kstDay = (iso: string) => md(new Date(Date.parse(iso) + 9 * 3_600_000).toISOString());

const W_LABEL: Record<Week["state"], string> = { before: "시작 전", live: "쿠폰 나가는 중", ended: "끝남" };
const W_TONE: Record<Week["state"], ChipTone> = { before: "navy", live: "green", ended: "gray" };

function compare(now: number, prev: number, what: string) {
  const f = flowOf(now, prev);
  if (!f) return null;
  return { flow: f, text: f === "same" ? `${what}과 비슷 (${signed(now - prev)}명)` : `${what}보다 ${signed(now - prev)}명` };
}

/** 가로 막대 줄 — 맨 위 값이 100% */
function Bars({ rows }: { rows: { label: string; n: number; note?: string }[] }) {
  const top = Math.max(1, rows[0]?.n ?? 0);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-gray-700">{r.label}</span>
            <span className="tabular-nums font-semibold text-gray-900">{r.n.toLocaleString()}명{r.note && <span className="ml-1.5 font-normal text-gray-500">{r.note}</span>}</span>
          </div>
          <div className="h-2 mt-1 rounded-full bg-black/[0.05] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.n / top) * 100}%`, background: BAR_INK }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DayBars({ days, pick, color, unit = "명" }: { days: Day[]; pick: (d: Day) => number; color: string; unit?: string }) {
  const today = todayKst();
  const rows = days.map((d) => ({ date: d.date, label: md(d.date), n: pick(d), future: d.date > today }));
  return (
    <div className="h-32 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={rows.length > 16 ? 6 : 1} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} formatter={(n: number) => [`${n}${unit}`, "새 가입"]} labelFormatter={(l) => String(l)} />
          <Bar dataKey="n" radius={[3, 3, 0, 0]}>
            {rows.map((r) => <Cell key={r.date} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeekCard({ w }: { w: Week }) {
  const old = w.users - w.users_new;
  return (
    <div className="rounded-[14px] border border-black/[0.06] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-semibold text-gray-900">{w.key === "W1" ? "1주" : w.key === "W2" ? "2주" : w.key}</p>
        <span className="text-[12px] text-gray-500">{w.label}</span>
        <span className="ml-auto flex gap-1.5">
          <Chip tone={W_TONE[w.state]} dot={w.state === "live"}>{W_LABEL[w.state]}</Chip>
          {w.types_ready ? <Chip tone="green">세팅됨</Chip> : <Chip tone="red">세팅 안 됨</Chip>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-[10px] bg-[#F6F7FF] px-3 py-2">
          <p className="text-[12px] text-gray-600">받은 사람</p>
          <p className="text-[20px] font-bold tabular-nums text-gray-900 leading-tight">{w.users.toLocaleString()}<span className="text-[12px] font-semibold text-gray-400 ml-0.5">명</span></p>
          <p className="text-[11px] text-gray-500 tabular-nums">새로 온 {w.users_new} · 원래 있던 {old}</p>
        </div>
        <div className="rounded-[10px] bg-[#F6F7FF] px-3 py-2">
          <p className="text-[12px] text-gray-600">쓴 사람</p>
          <p className="text-[20px] font-bold tabular-nums text-gray-900 leading-tight">{w.redeemed_users.toLocaleString()}<span className="text-[12px] font-semibold text-gray-400 ml-0.5">명</span></p>
          <p className="text-[11px] text-gray-500 tabular-nums">받은 사람의 {pct(w.redeemed_users, w.users)} · 새로 온 {w.redeemed_users_new}</p>
        </div>
        <div className="rounded-[10px] bg-[#F6F7FF] px-3 py-2">
          <p className="text-[12px] text-gray-600">쓴 쿠폰</p>
          <p className="text-[20px] font-bold tabular-nums text-gray-900 leading-tight">{w.redeemed.toLocaleString()}<span className="text-[12px] font-semibold text-gray-400 ml-0.5">장</span></p>
          <p className="text-[11px] text-gray-500 tabular-nums">받은 {w.issued.toLocaleString()}장 중{w.archived > 0 ? ` · 만료로 지워진 ${w.archived}장 포함` : ""}</p>
        </div>
      </div>
      <div className="mt-3">
        <Table minWidth="20rem" stack={false}>
          <thead><tr><Th>매장</Th><Th align="right">받음</Th><Th align="right">씀</Th><Th align="right">쓴 비율</Th></tr></thead>
          <tbody>
            {w.stores.map((s) => (
              <tr key={s.restaurant_id}>
                <Td>{s.name}</Td>
                <Td align="right" numeric>{s.issued.toLocaleString()}</Td>
                <Td align="right" numeric>{s.redeemed.toLocaleString()}</Td>
                <Td align="right" numeric>{pct(s.redeemed, s.issued)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

export default function SignupInflow() {
  const [range, setRange] = useState<RangeKey>(() => (todayKst() <= addDays(PROMO.end, 14) ? "promo" : "d14"));
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (k: RangeKey) => {
    setLoading(true);
    setErr(null);
    try {
      const { start, end } = rangeOf(k);
      const r = await fetch(`/api/probe/signups?${new URLSearchParams({ start, end })}`, { cache: "no-store" });
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
  const promo = data?.kmu_promo ?? null;
  const notReady = useMemo(() => promo?.weeks.filter((w) => !w.types_ready && w.state !== "ended") ?? [], [promo]);
  const kmuDays = data?.days ?? [];

  return (
    <>
      <PageHeader
        title="신규 유입"
        description="기간 안에 새로 가입한 사람을 대학가별로 봅니다. 대학가는 지금 프로필 값이고, 테스트 계정은 빠져 있습니다."
        actions={<><AsOf at={data?.as_of} /><Button icon={<IconRefresh />} onClick={() => void load(range)} disabled={loading}>다시 읽기</Button></>}
      />

      <div className="mb-4">
        <FilterPills soft label="기간" value={range} onChange={setRange}
          options={[{ key: "promo", label: `계명대 프로모션 ${md(PROMO.start)}~${md(PROMO.end)}` }, { key: "d14", label: "최근 14일" }, { key: "d30", label: "최근 30일" }]} />
      </div>

      {err && <div className="mb-4"><Notice tone="red" title="신규 유입을 읽지 못했습니다">{err} — 0 이 아니라 모름입니다. 다시 읽어 주세요.</Notice></div>}

      {notReady.length > 0 && (
        <div className="mb-4">
          <Notice tone="red" title={`계명대 프로모션 ${notReady.map((w) => (w.key === "W1" ? "1주" : "2주")).join(" · ")} 쿠폰이 세팅되지 않았습니다`}>
            쿠폰 타입이 없거나 꺼져 있어, 계명대 사용자가 앱을 열어도 쿠폰이 나가지 않습니다. 운영 콘솔에서 <code>python manage.py setup_kmu_promo --apply</code> 가 필요합니다.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start mb-4">
        <FlowCard title={`새 가입 · ${span || "기간"}`} value={data?.total} unit="명" loading={loading}
          tag={data ? compare(data.total, data.previous.total, "앞 기간") : null}
          sub={data ? `${prevSpan} ${data.previous.total.toLocaleString()}명 · 대학가 미설정 ${data.campus["미설정"]}명 포함` : null}>
          {loading ? <div className="h-32 mt-3 rounded-lg bg-black/[0.03] animate-pulse" /> : data && <DayBars days={data.days} pick={(d) => d.total} color={BAR_PAST} />}
        </FlowCard>
        <FlowCard title={`계명대 새 가입 · ${span || "기간"}`} value={data?.campus["계명대"]} unit="명" loading={loading}
          tag={data ? compare(data.campus["계명대"], data.previous.campus["계명대"], "앞 기간") : null}
          sub={data ? `${prevSpan} ${data.previous.campus["계명대"].toLocaleString()}명 · 전체 새 가입의 ${pct(data.campus["계명대"], data.total)}` : null}>
          {loading ? <div className="h-32 mt-3 rounded-lg bg-black/[0.03] animate-pulse" /> : data && <DayBars days={kmuDays} pick={(d) => d.campus["계명대"]} color={BAR_NOW} />}
        </FlowCard>
      </div>

      {data && (
        <Card className="mb-4" title="대학가별 · 가입한 뒤" description={`${span} 에 가입한 사람 · 쿠폰 · 스탬프는 가입한 뒤 지금까지`}>
          <Table minWidth="34rem">
            <thead>
              <tr><Th>대학가</Th><Th align="right">새 가입</Th><Th align="right">앞 기간</Th><Th align="right">알림 받을 수 있음</Th><Th align="right">쿠폰 쓴 사람</Th><Th align="right">스탬프 찍은 사람</Th></tr>
            </thead>
            <tbody>
              {CAMPUSES.map((c) => {
                const h = data.cohort[c];
                return (
                  <tr key={c}>
                    <Td><span className={c === "계명대" ? "font-semibold text-gray-900" : ""}>{c}</span></Td>
                    <Td align="right" numeric>{h.signed_up.toLocaleString()}</Td>
                    <Td align="right" numeric>{data.previous.campus[c].toLocaleString()}</Td>
                    <Td align="right" numeric>{h.push.toLocaleString()} <span className="text-gray-400">{pct(h.push, h.signed_up)}</span></Td>
                    <Td align="right" numeric>{h.used_coupon.toLocaleString()} <span className="text-gray-400">{pct(h.used_coupon, h.signed_up)}</span></Td>
                    <Td align="right" numeric>{h.stamped.toLocaleString()} <span className="text-gray-400">{pct(h.stamped, h.signed_up)}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {promo && (
        <Card className="mb-4" title="계명대 프로모션 쿠폰"
          description={`${kstDay(promo.start_at)}~${kstDay(promo.end_at)} · 대학가가 계명대인 사람이 앱을 열면 그 주 4매장 쿠폰이 나갑니다 · 기간 고르기와 상관없이 프로모션 전체`}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {promo.weeks.map((w) => <WeekCard key={w.key} w={w} />)}
          </div>
          <div className="mt-4 rounded-[14px] border border-black/[0.06] p-3.5">
            <p className="text-[14px] font-semibold text-gray-900 mb-0.5">프로모션 기간에 가입한 계명대 사람</p>
            <p className="text-[12px] text-gray-500 mb-3">가입 → 프로모션 쿠폰 받음 → 씀. 「알림 받을 수 있음」은 푸시 토큰이 있는 사람입니다.</p>
            <Bars rows={[
              { label: "가입", n: promo.new_users.signed_up },
              { label: "알림 받을 수 있음", n: promo.new_users.push, note: pct(promo.new_users.push, promo.new_users.signed_up) },
              { label: "프로모션 쿠폰 받음", n: promo.new_users.got_promo, note: pct(promo.new_users.got_promo, promo.new_users.signed_up) },
              { label: "프로모션 쿠폰 씀", n: promo.new_users.used_promo, note: pct(promo.new_users.used_promo, promo.new_users.signed_up) },
              { label: "쿠폰을 하나라도 씀(프로모션 포함)", n: promo.new_users.used_any_coupon, note: pct(promo.new_users.used_any_coupon, promo.new_users.signed_up) },
            ]} />
          </div>
        </Card>
      )}

      <Fold label="숫자 읽는 법">
        <ul className="text-[12px] text-gray-600 leading-relaxed list-disc pl-4 space-y-1">
          <li>「새 가입」은 가입한 날(한국 날짜)이 기간 안인 사람입니다. 앞 기간은 바로 앞 같은 길이 기간이고, 차이가 작으면 「비슷」으로 봅니다(±2√합).</li>
          <li>대학가는 <b>지금</b> 프로필 값입니다. 바꾼 기록이 없어 가입 때 무엇을 골랐는지는 모릅니다 — 원래 있던 사람이 계명대로 바꿔 쿠폰을 받았다면 「원래 있던」으로 잡힙니다.</li>
          <li>탈퇴한 사람은 기록째 지워져 셀 수 없습니다. 테스트 계정은 뺐습니다. 앱 DB 값만 쓰고 GA4 는 섞지 않았습니다.</li>
          <li>안 쓴 프로모션 쿠폰은 만료 뒤 쿠폰함을 열면 지워집니다. 지우기 직전에 따로 적어 두어 「받음」은 줄지 않습니다(카드의 「만료로 지워진 n장 포함」).</li>
          <li>「세팅됨」은 그 주 쿠폰 타입이 운영 DB 에 있고 켜져 있다는 뜻입니다. 「세팅 안 됨」이면 앱을 열어도 쿠폰이 나가지 않습니다.</li>
        </ul>
      </Fold>
    </>
  );
}
