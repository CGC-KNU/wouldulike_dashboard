"use client";

import { useEffect, useMemo, useState } from "react";
import { CHANGE_KIND_LABEL, CHANGE_STATUS, LANES, LANE_LABEL, type AppGraph, type ChangeCard, type ChangeKind, type ChangesDoc, type PlayerDoc, type ScreenNotes } from "@/lib/castor/app";
import { Empty, Field, Input, Notice, PageHeader, Select, Skeleton, Textarea } from "../_shared/ui";
import CastorEvents from "./CastorEvents";
import { fmtWhen, useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 화면 (기획안 Castor 절 C2 · 화면 시안 + 편집 모드, 1008).
 * 왼쪽 화면 트리 · 가운데 지금/다음 비교 · 오른쪽 이벤트 · 카드 · 메모. [바꿀 것 제안]은 변경 보드 카드를 바로 만든다
 * (경로: 바로 적용 = 원격 설정 키 / 개발 = 재민). 위 [이벤트 정의서]가 옛 계측 탭 — 앱 이벤트 전체 표.
 */
type View = "screen" | "events";

export default function CastorScreen({ initial, actor }: { initial?: string | null; actor: string }) {
  const graph = useCastorDoc<AppGraph>("app_graph");
  const notes = useCastorDoc<ScreenNotes>("screens");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const player = useCastorDoc<PlayerDoc>("player");
  const health = useCastorHealth(7);
  const [view, setView] = useState<View>("screen");
  const [sel, setSel] = useState<string>(initial ?? "coupon.redeem_pin");
  const [tab, setTab] = useState<"ev" | "card" | "memo">("ev");
  const [edit, setEdit] = useState<ChangeCard | null>(null);
  const [memo, setMemo] = useState<{ issue: string; note: string } | null>(null);
  useEffect(() => { if (initial) { setSel(initial); setView("screen"); } }, [initial]);
  useEffect(() => { setMemo(null); setEdit(null); }, [sel]);

  const g = graph.data;
  const s = g?.screens.find((x) => x.id === sel) ?? null;
  const thumb = player.data?.thumbs[sel];
  const live = useMemo(() => new Map((health?.ok ? health.events : []).map((e) => [e.name, e])), [health]);
  const cards = (changes.data?.cards ?? []).filter((c) => c.screen === sel);
  const nextCard = cards.find((c) => c.next && c.status !== "done");
  const after = useMemo(() => {
    const a = player.data?.after; if (!a) return null;
    const hit = Object.entries(a).find(([, v]) => v.sid === sel || sel.startsWith(v.sid) || v.sid.startsWith(sel));
    return hit ? { key: hit[0], ...hit[1] } : null;
  }, [player.data, sel]);
  const afterDoc = after && player.data ? `<!doctype html><html><head><meta charset="utf-8"><style>${player.data.after_css}html,body{margin:0;background:transparent;overflow:hidden}</style></head><body>${player.data.after_html[after.key] ?? ""}</body></html>` : "";

  async function saveCard(c: ChangeCard) {
    const all = changes.data?.cards ?? [];
    const log = [{ at: new Date().toISOString(), by: actor, text: "화면 탭에서 제안" }];
    if (await changes.save({ cards: [...all, { ...c, title: c.title.trim(), log }] })) setEdit(null);
  }

  return (
    <div className="cx">
      <PageHeader title="화면" description="화면 하나를 열어 지금과 바뀔 모습을 나란히 보고, 바꿀 것을 카드로 만듭니다."
        actions={<div className="cx-seg" role="tablist"><button type="button" className={view === "screen" ? "on" : ""} onClick={() => setView("screen")}>화면별</button><button type="button" className={view === "events" ? "on" : ""} onClick={() => setView("events")}>이벤트 정의서</button></div>} />
      {view === "events" ? <CastorEvents embedded /> : !graph.loaded ? <Skeleton rows={6} cols={4} /> : !g ? <Empty title="아직 지도가 없습니다" detail="지도 탭에서 [지도 불러오기]를 먼저 해 주세요." /> : (
        <div className="s-split">
          <nav className="s-tree" aria-label="화면 목록">
            {LANES.map((l) => (
              <div key={l} className="s-tg">
                <em>{LANE_LABEL[l]}</em>
                {g.screens.filter((x) => x.lane === l).map((x) => <button key={x.id} type="button" className={x.id === sel ? "on" : ""} onClick={() => setSel(x.id)} title={x.id}>{x.name}</button>)}
              </div>
            ))}
          </nav>

          <div className="flex flex-col gap-3 min-w-0">
            {!s ? <Empty title="지도에 없는 화면" detail={sel} /> : (
              <>
                <div className="cx-card-h" style={{ alignItems: "center" }}>
                  <div><b style={{ fontSize: 16 }}>{s.name}</b> <code>{s.id}</code><span className="cx-cap block">{LANE_LABEL[s.lane]} · lib/{s.file}:{s.line} · 이벤트 {s.events.length}</span></div>
                  <button type="button" className="cx-btn pri" onClick={() => setEdit({ id: `chg-${Date.now()}`, title: "", screen: s.id, kind: "screen", path: "dev", status: "proposed", now: notes.data?.[s.id]?.issue ?? "" })}>바꿀 것 제안</button>
                </div>
                <div className="s-cmp">
                  <div>
                    <span className="cx-tag">지금</span>
                    <span className={`cx-th big${thumb ? "" : " empty"}`} style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>{!thumb && "캡처 없음"}</span>
                    <span className="cx-cap">{thumb ? "10/1 v2.5.8 실제 화면" : "이 화면은 아직 캡처가 없습니다"}</span>
                  </div>
                  <div>
                    <span className="cx-tag e">다음</span>
                    {after ? (
                      <div className="s-next"><iframe title={`시안 · ${after.title}`} sandbox="" srcDoc={afterDoc} /></div>
                    ) : nextCard ? (
                      <div className="s-nextdesc"><b>{nextCard.title}</b><span>{nextCard.next}</span><span className="cx-cap">카드 · {CHANGE_STATUS.find((x) => x.key === nextCard.status)?.label}</span></div>
                    ) : (
                      <div className="s-nextdesc" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}><span className="cx-cap">아직 바뀔 모습이 없습니다.<br />[바꿀 것 제안]으로 카드를 만드세요.</span></div>
                    )}
                    <span className="cx-cap">{after ? "기획안 시안" : nextCard ? "변경 카드의 '바뀐 뒤'" : ""}</span>
                  </div>
                </div>

                {edit && (
                  <div className="cx-card flex flex-col gap-2.5" aria-label="제안 만들기">
                    <div className="cx-card-h"><b>바꿀 것 제안 · {s.name}</b><span className="cx-cap">저장하면 변경 보드 &apos;제안&apos; 칸에 들어갑니다</span></div>
                    <Field label="제목" required><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="예: 쿠폰 사용 화면 문구 버튼 문구 바꾸기" /></Field>
                    <div className="e-f">
                      <button type="button" className={`e-path${edit.path === "remote" ? " on" : ""}`} onClick={() => setEdit({ ...edit, path: "remote" })}><b>바로 적용 · 원격 설정</b><span>문구 · 기본값 · 순서 — 앱 배포 없이</span><em>원격 설정이 앱에 붙은 뒤부터</em></button>
                      <button type="button" className={`e-path${edit.path === "dev" ? " on" : ""}`} onClick={() => setEdit({ ...edit, path: "dev" })}><b>개발 · 재민</b><span>화면 구조 · 새 기능</span><em>앱 배포가 필요함</em></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="종류"><Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as ChangeKind })}>{(Object.keys(CHANGE_KIND_LABEL) as ChangeKind[]).map((k) => <option key={k} value={k}>{CHANGE_KIND_LABEL[k]}</option>)}</Select></Field>
                      {edit.path === "remote" ? <Field label="원격 설정 키"><Input className="font-mono" value={edit.rc_key ?? ""} onChange={(e) => setEdit({ ...edit, rc_key: e.target.value })} placeholder="screen.option_key" /></Field>
                        : <Field label="잴 지표"><Input value={edit.metric ?? ""} onChange={(e) => setEdit({ ...edit, metric: e.target.value })} placeholder="상세 → 사용 전환" /></Field>}
                    </div>
                    <Field label="지금"><Textarea rows={2} value={edit.now ?? ""} onChange={(e) => setEdit({ ...edit, now: e.target.value })} /></Field>
                    <Field label="바뀐 뒤"><Textarea rows={2} value={edit.next ?? ""} onChange={(e) => setEdit({ ...edit, next: e.target.value })} /></Field>
                    <div className="flex gap-2 items-center">
                      <button type="button" className="cx-btn pri" disabled={!edit.title.trim() || changes.saving} onClick={() => saveCard(edit)}>{changes.saving ? "저장 중…" : "카드 만들기"}</button>
                      <button type="button" className="cx-btn" onClick={() => setEdit(null)}>취소</button>
                      {changes.error && <span className="text-[12px] text-red-600">{changes.error}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="cx-panel" aria-label="화면 정보">
            <div className="cx-tabs2" role="tablist">
              {([["ev", `이벤트 ${s?.events.length ?? 0}`], ["card", `카드 ${cards.length}`], ["memo", "메모"]] as const).map(([k, l]) => <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
            </div>
            {tab === "ev" && (
              <div className="flex flex-col gap-1.5">
                {!health?.ok && <p className="cx-cap">GA4 를 못 읽어 건수가 비어 있습니다.</p>}
                {(s?.events ?? []).map((n) => { const l = live.get(n); return <div key={n} className={`cx-ev ${!health?.ok ? "na" : !l?.d7 ? "bad" : !l.last_day ? "warn" : ""}`}><code>{n}</code><span>{health?.ok ? (l?.d7 ? `7일 ${l.d7.toLocaleString()}` : "0건") : "—"}</span></div>; })}
                {s && s.events.length === 0 && <p className="cx-cap">이 화면에서 보내는 이벤트가 없습니다 — [이벤트 정의서]에서 필요한지 정합니다.</p>}
              </div>
            )}
            {tab === "card" && (
              <div className="flex flex-col gap-2">
                {cards.length === 0 && <p className="cx-cap">이 화면에 걸린 카드가 없습니다.</p>}
                {cards.map((c) => (
                  <div key={c.id} className="flex flex-col gap-0.5" style={{ borderLeft: "3px solid var(--cx-line2)", paddingLeft: 8 }}>
                    <b className="text-[12.5px]" style={{ color: "var(--cx-ink)" }}>{c.title}</b>
                    <span className="cx-cap">{CHANGE_STATUS.find((x) => x.key === c.status)?.label} · {CHANGE_KIND_LABEL[c.kind]}{c.log?.length ? ` · ${fmtWhen(c.log[c.log.length - 1].at)}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === "memo" && s && (() => {
              const cur = notes.data?.[s.id] ?? {};
              const m = memo ?? { issue: cur.issue ?? "", note: cur.note ?? "" };
              const dirty = m.issue !== (cur.issue ?? "") || m.note !== (cur.note ?? "");
              return (
                <div className="flex flex-col gap-2.5">
                  <Field label="문제" hint="적으면 지도에서 빨간 테두리"><Input value={m.issue} onChange={(e) => setMemo({ ...m, issue: e.target.value })} /></Field>
                  <Field label="메모"><Textarea rows={4} value={m.note} onChange={(e) => setMemo({ ...m, note: e.target.value })} /></Field>
                  <button type="button" className="cx-btn pri" disabled={!dirty || notes.saving} onClick={async () => { if (await notes.save({ ...(notes.data ?? {}), [s.id]: { ...cur, issue: m.issue.trim() || undefined, note: m.note.trim() || undefined } })) setMemo(null); }}>{notes.saving ? "저장 중…" : "메모 저장"}</button>
                  {notes.error && <Notice tone="red" title={notes.error} />}
                </div>
              );
            })()}
          </aside>
        </div>
      )}
    </div>
  );
}
