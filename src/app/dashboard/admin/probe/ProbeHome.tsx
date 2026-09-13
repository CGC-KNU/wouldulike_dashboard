"use client";

import { useEffect, useState } from "react";
import { IconBrandSlack } from "@tabler/icons-react";
import { TOOLS, slackUrl } from "@/lib/satellite";
import { Button, Card, Chip, Kpi, PageHeader, Skeleton, todayLocal } from "../_shared/ui";

/**
 * Probe · 홈. 세 화면(매장 지표 · 앱 지표 · 정합성)의 머리만 모아 놓는다.
 * 데이터 툴의 홈은 "오늘 뭐가 이상한가"에 답하면 된다. 그래서 정합성 높음이 맨 앞이다.
 */

export default function ProbeHome({ onGo }: { onGo: (tab: string) => void }) {
  const [ov, setOv] = useState<{ totals?: Record<string, number>; source?: string } | null>(null);
  const [q, setQ] = useState<{ counts?: Record<string, number>; backend_reachable?: boolean; generated_at?: string } | null>(null);
  const [app, setApp] = useState<{ sources?: { key: string; label: string; connected: boolean }[]; groups?: { metrics: { value: number | null }[] }[] } | null>(null);
  const [ins, setIns] = useState<{ insights?: { store: string; topic: string; checkpoint: string; age_days: number | null; due?: boolean }[]; papillon_reachable?: boolean } | null>(null);
  const [mil, setMil] = useState<{ rounds?: { id: string; date: string; weekday: string; result: string; pool_count: number | null; seats: { fixed: number; random: number } }[] } | null>(null);

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/probe/overview").then((d) => setOv(d ?? {}));
    j("/api/probe/quality").then((d) => setQ(d ?? {}));
    j("/api/probe/app").then((d) => setApp(d ?? {}));
    j("/api/probe/insights").then((d) => setIns(d ?? {}));
    j("/api/probe/mileage").then((d) => setMil(d ?? {}));
  }, []);
  const today = todayLocal();
  const due = (ins?.insights ?? []).filter((i) => i.due);
  const nextRound = (mil?.rounds ?? []).find((r) => r.date >= today && r.result === "scheduled") ?? null;
  const held = (mil?.rounds ?? []).filter((r) => r.result === "held").length;

  const loading = !ov || !q || !app;
  const filled = app?.groups?.flatMap((g) => g.metrics).filter((m) => m.value !== null).length ?? 0;
  const total = app?.groups?.flatMap((g) => g.metrics).length ?? 0;
  const probe = TOOLS.probe;

  return (
    <>
      <PageHeader
        title="데이터 홈"
        description="리포트 만들 때가 된 홍보 게시물, 추첨 응모풀, 어긋난 데이터. 숫자를 누르면 해당 화면으로 갑니다."
        actions={<a href={slackUrl(probe)} target="_blank" rel="noreferrer"><Button icon={<IconBrandSlack />}>#{probe.slack.channel}</Button></a>}
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="리포트 만들 때" value={!ins ? "-" : due.length} tone="alert" hint="D+7 지났는데 리포트 없음" onClick={() => onGo("probe-reports")} />
        <Kpi label="추첨 응모풀" value={!mil ? "-" : nextRound ? (nextRound.pool_count === null ? "미확인" : nextRound.pool_count) : "-"} tone={nextRound && nextRound.pool_count === null ? "alert" : "plain"} hint={nextRound ? `다음 ${Number(nextRound.date.slice(5, 7))}/${Number(nextRound.date.slice(8))}(${nextRound.weekday}) 20시 · 보류 ${held}회` : "이번 달 남은 회차 없음"} onClick={() => onGo("probe-mileage")} />
        <Kpi label="정합성 · 높음" value={loading ? "-" : q?.counts?.high ?? 0} tone="alert" hint="사용자에게 이미 보이는 문제" onClick={() => onGo("probe-quality")} />
        <Kpi label="조용한 매장" value={loading ? "-" : ov?.totals?.silent ?? 0} tone="alert" hint="이번 달 쿠폰·스탬프 0" onClick={() => onGo("probe-metrics")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="매장 리포트" description="Papillon 게시물에 들어간 제휴 매장 · 사장님께 보내는 링크" actions={<Button size="sm" variant="ghost" onClick={() => onGo("probe-reports")}>열기</Button>}>
          {!ins ? <Skeleton rows={3} cols={2} /> : ins.papillon_reachable === false ? <p className="text-[12px] text-red-600">Papillon 기획 목록을 못 읽었습니다.</p> : due.length === 0 ? <p className="text-[13px] text-gray-500">리포트 만들 때가 된 게시물이 없습니다.</p> : (
            <ul className="space-y-1.5 text-[13px]">{due.slice(0, 4).map((i, k) => <li key={k} className="flex items-center justify-between gap-2"><span className="text-gray-800 truncate"><b>{i.store}</b> · {i.topic}</span><Chip tone="amber">D+{i.age_days ?? "?"}</Chip></li>)}</ul>
          )}
        </Card>
        <Card title="마일리지 추첨" description="수 · 금 20시 · 응모풀 확인 · 결과 기록" actions={<Button size="sm" variant="ghost" onClick={() => onGo("probe-mileage")}>열기</Button>}>
          {!mil ? <Skeleton rows={3} cols={2} /> : (
            <div className="space-y-2 text-[13px]">
              <Row label="다음 회차" value={nextRound ? `${Number(nextRound.date.slice(5, 7))}/${Number(nextRound.date.slice(8))} (${nextRound.weekday})` : "-"} />
              <Row label="응모풀" value={nextRound ? (nextRound.pool_count === null ? "미확인" : String(nextRound.pool_count)) : "-"} tone={nextRound?.pool_count === null ? "red" : undefined} />
              <Row label="이번 달 보류" value={String(held)} tone={held ? "red" : undefined} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="정합성 점검" actions={<Button size="sm" variant="ghost" onClick={() => onGo("probe-quality")}>열기</Button>}>
          {loading ? <Skeleton rows={3} cols={2} /> : (
            <div className="space-y-2 text-[13px]">
              <Row label="높음" value={q?.counts?.high ?? 0} tone="red" />
              <Row label="보통" value={q?.counts?.medium ?? 0} tone="amber" />
              <Row label="낮음" value={q?.counts?.low ?? 0} tone="gray" />
              {q?.backend_reachable === false && <p className="text-[12px] text-red-600 pt-1">백엔드를 못 읽어 규칙이 침묵합니다.</p>}
            </div>
          )}
        </Card>
        <Card title="매장 지표" actions={<Button size="sm" variant="ghost" onClick={() => onGo("probe-metrics")}>열기</Button>}>
          {loading ? <Skeleton rows={3} cols={2} /> : (
            <div className="space-y-2 text-[13px]">
              <Row label="제휴 매장" value={ov?.totals?.affiliate ?? 0} />
              <Row label="이번 달 쿠폰 사용" value={ov?.totals?.coupon_redeemed ?? 0} />
              <Row label="이번 달 스탬프" value={ov?.totals?.stamp_earned ?? 0} />
              {ov?.source === "preview-snapshot" && <p className="text-[12px] text-gray-500 pt-1">미리보기 모드라 지표는 비어 있습니다.</p>}
            </div>
          )}
        </Card>
        <Card title="앱 지표 출처" actions={<Button size="sm" variant="ghost" onClick={() => onGo("probe-app")}>열기</Button>}>
          {loading ? <Skeleton rows={3} cols={2} /> : (
            <ul className="space-y-2">
              {app?.sources?.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-700">{s.label}</span>
                  {s.connected ? <Chip tone="green" dot>연결됨</Chip> : <Chip tone="gray">연결 전</Chip>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: number | string; tone?: "red" | "amber" | "gray" }) {
  const c = tone === "red" && (typeof value === "string" || value > 0) ? "text-red-600" : "text-gray-900";
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-bold tabular-nums ${c}`}>{typeof value === "number" ? value.toLocaleString() : value}</span>
    </div>
  );
}
