"use client";

import { useMemo, useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";
import { CHANGE_STATUS, LANES, LANE_LABEL, type AppGraph, type AppScreen, type ChangesDoc, type ExperimentsDoc, type Lane, type PlayerDoc, type RefsDoc, type ScreenNotes } from "@/lib/castor/app";
import { Button, Empty, Notice, PageHeader, Skeleton } from "../_shared/ui";
import CastorPlayer from "./CastorPlayer";
import { fmtWhen, useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 지도 (기획안 Castor 절 C2 · 지도 v3 시안, 1008).
 *
 * 화면 = 실제 앱 캡처 썸네일 노드, 레인 = 진입 → 탐색 → 매장 → 처리 → 지갑. 선은 앱 코드에서 뽑은 이동.
 * 실선 = GA4 가 그 화면을 이름으로 셈(이동량을 잴 수 있음) · 점선 = 측정 안 됨. 지금은 라우트 이름이 거의 없어 점선이 대부분 — 그게 실제 상태다.
 * 화면을 누르면 오른쪽에 요약 · 이동 · 이벤트 · 연결, 아래 눌러보기가 그 화면부터 시작한다.
 */
type Layer = "core" | "all";
const COL = 180, CORE_ROW = 290, ALL_ROW = 128, TOP = 44;

export default function CastorMap({ onOpenScreen }: { onOpenScreen?: (id: string) => void }) {
  const graph = useCastorDoc<AppGraph>("app_graph");
  const notes = useCastorDoc<ScreenNotes>("screens");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const exps = useCastorDoc<ExperimentsDoc>("experiments");
  const player = useCastorDoc<PlayerDoc>("player");
  const refs = useCastorDoc<RefsDoc>("refs");
  const [days, setDays] = useState<1 | 7 | 28>(7);
  const health = useCastorHealth(days);
  const [layer, setLayer] = useState<Layer>("core");
  const [showEtc, setShowEtc] = useState(false);
  const [sel, setSel] = useState<string | null>("store.detail");
  const [tab, setTab] = useState<"sum" | "move" | "ev" | "link">("sum");
  const [start, setStart] = useState<{ mode: "now"; key: string; n: number } | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const g = graph.data;
  const thumbs = player.data?.thumbs ?? {};
  const live = useMemo(() => new Map((health?.ok ? health.events : []).map((e) => [e.name, e])), [health]);
  const named = useMemo(() => new Set((health?.ok ? health.screen_views : []).map((s) => s.screen)), [health]);

  const lanes: Lane[] = showEtc ? LANES : LANES.filter((l) => l !== "etc");
  const visible = useMemo(() => {
    if (!g) return [] as AppScreen[];
    const coreIds = new Set([...Object.keys(thumbs), ...Object.values(player.data?.now ?? {}).map((n) => n.screen), "coupon.use"]);
    return g.screens.filter((s) => lanes.includes(s.lane) && (layer === "all" || coreIds.has(s.id)));
  }, [g, thumbs, player.data, layer, lanes]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowH = layer === "core" ? CORE_ROW : ALL_ROW;
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const lane of lanes) visible.filter((s) => s.lane === lane).forEach((s, i) => m.set(s.id, { x: lanes.indexOf(lane) * COL + 30, y: TOP + i * rowH }));
    return m;
  }, [visible, lanes, rowH]);
  const rows = Math.max(1, ...lanes.map((l) => visible.filter((s) => s.lane === l).length));
  const cvW = lanes.length * COL + 20, cvH = TOP + rows * rowH + 20;
  const nodeW = 100, nodeH = layer === "core" ? 184 : 74;

  const edges = useMemo(() => (g?.edges ?? []).filter((e) => pos.has(e.from) && pos.has(e.to) && e.from !== e.to), [g, pos]);
  const cardsBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of changes.data?.cards ?? []) if (c.screen && c.status !== "done") m.set(c.screen, (m.get(c.screen) ?? 0) + 1);
    return m;
  }, [changes.data]);
  const expBy = useMemo(() => new Set((exps.data?.items ?? []).filter((x) => x.state === "running").map((x) => x.screen)), [exps.data]);
  const evSum = (s: AppScreen) => s.events.reduce((a, n) => a + (live.get(n)?.d7 ?? 0), 0);

  async function upload(f: File) {
    setUpErr(null);
    try {
      const j = JSON.parse(await f.text()) as AppGraph;
      if (!Array.isArray(j.screens) || !Array.isArray(j.edges) || !Array.isArray(j.events)) { setUpErr("castor_app_parse.py 가 만든 JSON 이 아닙니다(screens · edges · events 가 없음)."); return; }
      await graph.save(j);
    } catch { setUpErr("JSON 을 읽지 못했습니다."); }
  }

  function play(id: string) {
    const key = Object.entries(player.data?.now ?? {}).find(([, v]) => v.screen === id)?.[0];
    if (!key) return;
    setStart((s) => ({ mode: "now", key, n: (s?.n ?? 0) + 1 }));
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const s = g?.screens.find((x) => x.id === sel) ?? null;
  const playable = (id: string) => Object.values(player.data?.now ?? {}).some((v) => v.screen === id);

  return (
    <div className="cx">
      <PageHeader title="지도" description="사용자 앱 화면 · 이동 · 이벤트. 화면을 누르면 오른쪽에 요약, 아래에서 직접 눌러볼 수 있습니다."
        actions={<>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <Button icon={<IconUpload size={15} />} disabled={graph.saving} onClick={() => fileRef.current?.click()}>{graph.saving ? "올리는 중…" : "지도 불러오기"}</Button>
        </>} />
      {(upErr || graph.error) && <div className="mb-3"><Notice tone="red" title={upErr ?? graph.error ?? ""} /></div>}

      {!graph.loaded ? <Skeleton rows={6} cols={5} /> : !g ? (
        <Empty title="아직 지도가 없습니다" detail="앱 저장소에서 castor_app_parse.py 를 돌려 나온 JSON 을 [지도 불러오기]로 올리면 여기 그려집니다." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <div className="cx-chips" role="group" aria-label="레이어">
              <button type="button" className={layer === "core" ? "on" : ""} onClick={() => setLayer("core")}>핵심 화면</button>
              <button type="button" className={layer === "all" ? "on" : ""} onClick={() => setLayer("all")}>전체 {g.screens.length}</button>
              <button type="button" className={showEtc ? "on" : "dash"} onClick={() => setShowEtc((v) => !v)}>기타 레인</button>
            </div>
            <div className="cx-seg" role="tablist" aria-label="기간">
              {([1, 7, 28] as const).map((d) => <button key={d} type="button" className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d === 1 ? "마지막 날" : d === 7 ? "7일" : "28일"}</button>)}
            </div>
            <span className={`cx-fresh${health?.ok ? "" : " bad"}`}><i />{health === undefined ? "GA4 읽는 중" : health?.ok ? `GA4 ${health.window?.from} ~ ${health.window?.to} · 숫자 = 그 화면 이벤트 건수` : "GA4 못 읽음"}</span>
            <span className="cx-cap ml-auto">코드 {g.source.commit} · {fmtWhen(g.generated_at)} · 이동 {g.edges.length} · 못 잡은 이동 {g.unresolved.length} · 이름 붙은 라우트 {g.named_routes.length}/{g.screens.length}</span>
          </div>

          <div className="cx-split">
            <div className="cx-canvas" style={{ maxHeight: layer === "core" ? 700 : 760 }}>
              <div className="cx-cv" style={{ width: cvW, height: cvH }}>
                <div className="cx-lanes" style={{ gridTemplateColumns: `repeat(${lanes.length}, ${COL}px)` }}>{lanes.map((l) => <div key={l} className="cx-lane"><em>{LANE_LABEL[l]}</em></div>)}</div>
                <svg className="cx-svg" width={cvW} height={cvH} aria-hidden="true">
                  <defs>
                    <marker id="cxa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" style={{ fill: "var(--cx-navy)" }} /></marker>
                    <marker id="cxb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#B7BAC6" /></marker>
                  </defs>
                  {edges.map((e, i) => {
                    const a = pos.get(e.from)!, b = pos.get(e.to)!;
                    const sameLane = a.x === b.x;
                    const x1 = sameLane ? a.x + nodeW : a.x < b.x ? a.x + nodeW : a.x, y1 = a.y + nodeH / 2;
                    const x2 = sameLane ? b.x + nodeW : a.x < b.x ? b.x : b.x + nodeW, y2 = b.y + nodeH / 2;
                    const bend = sameLane ? 40 : Math.max(30, Math.abs(x2 - x1) / 2.4);
                    const d = sameLane ? `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 + bend} ${y2} ${x2 + 2} ${y2}` : `M${x1} ${y1} C${x1 + (x2 > x1 ? bend : -bend)} ${y1} ${x2 - (x2 > x1 ? bend : -bend)} ${y2} ${x2} ${y2}`;
                    const measured = named.has(e.to);
                    const on = sel && (e.from === sel || e.to === sel);
                    return <path key={i} d={d} className={`cx-e${measured ? "" : " dim"}${on ? " on" : ""}`} strokeWidth={on ? 2.5 : 1.6} markerEnd={measured ? "url(#cxa)" : "url(#cxb)"} />;
                  })}
                </svg>
                {visible.map((x) => {
                  const p = pos.get(x.id)!; const n = evSum(x); const c = cardsBy.get(x.id) ?? 0; const issue = notes.data?.[x.id]?.issue;
                  return (
                    <button key={x.id} type="button" className={`cx-node${sel === x.id ? " sel" : ""}${issue ? " warn" : ""}${!x.events.length ? " dash" : ""}`} style={{ left: p.x, top: p.y }}
                      onClick={() => { setSel(x.id); setTab("sum"); }} onDoubleClick={() => play(x.id)} aria-pressed={sel === x.id}>
                      <span className={`cx-th${layer === "core" ? "" : " sm"}${thumbs[x.id] ? "" : " empty"}`} style={thumbs[x.id] ? { backgroundImage: `url(${thumbs[x.id]})`, width: layer === "core" ? undefined : 40 } : { width: layer === "core" ? undefined : 40 }}>
                        {layer === "core" && !thumbs[x.id] && "캡처 없음"}
                        {c > 0 && <span className="cx-bd c">카드 {c}</span>}
                        {expBy.has(x.id) && <span className="cx-bd e" style={{ top: c ? 24 : 6 }}>실험</span>}
                      </span>
                      <b>{x.name}</b>
                      <code>{x.id}</code>
                      {health?.ok && <em className={!x.events.length ? "na" : n ? "" : "na"}>{!x.events.length ? "이벤트 없음" : n ? n.toLocaleString() : "0건"}</em>}
                    </button>
                  );
                })}
              </div>
              <div className="cx-key"><span><i />GA4 가 셈</span><span><i className="b" />측정 안 됨</span><span><i className="c" />문제 적힘</span></div>
            </div>

            <aside className="cx-panel" aria-label="화면 요약">
              {!s ? <p className="cx-cap">화면을 누르면 여기 요약이 나옵니다.</p> : (
                <>
                  <div className="cx-ph">
                    <span className={`cx-th sm${thumbs[s.id] ? "" : " empty"}`} style={thumbs[s.id] ? { backgroundImage: `url(${thumbs[s.id]})` } : undefined} />
                    <div><b>{s.name}</b><code>{s.id}</code><span className="cx-cap block mt-0.5">{LANE_LABEL[s.lane]} · lib/{s.file}:{s.line}</span></div>
                  </div>
                  <div className="cx-tabs2" role="tablist">
                    {([["sum", "요약"], ["move", "이동"], ["ev", "이벤트"], ["link", "연결"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
                  </div>
                  {tab === "sum" && (
                    <>
                      <div className="cx-kv">
                        <div><em>이벤트</em><b>{s.events.length}</b><span>코드에 있음</span></div>
                        <div><em>{days === 1 ? "마지막 날" : `${days}일`}</em><b>{health?.ok ? evSum(s).toLocaleString() : "—"}</b><span>이벤트 건수</span></div>
                        <div><em>카드</em><b>{cardsBy.get(s.id) ?? 0}</b><span>진행 중</span></div>
                      </div>
                      {!named.has(s.id) && <p className="x-warn">GA4 가 이 화면을 이름으로 못 셉니다 — 라우트 이름이 붙어야 이동량이 생깁니다(재민 인계 ①).</p>}
                      {notes.data?.[s.id]?.issue && <p className="text-[12.5px] text-red-600 font-semibold">문제: {notes.data[s.id].issue}</p>}
                      {notes.data?.[s.id]?.note && <p className="text-[12.5px] cx-cap">{notes.data[s.id].note}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {playable(s.id) && <button type="button" className="cx-btn pri" onClick={() => play(s.id)}>이 화면부터 눌러보기</button>}
                        {onOpenScreen && <button type="button" className="cx-btn" onClick={() => onOpenScreen(s.id)}>화면에서 열기</button>}
                      </div>
                    </>
                  )}
                  {tab === "move" && (() => {
                    const ins = g.edges.filter((e) => e.to === s.id), outs = g.edges.filter((e) => e.from === s.id);
                    const nm = (id: string) => g.screens.find((x) => x.id === id)?.name ?? id;
                    return (
                      <>
                        <span className="cx-sub">들어오는 곳 {ins.length}</span>
                        <div className="cx-io">{ins.map((e) => <span key={e.from} style={{ display: "contents" }}><button type="button" onClick={() => setSel(e.from)}>{nm(e.from)}</button><span className="cx-cap">{e.kind === "tab" ? "탭" : e.kind === "popup" ? "팝업" : `호출 ${e.calls}`}</span></span>)}</div>
                        <span className="cx-sub">나가는 곳 {outs.length}</span>
                        <div className="cx-io">{outs.map((e) => <span key={e.to} style={{ display: "contents" }}><button type="button" onClick={() => setSel(e.to)}>{nm(e.to)}</button><span className="cx-cap">{e.kind === "tab" ? "탭" : e.kind === "popup" ? "팝업" : `호출 ${e.calls}`}</span></span>)}</div>
                        <p className="cx-cap">이동 비율(%)은 라우트 이름이 붙은 뒤 GA4 로 채웁니다.</p>
                      </>
                    );
                  })()}
                  {tab === "ev" && (
                    <div className="flex flex-col gap-1.5">
                      {s.events.length === 0 && <p className="cx-cap">이 화면에서 보내는 이벤트가 없습니다.</p>}
                      {s.events.map((n) => { const l = live.get(n); const st = !health?.ok ? "na" : !l?.d7 ? "bad" : !l.last_day ? "warn" : ""; return (
                        <div key={n} className={`cx-ev ${st}`}><code>{n}</code><span>{!health?.ok ? "—" : l?.d7 ? `${l.d7.toLocaleString()} · 기기 ${l.devices7.toLocaleString()}` : "0건"}</span></div>); })}
                    </div>
                  )}
                  {tab === "link" && (
                    <div className="flex flex-col gap-1.5">
                      <span className="cx-sub">변경 카드</span>
                      {(changes.data?.cards ?? []).filter((c) => c.screen === s.id).map((c) => <div key={c.id} className="cx-io"><span>{c.title}</span><span className="cx-tag">{CHANGE_STATUS.find((x) => x.key === c.status)?.label}</span></div>)}
                      {!(changes.data?.cards ?? []).some((c) => c.screen === s.id) && <p className="cx-cap">없음</p>}
                      <span className="cx-sub">실험</span>
                      {(exps.data?.items ?? []).filter((x) => x.screen === s.id).map((x) => <div key={x.id} className="cx-io"><span>{x.title}</span><span className="cx-tag e">{x.state}</span></div>)}
                      {!(exps.data?.items ?? []).some((x) => x.screen === s.id) && <p className="cx-cap">없음</p>}
                      <span className="cx-sub">레퍼런스</span>
                      {(refs.data?.items ?? []).filter((r) => r.screen === s.id).map((r) => <div key={r.id} className="cx-io"><span>{r.app}</span><span className="cx-cap">{r.take.slice(0, 22)}…</span></div>)}
                      {!(refs.data?.items ?? []).some((r) => r.screen === s.id) && <p className="cx-cap">없음</p>}
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>

          {g.unresolved.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-gray-700 dark:text-gray-300">못 잡은 이동 {g.unresolved.length}건 — 코드에서 대상 화면을 못 찾은 호출</summary>
              <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-gray-600 font-mono">
                {g.unresolved.map((u, i) => <li key={i}>{u.from} · {u.call} · {u.file}:{u.line}</li>)}
              </ul>
            </details>
          )}

          <div ref={playerRef} className="mt-4" style={{ scrollMarginTop: 90 }}>
            <div className="cx-card-h"><b>눌러보기</b><span className="cx-cap">지도에서 화면을 두 번 누르거나 [이 화면부터 눌러보기]</span></div>
            {!player.loaded ? <Skeleton rows={4} cols={3} /> : player.data ? (
              <CastorPlayer doc={player.data} health={health} graph={g} start={start} onScreen={(id) => setSel(id)} />
            ) : <Empty title="눌러보기 자료가 아직 없습니다" detail="CGC/04_castor/gen_player.py build 로 만든 player.json 을 백엔드 player 문서에 올리면 나타납니다." />}
          </div>
        </>
      )}
    </div>
  );
}
