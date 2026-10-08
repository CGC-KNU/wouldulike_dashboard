"use client";

import { useMemo, useState } from "react";
import { CHANGE_KIND_LABEL, CHANGE_PATH_LABEL, CHANGE_STATUS, METHOD_LABEL, type AppGraph, type ChangeCard, type ChangeKind, type ChangePath, type ChangeStatus, type ChangesDoc, type PlayerDoc } from "@/lib/castor/app";
import { Field, Input, Notice, PageHeader, Select, Skeleton, Textarea } from "../_shared/ui";
import { fmtWhen, useCastorDoc } from "./useCastor";

/**
 * Castor · 변경 보드 (기획안 Castor 절 C3 · 변경 보드 v2 시안, 1008).
 * 모든 수정은 카드를 거친다 — 카드 = 화면 ID + 종류 + 적용 경로 + 잴 방법.
 * 왼쪽 칸반(제안 → 디자인 → 개발 → 배포 → 측정 중 → 결론), 오른쪽 서랍에서 지금/바뀐 뒤 · 적용 경로 · 어떻게 잴까 · 체크 · 기록.
 * 측정할 수 없는 개선은 하지 않는다(기획안 원칙 2) — 잴 방법이 비면 카드에 경고. 개발 경로는 재민에게 넘길 문장을 꺼낸다.
 */
const COL_COLOR: Record<ChangeStatus, string> = { proposed: "#9A9DB0", design: "#7048E8", dev: "#1C7ED6", shipped: "#E8590C", measuring: "#0E9F6E", done: "#060073" };
const PATH_SHORT: Record<ChangePath, string> = { remote: "바로", dev: "개발", ops: "운영", us: "우리" };
const DEFAULT_CHECKS: Record<ChangePath, string[]> = {
  remote: ["원격 설정 키 확인", "되돌리는 값 적어 두기", "점주 · 팀 공지"],
  dev: ["재민에게 넘김", "이벤트 수집 확인", "출시본 반영 확인"],
  ops: ["현장 담당 정하기", "끝난 날 기록"],
  us: ["세틀라이트 반영", "팀 공지"],
};
type Fil = { kind: "all" | ChangeKind; path: "all" | ChangePath; stage: "all" | "1" | "2" | "3" };

export default function CastorChanges({ actor }: { actor: string }) {
  const doc = useCastorDoc<ChangesDoc>("changes");
  const graph = useCastorDoc<AppGraph>("app_graph");
  const player = useCastorDoc<PlayerDoc>("player");
  const [fil, setFil] = useState<Fil>({ kind: "all", path: "all", stage: "all" });
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChangeCard | null>(null);
  const [copied, setCopied] = useState(false);

  const all = doc.data?.cards ?? [];
  const cards = useMemo(() => all.filter((c) => (fil.kind === "all" || c.kind === fil.kind) && (fil.path === "all" || c.path === fil.path) && (fil.stage === "all" || String(c.stage) === fil.stage)), [all, fil]);
  const saved = all.find((c) => c.id === selId) ?? null;
  const edit = draft && draft.id === selId ? draft : saved;
  const isNew = !!draft && !all.some((c) => c.id === draft.id);
  const screenName = (id?: string) => graph.data?.screens.find((s) => s.id === id)?.name;
  const thumb = (id?: string) => (id ? player.data?.thumbs[id] : undefined);
  const dirty = !!draft && (isNew || JSON.stringify(draft) !== JSON.stringify(saved));

  async function save(c: ChangeCard, text?: string) {
    const prev = all.find((x) => x.id === c.id);
    const log = [...(c.log ?? [])];
    const now = new Date().toISOString();
    if (prev && prev.status !== c.status) log.push({ at: now, by: actor, text: `${label(prev.status)} → ${label(c.status)}` });
    if (!prev) log.push({ at: now, by: actor, text: "카드 만듦" });
    if (text) log.push({ at: now, by: actor, text });
    const next = { ...c, title: c.title.trim(), log };
    if (await doc.save({ cards: prev ? all.map((x) => (x.id === c.id ? next : x)) : [...all, next] })) setDraft(null);
  }
  const set = (p: Partial<ChangeCard>) => edit && setDraft({ ...edit, ...p });

  function handoffText(c: ChangeCard) {
    return [`재민님, Castor 변경 보드 카드 하나 넘겨요 — ${c.title}`, c.screen ? `화면: ${screenName(c.screen) ?? c.screen} (${c.screen})` : "", c.now ? `지금: ${c.now}` : "", c.next ? `바꿀 것: ${c.next}` : "", c.metric || c.measure ? `잴 방법: ${[c.method && METHOD_LABEL[c.method], c.metric, c.period].filter(Boolean).join(" · ") || c.measure}` : "", "편하실 때 보시고, 다르게 가는 게 낫다 싶으면 말씀 주세요!"].filter(Boolean).join("\n");
  }
  const noMeasure = (c: ChangeCard) => !c.measure && !c.metric && c.method !== "none" && c.kind !== "ops";

  return (
    <div className="cx">
      <PageHeader title="변경 보드" description="모든 수정은 카드를 거칩니다 · 카드 = 화면 ID + 종류 + 적용 경로 + 잴 방법"
        actions={<button type="button" className="cx-btn pri" onClick={() => { const c: ChangeCard = { id: `chg-${Date.now()}`, title: "", kind: "screen", path: "dev", status: "proposed" }; setSelId(c.id); setDraft(c); }}>+ 변경 제안</button>} />
      {doc.error && <div className="mb-3"><Notice tone="red" title={doc.error} /></div>}

      <div className="cx-chips mb-3" role="group" aria-label="거르기">
        <button type="button" className={fil.kind === "all" && fil.path === "all" && fil.stage === "all" ? "on" : ""} onClick={() => setFil({ kind: "all", path: "all", stage: "all" })}>전체 {all.length}</button>
        {(Object.keys(CHANGE_KIND_LABEL) as ChangeKind[]).map((k) => <button key={k} type="button" className={fil.kind === k ? "on" : ""} onClick={() => setFil({ ...fil, kind: fil.kind === k ? "all" : k })}>{CHANGE_KIND_LABEL[k]}</button>)}
        <span style={{ border: 0, padding: 0, cursor: "default" }}>·</span>
        {(Object.keys(CHANGE_PATH_LABEL) as ChangePath[]).map((k) => <button key={k} type="button" className={fil.path === k ? "on" : ""} onClick={() => setFil({ ...fil, path: fil.path === k ? "all" : k })}>{CHANGE_PATH_LABEL[k]}</button>)}
        <span style={{ border: 0, padding: 0, cursor: "default" }}>·</span>
        {(["1", "2", "3"] as const).map((k) => <button key={k} type="button" className={fil.stage === k ? "on" : ""} onClick={() => setFil({ ...fil, stage: fil.stage === k ? "all" : k })}>{k}단계</button>)}
      </div>

      {!doc.loaded ? <Skeleton rows={4} cols={6} /> : (
        <div className="cb-wrap">
          <div className="cb-k">
            {CHANGE_STATUS.map((col) => {
              const list = cards.filter((c) => c.status === col.key);
              return (
                <section key={col.key} className="cb-col" aria-label={col.label}>
                  <div className="cb-h" style={{ ["--cc" as string]: COL_COLOR[col.key] }}><b>{col.label}</b><span>{list.length}</span></div>
                  {list.map((c) => (
                    <button key={c.id} type="button" className={`cb-c${c.id === selId ? " sel" : ""}`} onClick={() => { setSelId(c.id); setDraft(null); }}>
                      {thumb(c.screen) && <span className="cb-th"><i className="cx-th xs" style={{ backgroundImage: `url(${thumb(c.screen)})` }} /></span>}
                      <b>{c.title}</b>
                      <span className="cb-m">
                        {c.screen && <code>{c.screen}</code>}
                        <span className={`cb-t ${c.kind}`}>{CHANGE_KIND_LABEL[c.kind]}</span>
                        <span className={`cb-p ${c.path}`}>{PATH_SHORT[c.path]}</span>
                        {c.stage && <span className="cb-t ops">{c.stage}단계</span>}
                      </span>
                      {noMeasure(c) && <span className="cb-pr bad">잴 방법 없음</span>}
                      {c.path === "dev" && c.handed_off_at && <span className="cb-pr ok">재민에게 넘김 · {c.handed_off_at.slice(5, 10).replace("-", "/")}</span>}
                      {c.checks?.length ? <span className="cb-pr">체크 {c.checks.filter((x) => x.done).length}/{c.checks.length}</span> : null}
                    </button>
                  ))}
                </section>
              );
            })}
          </div>

          <aside className="cb-dr" aria-label="카드 자세히">
            {!edit ? <p className="cx-cap">카드를 누르면 여기서 자세히 보고 고칩니다.</p> : (
              <>
                <div className="flex flex-col gap-1">
                  <span className="cx-tag run">{label(edit.status)}</span>
                  <Input value={edit.title} onChange={(e) => set({ title: e.target.value })} placeholder="제목 — 예: 버튼 문구 바꾸기" aria-label="제목" />
                  <span className="cx-cap">{edit.screen ? <><code>{edit.screen}</code> {screenName(edit.screen) ?? "지도에 없는 화면"}</> : "화면 없음"} · {CHANGE_KIND_LABEL[edit.kind]}{edit.owner ? ` · 담당 ${edit.owner}` : ""}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="상태"><Select value={edit.status} onChange={(e) => set({ status: e.target.value as ChangeStatus })}>{CHANGE_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
                  <Field label="종류"><Select value={edit.kind} onChange={(e) => set({ kind: e.target.value as ChangeKind })}>{(Object.keys(CHANGE_KIND_LABEL) as ChangeKind[]).map((k) => <option key={k} value={k}>{CHANGE_KIND_LABEL[k]}</option>)}</Select></Field>
                  <Field label="화면"><Select value={edit.screen ?? ""} onChange={(e) => set({ screen: e.target.value || undefined })}><option value="">— 여러 화면 · 앱 밖</option>{(graph.data?.screens ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                  <Field label="단계 · 담당"><Input value={[edit.stage, edit.owner].filter(Boolean).join(" · ")} onChange={(e) => { const [a, ...b] = e.target.value.split("·").map((x) => x.trim()); const n = Number(a); set({ stage: n >= 1 && n <= 3 ? (n as 1 | 2 | 3) : undefined, owner: (n ? b.join(" · ") : [a, ...b].join(" · ")) || undefined }); }} placeholder="2 · 재민" /></Field>
                </div>
                <div className="cb-ba">
                  <div><em>지금</em>{thumb(edit.screen) ? <span className="cx-th mid" style={{ width: 96, height: 176, backgroundImage: `url(${thumb(edit.screen)})` }} /> : null}<Textarea rows={2} value={edit.now ?? ""} onChange={(e) => set({ now: e.target.value })} aria-label="지금" /></div>
                  <div><em>바뀐 뒤</em><Textarea rows={thumb(edit.screen) ? 9 : 2} value={edit.next ?? ""} onChange={(e) => set({ next: e.target.value })} aria-label="바뀐 뒤" /></div>
                </div>

                <span className="cx-sub">적용 경로</span>
                <div className="e-f">
                  {(Object.keys(CHANGE_PATH_LABEL) as ChangePath[]).map((p) => <button key={p} type="button" className={`e-path${edit.path === p ? " on" : ""}`} onClick={() => set({ path: p })}><b>{CHANGE_PATH_LABEL[p]}</b></button>)}
                </div>
                {edit.path === "remote" && <Field label="원격 설정 키" hint="원격 설정이 앱에 붙으면(재민 인계 ⑤) 배포 없이 바뀝니다"><Input className="font-mono" value={edit.rc_key ?? ""} onChange={(e) => set({ rc_key: e.target.value })} placeholder="screen.option_key" /></Field>}

                <span className="cx-sub">어떻게 잴까</span>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="방식"><Select value={edit.method ?? ""} onChange={(e) => set({ method: (e.target.value || undefined) as ChangeCard["method"] })}><option value="">—</option>{(Object.keys(METHOD_LABEL) as NonNullable<ChangeCard["method"]>[]).map((k) => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}</Select></Field>
                  <Field label="기간"><Input value={edit.period ?? ""} onChange={(e) => set({ period: e.target.value })} placeholder="적용 전후 14일" /></Field>
                  <Field label="지표"><Input value={edit.metric ?? ""} onChange={(e) => set({ metric: e.target.value })} placeholder="상세 → 사용 전환" /></Field>
                  <Field label="가드"><Input value={edit.guard ?? ""} onChange={(e) => set({ guard: e.target.value })} placeholder="쿠폰 사용 건수" /></Field>
                </div>
                {edit.measure && <p className="cx-cap">예전 메모: {edit.measure}</p>}
                <p className="cx-cap">드문 전환(쿠폰 · 스탬프)은 A/B 대신 전후 비교 · 매장 단위로 — 흐름 탭 주별 선에 배포 날이 세로선으로 찍힙니다.</p>

                <span className="cx-sub">체크</span>
                {(edit.checks ?? []).map((k, i) => (
                  <label key={i} className="x-ck"><input type="checkbox" checked={k.done} onChange={(e) => set({ checks: (edit.checks ?? []).map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} /><span>{k.text}</span></label>
                ))}
                {!(edit.checks?.length) && <button type="button" className="cx-btn" onClick={() => set({ checks: DEFAULT_CHECKS[edit.path].map((text) => ({ text, done: false })) })}>기본 체크 넣기</button>}

                <Field label="메모"><Textarea rows={2} value={edit.note ?? ""} onChange={(e) => set({ note: e.target.value })} /></Field>

                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="cx-btn pri" disabled={!dirty || !edit.title.trim() || doc.saving} onClick={() => save(edit)}>{doc.saving ? "저장 중…" : isNew ? "카드 만들기" : "저장"}</button>
                  {edit.path === "dev" && <button type="button" className="cx-btn" onClick={async () => { await navigator.clipboard.writeText(handoffText(edit)); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? "복사했습니다" : "재민에게 보낼 문장"}</button>}
                  {edit.path === "dev" && !edit.handed_off_at && !isNew && <button type="button" className="cx-btn" onClick={() => save({ ...edit, handed_off_at: new Date().toISOString() }, "재민에게 넘김")}>넘김으로 표시</button>}
                  {dirty && <button type="button" className="cx-btn" onClick={() => { setDraft(null); if (isNew) setSelId(null); }}>되돌리기</button>}
                </div>

                {(edit.log?.length ?? 0) > 0 && (
                  <>
                    <span className="cx-sub">기록</span>
                    <div className="x-log">{[...(edit.log ?? [])].reverse().map((l, i) => <span key={i}>{fmtWhen(l.at)} · {l.by} · {l.text}</span>)}</div>
                  </>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const label = (s: ChangeStatus) => CHANGE_STATUS.find((x) => x.key === s)?.label ?? s;
