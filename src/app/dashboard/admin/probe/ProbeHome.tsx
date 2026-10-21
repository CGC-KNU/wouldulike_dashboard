"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconBrandSlack, IconChartBar, IconCheck, IconFileDescription, IconGift } from "@tabler/icons-react";
import { TOOLS, slackUrl } from "@/lib/satellite";
import { isFailing, isSilent } from "@/lib/draft/storeMetrics";
import type { QualityIssue, StoreActivity, StoreMetric, StoreReport } from "@/lib/draft/types";
import { Button, Card, Chip, Notice, PageHeader, Skeleton, todayLocal } from "../_shared/ui";
import { fetchJson } from "../_shared/fetchJson";
import { Unknown, md, missingAppWarnNow, openDateOf, ownerOf, weekdayOf } from "./kit";

/**
 * Probe · 홈 — 「오늘 할 일」(1022 목업, 기획팀 검토 D2).
 *
 * 예전 홈은 메뉴 요약 카드를 되풀이해 다음에 할 일을 못 모아 줬다. 이제 줄 하나가 일 하나이고, 버튼이 그 일을 바로 연다.
 *   오늘 추첨 · 리포트 만들 때 · 초안 입력/승인 대기 · 카톡 보낸 뒤 보냄 표시 · 앱 회차 없음 · 정합성 높음 · 사용 실패 매장
 * 아래 한 줄 지표(WAU · 쿠폰 사용 · 조용한 유료 매장 · 7일 안 만료 쿠폰)는 각 지표 화면의 입구다.
 *
 * 못 읽은 출처는 줄을 지어내지 않는다 — 위에서 무엇을 못 읽었는지 말하고, 그 출처의 줄은 아예 만들지 않는다(0 이 아니라 모름).
 * 지난달 월간 보고서 미발송 · 식사권 정산 D-N · 캠페인 편입 기한(v4)은 기록이 아직 없어(목업에서도 「개발 중」) 줄을 두지 않았다.
 */

interface Round { id: string; date: string; weekday: string; result: "scheduled" | "drawn" | "held" | "skipped"; pool_count: number | null }
interface DayProgress { entries: number; people: number; winners: number }
interface Task { icon: ReactNode; title: string; n?: number; status?: ReactNode; meta: ReactNode; label: string; go: string; todo: boolean }

const R_LABEL = { scheduled: "예정", drawn: "추첨 완료", held: "보류", skipped: "미운용" } as const;
const R_TONE = { scheduled: "navy", drawn: "green", held: "red", skipped: "gray" } as const;

export default function ProbeHome({ onGo }: { onGo: (tab: string) => void }) {
  const [ov, setOv] = useState<{ stores?: StoreMetric[] } | null>(null);
  const [q, setQ] = useState<{ issues?: QualityIssue[]; backend_reachable?: boolean } | null>(null);
  const [app, setApp] = useState<{ groups?: { metrics: { key: string; value: number | null; unit?: string }[] }[] } | null>(null);
  const [ins, setIns] = useState<{ insights?: { store: string; due?: boolean; sent_report: { id: string } | null }[]; papillon_reachable?: boolean } | null>(null);
  const [reps, setReps] = useState<{ reports?: StoreReport[] } | null>(null);
  const [mil, setMil] = useState<{ rounds?: Round[]; progress?: Record<string, DayProgress> | null } | null>(null);
  const [act, setAct] = useState<{ ok?: boolean; window?: unknown; stores?: Record<string, StoreActivity> } | null>(null);

  /**
   * 0925: 못 읽은 것을 `{}` 로 채웠다. `{}` 는 참이라 `loading` 이 꺼지고, 화면은
   * "정합성 높음 0 · 조용한 매장 0 · 이번 달 쿠폰 사용 0" 을 **사실처럼** 찍었다.
   * 아무것도 못 읽은 그 순간에. 무엇을 못 읽었는지 위에서 말한다.
   */
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    // 런처의 현황(useSatelliteStatus)이 방금 읽은 주소는 fetchJson 이 30초 안의 값을 같이 쓴다 — 같은 걸 다시 부르지 않는다(1013)
    const j = <T,>(u: string, label: string, set: (d: T | null) => void) =>
      fetchJson<Record<string, any>>(u) // eslint-disable-line @typescript-eslint/no-explicit-any
        .then((d) => {
          if (d === null) setFailed((prev) => (prev.includes(label) ? prev : [...prev, label]));
          set((d as T | null) ?? ({} as T));
        });
    j("/api/probe/overview", "매장 지표", setOv);
    j("/api/probe/quality", "정합성", setQ);
    j("/api/probe/app", "앱 지표", setApp);
    j("/api/probe/insights", "인사이트", setIns);
    j("/api/probe/reports", "매장 리포트", setReps);
    j("/api/probe/mileage", "마일리지", setMil);
    // GA4 는 느리다 — 늦거나 실패해도 나머지 줄은 먼저 뜬다. 실패하면 「사용 실패 매장」 줄만 없다
    fetchJson<Record<string, any>>("/api/probe/store-activity").then((d) => setAct(d ?? { ok: false })); // eslint-disable-line @typescript-eslint/no-explicit-any
  }, []);

  const today = todayLocal();
  const loading = !ov || !q || !app || !ins || !reps || !mil;
  const stores = ov?.stores ?? [];
  const metric = (key: string) => app?.groups?.flatMap((g) => g.metrics).find((m) => m.key === key);

  const tasks = useMemo<Task[]>(() => {
    if (loading) return [];
    const T: Task[] = [];
    const names = (list: string[]) => (list.length > 2 ? `${list.slice(0, 2).join(" · ")} 외 ${list.length - 2}` : list.join(" · "));

    // ── 마일리지 — 오늘 추첨 · 응모가 안 열린 회차
    const rounds = mil?.rounds ?? [];
    const progress = mil?.progress ?? null;
    const todayRound = rounds.find((r) => r.date === today) ?? null;
    const next = rounds.find((r) => r.date >= today && r.result === "scheduled") ?? null;
    const prog = (d: string) => progress?.[d] ?? null;
    if (todayRound) {
      const tp = prog(todayRound.date);
      const np = next ? prog(next.date) : null;
      T.push({ icon: <IconGift size={16} />, title: `${md(todayRound.date)}(${todayRound.weekday}) 11:00 추첨`, status: <Chip tone={R_TONE[todayRound.result]}>{R_LABEL[todayRound.result]}</Chip>,
        meta: <>{tp ? `응모 ${tp.entries}건 · 당첨 ${tp.winners}명` : <>응모 <Unknown /></>}{next && next.id !== todayRound.id ? <> · 다음 {md(next.date)}({next.weekday}) 응모 {np ? `${np.entries}건` : <Unknown />}</> : null}</>,
        label: "회차", go: `probe-mileage?open=${todayRound.id}`, todo: todayRound.result === "scheduled" });
    }

    // ── 매장 리포트 — 만들 때 · 입력 승인 대기 · 보냄 표시 대기
    const reports = reps?.reports ?? [];
    const make = (ins?.insights ?? []).filter((i) => i.due && !i.sent_report);
    const draft = reports.filter((r) => r.status === "DRAFT");
    const send = reports.filter((r) => r.status === "APPROVED" || r.status === "LINKED");
    const rname = (r: StoreReport) => r.snapshot.store.name;
    if (make.length) T.push({ icon: <IconFileDescription size={16} />, title: "리포트 만들 때", n: make.length, meta: `D+14 지났는데 리포트가 없는 게시물 — ${names(make.map((i) => i.store))}`, label: "만들기", go: "probe-reports?stage=make", todo: true });
    if (draft.length) T.push({ icon: <IconFileDescription size={16} />, title: "초안 지표 입력 · 승인 대기", n: draft.length, meta: `인스타 인사이트 숫자를 넣고 승인하면 슬랙에 PNG 가 올라갑니다 — ${names(draft.map(rname))}`, label: "이어서", go: `probe-reports?open=${draft[0].id}`, todo: true });
    if (send.length) T.push({ icon: <IconCheck size={16} />, title: "카톡 보낸 뒤 보냄 표시 대기", n: send.length, meta: `승인은 끝났고, 사장님께 보냈다는 표시가 아직 없습니다 — ${names(send.map(rname))}`, label: "보냄 표시", go: `probe-reports?open=${send[0].id}`, todo: true });

    // ── 앱 회차 없음 — 응모가 7일 안에 열려야 하는데 앱에 회차가 없다. 앱 기록을 못 읽으면 알 수 없어 줄을 만들지 않는다
    if (progress) {
      for (const r of rounds.filter((x) => x.result === "scheduled" && !progress[x.date] && missingAppWarnNow(x.date))) {
        const od = openDateOf(r.date);
        T.push({ icon: <IconGift size={16} />, title: `앱 회차 없음 ${md(r.date)}(${r.weekday})`, status: <Chip tone="amber">확인 필요</Chip>, meta: `${md(od)}(${weekdayOf(od)})에 응모가 열려야 합니다 — 앱에 회차를 만들어야 학생이 응모할 수 있습니다`, label: "만들기", go: `probe-mileage?open=${r.id}`, todo: true });
      }
    } else {
      T.push({ icon: <IconGift size={16} />, title: "앱 회차 확인 불가", status: <Unknown />, meta: "앱 마일리지 기록을 못 읽어 다음 회차가 앱에 있는지 알 수 없습니다 — 운영 시트를 확인하세요", label: "마일리지", go: "probe-mileage", todo: true });
    }

    // ── 정합성 높음 — 담당별로
    const highs = (q?.issues ?? []).filter((i) => i.severity === "high");
    if (highs.length) {
      const owners = (["영업", "운영", "개발"] as const).map((o) => [o, highs.filter((i) => ownerOf(i) === o).length] as const).filter(([, n]) => n);
      T.push({ icon: <IconAlertTriangle size={16} />, title: "정합성 높음", n: highs.length, status: <Chip tone="red" dot>높음</Chip>, meta: `담당 ${owners.map(([o, n]) => `${o} ${n}`).join(" · ")}`, label: "보기", go: "probe-quality?sev=high", todo: true });
    }

    // ── 사용 실패 매장 — GA4. 못 읽었으면 줄이 없다
    if (act?.ok && act.window && act.stores) {
      const failing = stores.filter((s) => isFailing(s, act.stores?.[String(s.restaurant_id)]));
      const unresolved = failing.reduce((a, s) => a + (act.stores?.[String(s.restaurant_id)]?.coupon_unresolved ?? 0), 0);
      if (failing.length) T.push({ icon: <IconChartBar size={16} />, title: "사용 실패 매장", n: failing.length, meta: `학생이 쿠폰 · 스탬프를 못 쓴 매장${unresolved ? ` — 아직 못 쓴 쿠폰 ${unresolved}장` : ""} · ${names(failing.map((s) => s.name))}`, label: "보기", go: "probe-metrics?scope=failing", todo: true });
    }
    return T;
  }, [loading, mil, reps, ins, q, act, stores, today]);

  const firstTodo = tasks.findIndex((t) => t.todo);
  const wau = metric("wau"), coupon = metric("coupon_used"), expiring = metric("coupon_expiring");
  const silentPaid = stores.filter((s) => isSilent(s) && (s.tier === "BOOST" || s.tier === "CONTENT")).length;
  const val = (m: { value: number | null; unit?: string } | undefined, unit: string) => (!m || m.value === null ? null : `${m.value.toLocaleString()}${unit}`);
  const stat = (label: string, value: string | null, go: string) => (
    <button key={label} type="button" onClick={() => onGo(go)} className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] text-[12px] text-gray-600 hover:bg-navy/[0.05] transition-colors">
      {label}{value === null ? <Unknown /> : <b className="text-[15px] text-gray-900 tabular-nums">{value}</b>}
    </button>
  );
  const dow = weekdayOf(today);

  return (
    <>
      <PageHeader title="오늘 할 일" description={`${md(today)}(${dow}) 기준 · 버튼을 누르면 그 일을 바로 엽니다.${failed.length ? ` ${failed.join(" · ")} 을(를) 읽지 못했습니다 — 그 출처의 줄은 없고, 0 이 아니라 모름입니다.` : ""}`}
        actions={<a href={slackUrl(TOOLS.probe)} target="_blank" rel="noreferrer"><Button icon={<IconBrandSlack />}>#{TOOLS.probe.slack.channel}</Button></a>} />

      {failed.length > 0 && !loading && <div className="mb-4"><Notice tone="amber" title="일부 출처를 읽지 못했습니다">{failed.join(" · ")} — 「미확인」은 0 이 아니라 모름입니다.</Notice></div>}

      <Card flush className="mb-4">
        {loading ? <Skeleton rows={4} cols={2} /> : tasks.length === 0 ? (
          <p className="px-4 py-6 text-[15px] font-semibold text-gray-900">오늘 할 일이 없습니다</p>
        ) : (
          <ul>
            {tasks.map((t, i) => (
              <li key={`${t.title}-${i}`} className={`flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 ${i ? "border-t border-black/[0.06]" : ""}`}>
                <span className="w-8 h-8 rounded-[10px] bg-navy/[0.07] text-navy flex items-center justify-center shrink-0" aria-hidden="true">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`flex items-center gap-2 flex-wrap text-[15px] font-semibold leading-tight ${t.todo ? "text-gray-900" : "text-gray-600"}`}>{t.title}{t.n ? <span className="font-bold tabular-nums">{t.n}</span> : null}{t.status}</p>
                  <p className="text-[12px] text-gray-600 mt-1 leading-relaxed">{t.meta}</p>
                </div>
                <Button size="sm" variant={i === firstTodo ? "primary" : "secondary"} onClick={() => onGo(t.go)} className="ml-12 sm:ml-0">{t.label}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap gap-2" aria-label="지표 한 줄">
        {stat("주간 활성(WAU)", val(wau, "명"), "probe-app?grp=usage")}
        {stat("이번 달 쿠폰 사용", val(coupon, "건"), "probe-app?grp=funnel")}
        {stat("조용한 유료 매장", ov ? `${silentPaid}곳` : null, "probe-metrics?scope=silent")}
        {stat("7일 안 만료 쿠폰", val(expiring, "장"), "probe-app?grp=funnel")}
      </div>
    </>
  );
}
