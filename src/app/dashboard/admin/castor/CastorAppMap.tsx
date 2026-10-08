"use client";

import { useMemo, useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";
import { CHANGE_STATUS, LANES, LANE_LABEL, type AppGraph, type AppScreen, type ChangesDoc, type ScreenNotes } from "@/lib/castor/app";
import { Button, Card, Chip, Empty, Field, Input, Notice, PageHeader, PanelSection, Skeleton, SlideOver, Textarea } from "../_shared/ui";
import { fmtWhen, useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 앱 화면 지도 (1008). 사용자 앱(Flutter) 코드에서 뽑은 화면을 다섯 레인(진입 → 탐색 → 매장 → 처리 → 지갑)에 놓는다.
 *
 * 지도는 코드가 진실이다 — CGC/04_사내툴_개발/04_castor/castor_app_parse.py 가 만든 JSON 을 [지도 불러오기]로 올린다.
 * 사람이 적는 것(캡처 주소 · 문제 · 메모)은 별도 문서(`screens`)라 지도를 다시 올려도 지워지지 않는다.
 * 대상을 못 찾은 이동은 숨기지 않고 센다 — 지도가 틀렸다는 걸 늦게 알면 안 된다.
 */
export default function CastorAppMap({ onGo }: { onGo?: (tab: string) => void }) {
  const graph = useCastorDoc<AppGraph>("app_graph");
  const notes = useCastorDoc<ScreenNotes>("screens");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const health = useCastorHealth();
  const [open, setOpen] = useState<string | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const g = graph.data;
  const counts = useMemo(() => new Map((health?.ok ? health.events : []).map((e) => [e.name, e])), [health]);
  const degree = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    for (const e of g?.edges ?? []) {
      m.set(e.from, { in: m.get(e.from)?.in ?? 0, out: (m.get(e.from)?.out ?? 0) + 1 });
      m.set(e.to, { in: (m.get(e.to)?.in ?? 0) + 1, out: m.get(e.to)?.out ?? 0 });
    }
    return m;
  }, [g]);
  const cardsBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of changes.data?.cards ?? []) if (c.screen && c.status !== "done") m.set(c.screen, (m.get(c.screen) ?? 0) + 1);
    return m;
  }, [changes.data]);

  async function upload(f: File) {
    setUpErr(null);
    try {
      const j = JSON.parse(await f.text()) as AppGraph;
      if (!Array.isArray(j.screens) || !Array.isArray(j.edges) || !Array.isArray(j.events)) { setUpErr("castor_app_parse.py 가 만든 JSON 이 아닙니다(screens · edges · events 가 없음)."); return; }
      await graph.save(j);
    } catch { setUpErr("JSON 을 읽지 못했습니다."); }
  }

  const sel = g?.screens.find((s) => s.id === open) ?? null;

  return (
    <>
      <PageHeader title="화면 지도" description="사용자 앱 코드에서 뽑은 화면 · 이동 · 이벤트. 숫자는 GA4 최근 7일입니다."
        actions={<>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <Button icon={<IconUpload size={15} />} disabled={graph.saving} onClick={() => fileRef.current?.click()}>{graph.saving ? "올리는 중…" : "지도 불러오기"}</Button>
        </>} />
      {(upErr || graph.error) && <div className="mb-3"><Notice tone="red" title={upErr ?? graph.error ?? ""} /></div>}

      {!graph.loaded ? <Skeleton rows={6} cols={5} /> : !g ? (
        <Empty title="아직 지도가 없습니다" detail="앱 저장소에서 castor_app_parse.py 를 돌려 나온 JSON 을 [지도 불러오기]로 올리면 여기 그려집니다." />
      ) : (
        <>
          <p className="text-[12.5px] text-gray-500 mb-3">
            {g.source.repo} · 커밋 <b className="text-gray-700">{g.source.commit}</b> · {fmtWhen(g.generated_at)} · 화면 {g.screens.length} · 이동 {g.edges.length} · <span className={g.unresolved.length ? "text-amber-700 font-semibold" : ""}>못 잡은 이동 {g.unresolved.length}</span>
            {" · "}<span className={g.named_routes.length < g.screens.length / 2 ? "text-red-600 font-semibold" : ""} title={g.named_routes.join(" · ")}>이름 붙은 라우트 {g.named_routes.length}/{g.screens.length}{g.named_routes.length < g.screens.length / 2 && " — 나머지 화면은 GA4 가 이동을 못 셉니다"}</span>
          </p>
          <div className="overflow-x-auto -mx-1 px-1 pb-2">
            <div className="grid grid-flow-col auto-cols-[minmax(13.5rem,1fr)] gap-3 min-w-max lg:min-w-0">
              {LANES.map((lane) => {
                const list = g.screens.filter((s) => s.lane === lane);
                return (
                  <section key={lane} aria-label={`${LANE_LABEL[lane]} 레인`} className="rounded-2xl bg-black/[0.025] p-2.5">
                    <h3 className="px-1 pb-2 text-[12px] font-bold text-gray-500 tracking-wide">{LANE_LABEL[lane]} <span className="font-medium text-gray-400">{list.length}</span></h3>
                    <div className="flex flex-col gap-2">
                      {list.map((s) => <ScreenCard key={s.id} s={s} deg={degree.get(s.id)} openCards={cardsBy.get(s.id) ?? 0} issue={notes.data?.[s.id]?.issue} live={s.events.reduce((a, n) => a + (counts.get(n)?.d7 ?? 0), 0)} hasHealth={!!health?.ok} onOpen={() => setOpen(s.id)} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          {g.unresolved.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] font-semibold text-gray-700">못 잡은 이동 {g.unresolved.length}건 — 코드에서 대상 화면을 못 찾은 호출</summary>
              <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-gray-600 font-mono">
                {g.unresolved.map((u, i) => <li key={i}>{u.from} · {u.call} · {u.file}:{u.line}</li>)}
              </ul>
            </details>
          )}
        </>
      )}

      <ScreenPanel s={sel} g={g} counts={counts} hasHealth={!!health?.ok} notes={notes} changes={changes.data} onClose={() => setOpen(null)} onOpen={setOpen} onGo={onGo} />
    </>
  );
}

function ScreenCard({ s, deg, openCards, issue, live, hasHealth, onOpen }: { s: AppScreen; deg?: { in: number; out: number }; openCards: number; issue?: string; live: number; hasHealth: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`text-left rounded-xl bg-white border px-3 py-2.5 hover:border-navy/40 transition-colors ${issue ? "border-red-300" : "border-black/[0.06]"}`}>
      <span className="block text-[13px] font-bold text-gray-900 leading-snug">{s.name}</span>
      <span className="block font-mono text-[11px] text-gray-400 mt-0.5">{s.id}</span>
      <span className="flex flex-wrap gap-1 mt-1.5">
        {s.events.length ? <Chip tone="navy">이벤트 {s.events.length}</Chip> : <Chip tone="gray">이벤트 없음</Chip>}
        {hasHealth && s.events.length > 0 && (live ? <Chip tone="blue">7일 {live.toLocaleString()}</Chip> : <Chip tone="red">7일 0건</Chip>)}
        {openCards > 0 && <Chip tone="amber">카드 {openCards}</Chip>}
      </span>
      <span className="block text-[11px] text-gray-400 mt-1">들어옴 {deg?.in ?? 0} · 나감 {deg?.out ?? 0}</span>
    </button>
  );
}

function ScreenPanel({ s, g, counts, hasHealth, notes, changes, onClose, onOpen, onGo }: {
  s: AppScreen | null; g: AppGraph | null; counts: Map<string, { d7: number; last_day: number }>; hasHealth: boolean;
  notes: ReturnType<typeof useCastorDoc<ScreenNotes>>; changes: ChangesDoc | null; onClose: () => void; onOpen: (id: string) => void; onGo?: (tab: string) => void;
}) {
  const [draft, setDraft] = useState<{ id: string; capture_url: string; issue: string; note: string } | null>(null);
  if (!s || !g) return null;
  const cur = notes.data?.[s.id] ?? {};
  const d = draft && draft.id === s.id ? draft : { id: s.id, capture_url: cur.capture_url ?? "", issue: cur.issue ?? "", note: cur.note ?? "" };
  const ins = g.edges.filter((e) => e.to === s.id);
  const outs = g.edges.filter((e) => e.from === s.id);
  const name = (id: string) => g.screens.find((x) => x.id === id)?.name ?? id;
  const cards = (changes?.cards ?? []).filter((c) => c.screen === s.id);
  const dirty = d.capture_url !== (cur.capture_url ?? "") || d.issue !== (cur.issue ?? "") || d.note !== (cur.note ?? "");

  return (
    <SlideOver open onClose={() => { setDraft(null); onClose(); }} title={s.name} subtitle={`${s.id} · ${LANE_LABEL[s.lane]} · ${s.cls ?? "함수 팝업"}`} width="lg"
      footer={<><Button variant="primary" disabled={!dirty || notes.saving} onClick={async () => { if (await notes.save({ ...(notes.data ?? {}), [s.id]: { capture_url: d.capture_url.trim() || undefined, issue: d.issue.trim() || undefined, note: d.note.trim() || undefined } })) setDraft(null); }}>{notes.saving ? "저장 중…" : "메모 저장"}</Button><Button variant="ghost" onClick={onClose}>닫기</Button>{notes.error && <span className="text-[12px] text-red-600 ml-auto">{notes.error}</span>}</>}>
      {d.capture_url && <img src={d.capture_url} alt={`${s.name} 화면`} className="w-full max-w-[18rem] mx-auto rounded-2xl border border-black/[0.08] mb-4" />}
      <PanelSection title="코드 위치"><p className="font-mono text-[12.5px] text-gray-700">lib/{s.file}:{s.line}</p></PanelSection>
      <PanelSection title={`이벤트 ${s.events.length}`}>
        {s.events.length === 0 ? <p className="text-[13px] text-gray-500">이 화면에서 보내는 이벤트가 없습니다 — 계측 정의서에서 필요한지 정합니다.</p> : (
          <ul className="space-y-1">
            {s.events.map((n) => { const c = counts.get(n); return (
              <li key={n} className="flex items-center justify-between gap-2 text-[13px]"><span className="font-mono text-gray-800">{n}</span>
                {hasHealth ? (c?.d7 ? <span className="text-gray-500 tabular-nums">7일 {c.d7.toLocaleString()} · 마지막 날 {c.last_day.toLocaleString()}</span> : <Chip tone="red">7일 0건</Chip>) : <span className="text-gray-400">—</span>}
              </li>); })}
          </ul>
        )}
      </PanelSection>
      <PanelSection title="이동">
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <div><p className="text-[12px] font-semibold text-gray-500 mb-1">들어오는 곳 {ins.length}</p>{ins.map((e) => <button key={e.from} type="button" className="block text-left text-navy hover:underline" onClick={() => onOpen(e.from)}>{name(e.from)}{e.kind === "tab" && <span className="text-gray-400"> · 탭</span>}</button>)}</div>
          <div><p className="text-[12px] font-semibold text-gray-500 mb-1">나가는 곳 {outs.length}</p>{outs.map((e) => <button key={e.to} type="button" className="block text-left text-navy hover:underline" onClick={() => onOpen(e.to)}>{name(e.to)}{e.kind === "popup" && <span className="text-gray-400"> · 팝업</span>}{e.kind === "tab" && <span className="text-gray-400"> · 탭</span>}</button>)}</div>
        </div>
      </PanelSection>
      <PanelSection title={`변경 카드 ${cards.length}`} actions={onGo && <Button size="sm" variant="ghost" onClick={() => onGo("castor-changes")}>변경 보드</Button>}>
        {cards.length === 0 ? <p className="text-[13px] text-gray-500">이 화면에 걸린 카드가 없습니다.</p> : cards.map((c) => <p key={c.id} className="text-[13px] text-gray-800"><Chip tone={c.status === "done" ? "green" : "navy"}>{CHANGE_STATUS.find((x) => x.key === c.status)?.label}</Chip> {c.title}</p>)}
      </PanelSection>
      <PanelSection title="사람이 적는 것">
        <div className="space-y-3">
          <Field label="화면 캡처 주소" hint="캡처 이미지 주소를 붙이면 위에 보입니다."><Input value={d.capture_url} onChange={(e) => setDraft({ ...d, capture_url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="문제" hint="적어 두면 지도에서 빨간 테두리로 보입니다."><Input value={d.issue} onChange={(e) => setDraft({ ...d, issue: e.target.value })} placeholder="예: 보상명이 자리표시 그대로" /></Field>
          <Field label="메모"><Textarea rows={3} value={d.note} onChange={(e) => setDraft({ ...d, note: e.target.value })} /></Field>
        </div>
      </PanelSection>
    </SlideOver>
  );
}
