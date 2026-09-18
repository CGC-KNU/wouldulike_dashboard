"use client";

import { IconBrandInstagram, IconBrandSlack, IconExternalLink, IconWorld } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl } from "@/lib/satellite";
import { FACTS, FOUNDERS, GROUPS, HEADCOUNT, LINKS, MISSION, POLARIS, TIMELINE, type Person } from "@/lib/atlas";
import { Button, Card, Chip, PageHeader } from "../_shared/ui";

/**
 * Atlas — ABOUT WOULDULIKE (팀 내부용, 민열님 0919).
 *
 * 새로 온 사람이 이 화면으로 **누가 무엇을 하고, 우리가 어디로 가는지**를 파악한다.
 * 내용은 lib/atlas.ts 한 곳에 있다. 여기는 그걸 놓는 자리만 정한다.
 * 실명·직함·슬랙 ID 를 그대로 둔다 — 내부용이라서다. 대외로 나갈 때는 다른 층을 만든다.
 */

export type AtlasTab = "atlas-team" | "atlas-mission" | "atlas-tools" | "atlas-history";

const initial = (name: string) => name.trim().slice(1, 2) || name.slice(0, 1);

function PersonRow({ p, lead = false }: { p: Person; lead?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <span className={`w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold shrink-0 ${lead ? "bg-navy text-white" : "bg-navy/[0.07] text-navy"}`} aria-hidden="true">{initial(p.name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-gray-900 leading-tight">{p.name} <span className="text-[11px] font-bold text-navy/70 ml-1">{p.title}</span></span>
        <span className="block text-[11.5px] text-gray-500 truncate">{p.role}{p.duty ? ` · ${p.duty}` : ""}</span>
      </span>
      {p.slack && (
        <a href={`https://slack.com/app_redirect?channel=${p.slack}`} target="_blank" rel="noreferrer" aria-label={`${p.name}에게 슬랙 DM`} title="슬랙 DM"
           className="shrink-0 w-7 h-7 rounded-lg text-gray-400 hover:text-navy hover:bg-navy/[0.06] flex items-center justify-center">
          <IconBrandSlack size={15} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

export default function Atlas({ tab, onGo }: { tab: AtlasTab; onGo: (tab: string) => void }) {
  const header = (
    <PageHeader
      title="ABOUT WOULDULIKE"
      description="학생은 혜택을, 가게는 손님을. 누가 무엇을 하고 우리가 어디로 가는지 — 새로 온 사람이 이 화면 하나로 잡습니다."
      actions={<>
        <a href={LINKS.site} target="_blank" rel="noreferrer"><Button variant="primary" icon={<IconWorld />}>wouldulike.kr</Button></a>
        <a href={LINKS.instagram} target="_blank" rel="noreferrer"><Button icon={<IconBrandInstagram />}>@w_ouldulike</Button></a>
        <a href={LINKS.garage} target="_blank" rel="noreferrer"><Button variant="ghost" icon={<IconBrandSlack />}>#garage 온보딩</Button></a>
      </>}
    />
  );

  if (tab === "atlas-team") {
    return (
      <>
        {header}
        <p className="text-[12.5px] text-gray-500 mb-3">직급이 아니라 기능으로 나눴습니다 · {HEADCOUNT}명 · 4그룹 · 외주 0. 슬랙 아이콘을 누르면 그 사람에게 바로 DM 이 열립니다.</p>
        <Card className="mb-3">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{FOUNDERS.map((p) => <PersonRow key={p.name} p={p} lead />)}</ul>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {GROUPS.map((g) => (
            <Card key={g.key} title={g.name} actions={<span className="text-[11px] text-gray-400">{g.kr}</span>}>
              <p className="text-[11.5px] text-gray-500 -mt-1 mb-2">{g.line}</p>
              <ul className="divide-y divide-gray-100">
                {g.people.map((p) => <PersonRow key={p.name} p={p} />)}
                {g.open && (
                  <li className="flex items-center gap-2.5 py-2 last:pb-0">
                    <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold shrink-0 bg-gray-100 text-gray-400" aria-hidden="true">?</span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-gray-700">{g.open.role}</span><span className="block text-[11.5px] text-gray-500">{g.open.note}</span></span>
                    <Chip tone="gray">공석</Chip>
                  </li>
                )}
              </ul>
            </Card>
          ))}
        </div>
      </>
    );
  }

  if (tab === "atlas-mission") {
    return (
      <>
        {header}
        <Card className="mb-3">
          <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-periwinkle">Mission</p>
          <h2 className="text-[20px] md:text-[24px] font-bold text-navy tracking-[-0.02em] mt-1 text-balance">{MISSION.headline}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {MISSION.steps.map((s, i) => (
              <div key={s.k} className="rounded-xl bg-navy/[0.04] p-3.5">
                <p className="text-[12px] font-bold text-periwinkle mb-1">0{i + 1} {s.k}</p>
                <p className="text-[12.5px] text-gray-700 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card title="Polaris — 향하는 곳" actions={<Button size="sm" variant="ghost" onClick={() => onGo("launcher")}>메인의 우주선</Button>}>
            <ol className="space-y-2.5">
              {POLARIS.phases.map((p) => (
                <li key={p.key} className="flex gap-3">
                  <span className="w-9 h-9 rounded-full bg-navy text-white grid place-items-center text-[11px] font-bold shrink-0">{p.key}</span>
                  <span className="min-w-0"><span className="block text-[13px] font-semibold text-gray-900">{p.name} <span className="text-gray-400 font-normal">· {p.where}</span></span><span className="block text-[12px] text-gray-600">{p.body}</span></span>
                </li>
              ))}
            </ol>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11.5px]">
              {(["A", "B", "C"] as const).map((g) => (
                <div key={g} className="rounded-lg border border-gray-200 p-2.5">
                  <p className="font-bold text-navy mb-1">Gate {g}</p>
                  <ul className="space-y-0.5 text-gray-600">{POLARIS.gates[g].map((x) => <li key={x}>· {x}</li>)}</ul>
                </div>
              ))}
            </div>
            <p className="text-[11.5px] text-gray-500 mt-2">게이트는 목표가 아니라 제동 장치입니다. 못 넘은 상태에서의 확장을 금지하는 것이 그 목적입니다.</p>
          </Card>
          <Card title="솔직히 아직 못 푼 세 가지">
            <ul className="space-y-2.5">
              {MISSION.unsolved.map((u) => (
                <li key={u.k} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[13px] font-semibold text-gray-900">{u.k}</p>
                  <p className="text-[12px] text-gray-600 mt-0.5">{u.body}</p>
                </li>
              ))}
            </ul>
            <p className="text-[11.5px] text-gray-500 mt-2">출처: 커피챗 소개서 0907. 새로 온 사람에게 <span className="font-semibold text-gray-700">우리가 뭘 모르는지</span>를 먼저 보여 주는 게 온보딩입니다.</p>
          </Card>
        </div>
      </>
    );
  }

  if (tab === "atlas-tools") {
    return (
      <>
        {header}
        <p className="text-[12.5px] text-gray-500 mb-3">Satellite 아래 도구들. 런처의 순서가 곧 만든 순서입니다. 카드를 누르면 그 툴로 갑니다.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {TOOL_ORDER.map((k) => TOOLS[k]).map((t) => (
            <Card key={t.key}>
              <div className="flex items-start gap-3">
                <img src={`/satellite/${t.key}_app.svg`} alt="" width={40} height={40} className="w-10 h-10 rounded-[12px] shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-gray-900 leading-tight">{t.name} <span className="text-[11.5px] font-medium text-gray-500 ml-1">{t.subtitle}</span></p>
                  <p className="text-[12px] text-gray-600 mt-1">{t.description}</p>
                  <p className="text-[11.5px] text-gray-400 mt-1.5">{t.users}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {t.status !== "external" && <Button size="sm" onClick={() => onGo(t.key)}>열기</Button>}
                <a href={slackUrl(t)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon={<IconBrandSlack />}>#{t.slack.channel}</Button></a>
              </div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-3">
        <Card title="연혁">
          <ol className="border-l-2 border-gray-200 ml-1.5">
            {TIMELINE.map((t) => (
              <li key={t.when} className="relative pl-4 pb-4 last:pb-0">
                <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${t.planned ? "bg-gray-300" : "bg-periwinkle"}`} aria-hidden="true" />
                <p className="text-[11px] font-bold text-periwinkle tracking-wide">{t.when}{t.planned && <span className="ml-1.5 text-gray-400 font-medium">예정</span>}</p>
                <p className="text-[13px] text-gray-800 mt-0.5">{t.what}</p>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Fact sheet">
          <dl className="space-y-2.5">
            {FACTS.map((f) => (
              <div key={f.k}>
                <dt className="text-[11px] text-gray-500">{f.k}</dt>
                <dd className="text-[13px] font-semibold text-gray-900 m-0">{f.v}{f.note && <span className="block text-[11px] font-medium text-amber-700">{f.note}</span>}</dd>
              </div>
            ))}
          </dl>
          <a href={LINKS.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy mt-3 hover:underline">회사 홈페이지 <IconExternalLink size={13} aria-hidden="true" /></a>
        </Card>
      </div>
    </>
  );
}
