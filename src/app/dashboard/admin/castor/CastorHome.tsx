"use client";

import { useMemo, useState } from "react";
import { IconBrandSlack, IconCopy } from "@tabler/icons-react";
import { TOOLS, slackUrl } from "@/lib/satellite";
import { ITEM_STATE_LABEL, OWNER_LABEL, type ChangesDoc, type AppGraph, type ItemState, type RoadmapDoc, type RoadmapItem } from "@/lib/castor/app";
import { Button, Card, Chip, Kpi, Notice, PageHeader, Select, Skeleton, type ChipTone } from "../_shared/ui";
import { fmtWhen, useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 홈 (1008 착수). 기획안 Castor 절 C6 로드맵의 0~2단계를 한 판에 둔다.
 *  0단계 화면 ID · 계측 — 1단계 지도 · 흐름 — 2단계 편집 · 변경 · 조사.
 * 앱 · 백엔드 연결(라우트 이름 · setUserId · 원격 설정)은 재민 몫이라, 그 항목은 "재민에게 넘길 것"으로 모아 슬랙 문장으로 꺼낸다.
 */

const STAGES: { n: 0 | 1 | 2; title: string; sub: string }[] = [
  { n: 0, title: "0단계 · 화면 ID · 계측", sub: "라우트 이름 = GA4 화면 이름 · 계측 정의서 · 이벤트 감시" },
  { n: 1, title: "1단계 · 지도 · 흐름", sub: "앱 화면 지도 · 퍼널 3개 · 데이터 신선도" },
  { n: 2, title: "2단계 · 편집 · 변경 · 조사", sub: "변경 보드 · 원격 설정(문구 · 기본값) · 이슈/PR 초안" },
];
const STATE_TONE: Record<ItemState, ChipTone> = { todo: "gray", doing: "blue", done: "green", blocked: "red" };

export default function CastorHome({ onGo }: { onGo: (tab: string) => void }) {
  const road = useCastorDoc<RoadmapDoc>("roadmap");
  const graph = useCastorDoc<AppGraph>("app_graph");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const health = useCastorHealth();
  const [copied, setCopied] = useState(false);

  const items = road.data?.items ?? [];
  const g = graph.data;
  const cards = changes.data?.cards ?? [];
  const codeEvents = useMemo(() => new Set((g?.events ?? []).filter((e) => e.used.length).map((e) => e.name)), [g]);
  const zero = useMemo(() => {
    if (!health?.ok) return [];
    const seen = new Map(health.events.map((e) => [e.name, e]));
    return [...codeEvents].filter((n) => (seen.get(n)?.d7 ?? 0) === 0);
  }, [health, codeEvents]);
  const unnamed = health?.ok ? health.screen_views.find((s) => s.screen === "(이름 없음)")?.views ?? 0 : 0;
  const totalViews = health?.ok ? health.screen_views.reduce((a, s) => a + s.views, 0) : 0;

  const handoff = useMemo(() => {
    const r = items.filter((i) => i.owner !== "us" && i.state !== "done");
    const c = cards.filter((x) => x.path === "dev" && x.status !== "done" && !x.handed_off_at);
    return { r, c };
  }, [items, cards]);

  async function setState(it: RoadmapItem, state: ItemState) {
    await road.save({ items: items.map((x) => (x.id === it.id ? { ...x, state } : x)) });
  }

  function slackText() {
    const lines = ["재민님, Castor(세틀라이트 앱 구조 툴) 0~2단계 시작했어요. 저희 쪽은 지도·계측 정의서·변경 보드까지 만들어 두었고, 앱 쪽에서 해 주셔야 하는 것만 모았습니다."];
    handoff.r.forEach((i, k) => lines.push(`${k + 1}. [${i.stage}단계] ${i.title}${i.note ? ` — ${i.note}` : ""}`));
    if (handoff.c.length) {
      lines.push("", "변경 보드에서 개발이 필요한 카드:");
      handoff.c.forEach((x) => lines.push(`• ${x.title}${x.screen ? ` (${x.screen})` : ""}${x.next ? ` → ${x.next}` : ""}`));
    }
    lines.push("", "자세한 건 세틀라이트 › Castor 에 있어요. 순서나 방식 다르게 가는 게 낫다 싶으면 편하게 말씀 주세요!");
    return lines.join("\n");
  }

  const castor = TOOLS.castor;
  const loading = !road.loaded || !graph.loaded;

  return (
    <>
      <PageHeader
        title="앱 구조 홈"
        description="사용자 앱을 바꾸기 전에 여기서 먼저 봅니다 — 화면 지도 · 흐름 · 계측 · 변경 보드."
        actions={<a href={slackUrl(castor)} target="_blank" rel="noreferrer"><Button icon={<IconBrandSlack />}>#{castor.slack.channel}</Button></a>}
      />
      {road.error && <div className="mb-3"><Notice tone="red" title={road.error} /></div>}

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-5">
        <Kpi label="앱 화면" value={loading ? "-" : g?.screens.length ?? 0} hint={g ? `코드 ${g.source.commit} · 못 잡은 이동 ${g.unresolved.length}` : "지도 불러오기 전"} onClick={() => onGo("castor-map")} />
        <Kpi label="코드 속 이벤트" value={loading ? "-" : codeEvents.size} hint="앱이 보내는 것" onClick={() => onGo("castor-events")} />
        <Kpi label="7일간 0건" value={health === undefined ? "-" : health?.ok ? zero.length : "-"} tone={zero.length ? "alert" : "plain"} hint={health?.ok ? `확정 ${health.through} 까지` : health?.reason ?? "연결 전"} onClick={() => onGo("castor-events")} />
        <Kpi label="이름 없는 화면 기록" value={health?.ok && totalViews ? `${Math.round((unnamed / totalViews) * 100)}%` : "-"} tone={unnamed ? "alert" : "plain"} hint="라우트 이름이 없으면 지도 이동량을 못 잰다" onClick={() => onGo("castor-flow")} />
        <Kpi label="변경 카드" value={!changes.loaded ? "-" : cards.filter((c) => c.status !== "done").length} hint={`결론 ${cards.filter((c) => c.status === "done").length}`} onClick={() => onGo("castor-changes")} />
      </div>

      {loading ? <Skeleton rows={4} cols={3} /> : items.length === 0 ? (
        <Notice tone="blue" title="단계 체크리스트가 아직 없습니다">기획안 Castor 절(C6)의 0~2단계 항목을 채우면 여기 진행판이 됩니다.</Notice>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          {STAGES.map((s) => {
            const list = items.filter((i) => i.stage === s.n);
            const done = list.filter((i) => i.state === "done").length;
            return (
              <Card key={s.n} title={s.title} description={s.sub} actions={<Chip tone={done === list.length && list.length ? "green" : "navy"}>{done}/{list.length}</Chip>}>
                <ul className="divide-y divide-gray-100">
                  {list.map((i) => (
                    <li key={i.id} className="py-2.5 flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[13px] font-semibold ${i.state === "done" ? "text-gray-400 line-through" : "text-gray-900"}`}>{i.title}</span>
                        <span className="flex flex-wrap items-center gap-1 mt-1">
                          <Chip tone={i.owner === "us" ? "navy" : i.owner === "jaemin" ? "amber" : "blue"}>{OWNER_LABEL[i.owner]}</Chip>
                          {i.note && <span className="text-[11.5px] text-gray-500">{i.note}</span>}
                        </span>
                      </span>
                      <Select aria-label={`${i.title} 상태`} value={i.state} disabled={road.saving} onChange={(e) => setState(i, e.target.value as ItemState)} className="!w-auto !py-1 !text-[12px]">
                        {(Object.keys(ITEM_STATE_LABEL) as ItemState[]).map((k) => <option key={k} value={k}>{ITEM_STATE_LABEL[k]}</option>)}
                      </Select>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-1">{list.map((i) => <span key={i.id} className={`h-1.5 flex-1 min-w-[14px] rounded-full ${i.state === "done" ? "bg-emerald-500" : i.state === "doing" ? "bg-blue-500" : i.state === "blocked" ? "bg-red-500" : "bg-gray-200"}`} title={`${i.title} · ${ITEM_STATE_LABEL[i.state]}`} />)}</div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="재민에게 넘길 것" description="앱 · 백엔드에서만 할 수 있는 일. 변경 보드의 개발 카드도 함께 모입니다."
          actions={<Button size="sm" icon={<IconCopy size={14} />} disabled={!handoff.r.length && !handoff.c.length} onClick={async () => { await navigator.clipboard.writeText(slackText()); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? "복사했습니다" : "슬랙 문장 복사"}</Button>}>
          {!handoff.r.length && !handoff.c.length ? <p className="text-[13px] text-gray-500">넘길 것이 없습니다.</p> : (
            <ul className="space-y-1.5">
              {handoff.r.map((i) => <li key={i.id} className="text-[13px] text-gray-800 flex gap-2"><Chip tone={STATE_TONE[i.state]}>{i.stage}단계</Chip><span>{i.title}</span></li>)}
              {handoff.c.map((x) => <li key={x.id} className="text-[13px] text-gray-800 flex gap-2"><Chip tone="amber">카드</Chip><span>{x.title}{x.screen && <span className="text-gray-400"> · {x.screen}</span>}</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="데이터 신선도" description="숫자가 언제 것인지 — 오래됐으면 여기서 먼저 보입니다.">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-gray-500">앱 지도</dt><dd className="text-gray-900">{g ? `${fmtWhen(g.generated_at)} · 커밋 ${g.source.commit}` : "아직 불러오지 않음"}</dd>
            <dt className="text-gray-500">GA4 확정 테이블</dt><dd className="text-gray-900">{health === undefined ? "확인 중…" : health?.ok ? `${health.through} 까지 (최근 7일 ${health.window?.from} ~)` : health?.reason ?? "연결 전"}</dd>
            <dt className="text-gray-500">사용자 식별</dt><dd className="text-gray-900">{health?.ok ? `이벤트의 ${health.user_id_share ?? 0}% 에 user_id` : "—"}{g && <span className="text-gray-400"> · 코드에 setUserId {g.user_id_set ? "있음" : "없음"}</span>}</dd>
            <dt className="text-gray-500">단계판</dt><dd className="text-gray-900">{road.updatedAt ? `${fmtWhen(road.updatedAt)} · ${road.updatedBy ?? ""}` : "—"}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
