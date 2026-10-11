"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBrandSlack, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { STAGES, SIDE, blank, byUrgency, parseSlack, waiting, type Board, type Project, type Stage } from "@/lib/orbit";
import { Notice, PageHeader, Skeleton, focusRing } from "../_shared/ui";
import { StageChip, Steps } from "./OrbitCard";
import OwnerPicker from "./OwnerPicker";

/**
 * Orbit 보드 (1011, 시안 CGC/04_사내툴_개발/1011_대시보드_시안).
 * 단계 4열 + 끝남 · 보류. 카드를 누르면 오른쪽에서 고친다 — 팀원 누구나(민열님 결정 ②).
 * 저장은 문서 통째로(base_updated_at 이 다르면 409 → 새로 읽기). 단계가 바뀌면 서버 라우트가 그 건 슬랙 스레드에 한 줄 남긴다.
 * 「최근 소식」은 리브라가 슬랙에서 그 건이 언급되면 넣는다(결정 ④) — 화면은 「답함」 표시만 한다.
 */
export default function OrbitBoard({ actor, initial }: { actor: string; initial?: string | null }) {
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const [draft, setDraft] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [partners, setPartners] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/orbit", { cache: "no-store" });
    if (!r.ok) { setBoard(null); setErr((await r.json().catch(() => ({}))).detail ?? `읽지 못했습니다 (${r.status})`); return; }
    setBoard(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/astro/stores").then((r) => (r.ok ? r.json() : null)).then((d) => {
      type S = { is_affiliate: boolean | null; ops: { is_test?: boolean } | null };
      if (d?.stores) setPartners((d.stores as S[]).filter((s) => s.is_affiliate && !s.ops?.is_test).length);
    }).catch(() => {});
  }, []);

  const projects = useMemo(() => board?.projects ?? [], [board]);
  const current = draft ?? projects.find((p) => p.id === sel) ?? null;
  useEffect(() => { setDraft(null); }, [sel]);

  async function save(next: Project[]) {
    setSaving(true); setErr(null);
    const r = await fetch("/api/orbit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projects: next, base_updated_at: board?.updated_at ?? null }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (r.status === 409) { setErr("그사이 다른 사람이 고쳤습니다. 새로 읽었으니 다시 저장해 주세요."); setBoard(d.current ?? board); setDraft(null); return false; }
    if (!r.ok) { setErr(d.detail ?? `저장하지 못했습니다 (${r.status})`); return false; }
    setBoard(d); setDraft(null); return true;
  }
  function edit(patch: Partial<Project>) {
    if (!current) return;
    setDraft({ ...current, ...patch });
  }
  async function commit(p: Project) {
    const sl = parseSlack(p.slack.url);
    const fixed = { ...p, name: p.name.trim(), slack: { url: p.slack.url.trim(), ...sl } };
    if (!fixed.name) { setErr("이름을 적어 주세요."); return; }
    const exists = projects.some((x) => x.id === p.id);
    if (await save(exists ? projects.map((x) => (x.id === p.id ? fixed : x)) : [...projects, fixed])) setSel(p.id);
  }
  async function quick(p: Project, patch: Partial<Project>) {   // 단계 · 할 일 체크 · 답함 — 바로 저장
    await save(projects.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
  }

  if (board === undefined) return <Skeleton rows={6} cols={4} />;
  if (board === null) return <Notice tone="red" title="Orbit 을 읽지 못했습니다">{err}</Notice>;
  const cols: Stage[] = [...STAGES];
  const side = projects.filter((p) => (SIDE as readonly string[]).includes(p.stage));
  const active = projects.filter((p) => !(SIDE as readonly string[]).includes(p.stage));
  const wait = active.reduce((a, p) => a + waiting(p), 0);

  return (
    <>
      <PageHeader title="Orbit" description="구독 개편 · 팝업 · 점주 퍼널처럼 여러 팀원과 팀이 같이 움직이는 큰 일. 단계는 필독 글의 4단계, 소식은 리브라가 슬랙에서 모읍니다." />
      {err && <div className="mb-3"><Notice tone="amber" title={err}><button type="button" className="underline" onClick={() => setErr(null)}>닫기</button></Notice></div>}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        <div className="rounded-2xl bg-white border border-black/[0.05] p-3 col-span-2 lg:col-span-1"><p className="text-[12px] text-gray-500">올해 대구 파트너 100곳</p><p className="text-[22px] font-extrabold tabular-nums">{partners ?? "—"}<span className="text-[12px] font-medium text-gray-400"> / 100</span></p><span className="block h-1.5 rounded-full bg-black/[0.08] overflow-hidden mt-1"><i className="block h-full bg-navy" style={{ width: `${Math.min(100, partners ?? 0)}%` }} /></span></div>
        <div className="rounded-2xl bg-white border border-black/[0.05] p-3"><p className="text-[12px] text-gray-500">진행 중인 큰 일</p><p className="text-[22px] font-extrabold tabular-nums">{active.length}</p></div>
        <div className="rounded-2xl bg-white border border-black/[0.05] p-3"><p className="text-[12px] text-gray-500">답 기다리는 것</p><p className={`text-[22px] font-extrabold tabular-nums ${wait ? "text-red-600" : ""}`}>{wait}</p></div>
        <button type="button" onClick={() => { const b = blank(actor); setSel(b.id); setDraft(b); }} className={`rounded-2xl border border-dashed border-navy/30 text-navy font-bold flex items-center justify-center gap-1.5 hover:bg-navy/[0.03] ${focusRing}`}><IconPlus size={16} /> 새 큰 일</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-x-auto">
          <div className="grid grid-cols-4 gap-2 min-w-[540px]">
            {cols.map((c) => {
              const list = active.filter((p) => p.stage === c).sort(byUrgency);
              return (
                <div key={c}>
                  <p className="flex justify-between text-[12px] font-bold text-gray-500 mb-2 px-0.5">{c}<span className="text-gray-400 tabular-nums">{list.length}</span></p>
                  <ul className="space-y-2">
                    {list.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setSel(p.id)} className={`w-full text-left rounded-xl bg-white border p-2.5 hover:border-navy/40 ${sel === p.id ? "border-navy ring-2 ring-navy/15" : "border-black/[0.07]"} ${focusRing}`}>
                          <span className="block text-[13px] font-bold text-gray-900">{p.name}</span>
                          <span className="flex flex-wrap gap-1 mt-1.5">{p.owners.map((o) => <span key={o} className="text-[11px] font-semibold px-1.5 rounded-full bg-black/[0.04] text-gray-600">{o}</span>)}</span>
                          <span className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-gray-400"><span className="truncate">{p.due || p.team}</span>{waiting(p) > 0 && <StageChip p={p} />}</span>
                        </button>
                      </li>))}
                    {list.length === 0 && <li className="text-[12px] text-gray-400 px-1">없음</li>}
                  </ul>
                </div>
              );
            })}
          </div>
          {side.length > 0 && (
            <details className="mt-4">
              <summary className="text-[12px] font-bold text-gray-500 cursor-pointer">끝남 · 보류 {side.length}</summary>
              <ul className="mt-2 flex flex-wrap gap-2">{side.map((p) => <li key={p.id}><button type="button" onClick={() => setSel(p.id)} className={`text-[12px] px-2.5 py-1 rounded-full border border-black/10 bg-white ${focusRing}`}>{p.name} · {p.stage}</button></li>)}</ul>
            </details>
          )}
        </div>

        <aside className="rounded-2xl bg-white border border-black/[0.06] p-4 self-start xl:sticky xl:top-20" aria-label="큰 일 자세히">
          {!current ? <p className="text-[13px] text-gray-500">왼쪽에서 큰 일을 고르거나 「새 큰 일」을 누르세요.</p> : (
            <Detail key={current.id} p={current} dirty={!!draft} saving={saving} actor={actor} isNew={!projects.some((x) => x.id === current.id)}
              onEdit={edit} onCommit={() => commit(current)} onCancel={() => { setDraft(null); if (!projects.some((x) => x.id === current.id)) setSel(null); }}
              onQuick={(patch) => quick(current, patch)} onClose={() => setSel(null)}
              onDelete={async () => { if (await save(projects.filter((x) => x.id !== current.id))) setSel(null); }} />
          )}
        </aside>
      </div>
    </>
  );
}

const input = "w-full rounded-lg border border-black/10 px-2.5 py-1.5 bg-transparent text-[13px]";

function Detail({ p, dirty, saving, actor, isNew, onEdit, onCommit, onCancel, onQuick, onClose, onDelete }: {
  p: Project; dirty: boolean; saving: boolean; actor: string; isNew: boolean;
  onEdit: (x: Partial<Project>) => void; onCommit: () => void; onCancel: () => void; onQuick: (x: Partial<Project>) => void; onClose: () => void; onDelete: () => void;
}) {
  const [todo, setTodo] = useState("");
  const [sure, setSure] = useState(false);
  const editing = dirty || isNew;
  const list = (v: string) => v.split(/[,·]/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input aria-label="이름" value={p.name} onChange={(e) => onEdit({ name: e.target.value })} placeholder="큰 일 이름 — 예: 계대 · 영대 팝업" className="w-full text-[16px] font-extrabold text-gray-900 bg-transparent outline-none border-b border-transparent focus:border-navy/30" />
          <span className="flex items-center gap-1.5 mt-1 text-[11.5px] text-gray-400"><Steps p={p} />{p.created_by ? `만든 사람 ${p.created_by}` : ""}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded hover:bg-black/5"><IconX size={16} /></button>
      </div>

      <div>
        <p className="text-[11.5px] font-bold text-gray-500 mb-1">단계 {!isNew && <span className="font-normal text-gray-400">· 바꾸면 바로 저장되고 슬랙 스레드에 한 줄 남습니다</span>}</p>
        <div className="flex flex-wrap gap-1">
          {[...STAGES, ...SIDE].map((s) => (
            <button key={s} type="button" disabled={saving} onClick={() => (isNew || dirty ? onEdit({ stage: s }) : onQuick({ stage: s }))}
              className={`px-2 py-0.5 rounded-full border text-[11.5px] ${p.stage === s ? "bg-navy text-white border-navy" : "border-black/10 text-gray-600 hover:border-navy/40"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div><span className="block text-[11.5px] font-bold text-gray-500 mb-0.5">담당 <span className="font-normal text-gray-400">(검색해서 체크)</span></span>
        <OwnerPicker value={p.owners} onChange={(owners) => onEdit({ owners })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="text-[11.5px] font-bold text-gray-500">팀</span><input value={p.team} onChange={(e) => onEdit({ team: e.target.value })} placeholder="영업 · 마케팅" className={input} /></label>
        <label className="block"><span className="text-[11.5px] font-bold text-gray-500">언제까지</span><input value={p.due} onChange={(e) => onEdit({ due: e.target.value })} placeholder="11월 · 10/25" className={input} /></label>
      </div>
      <label className="block"><span className="text-[11.5px] font-bold text-gray-500">한 줄 설명</span><textarea rows={2} value={p.summary} onChange={(e) => onEdit({ summary: e.target.value })} className={input} /></label>
      <label className="block"><span className="text-[11.5px] font-bold text-gray-500">슬랙 스레드 링크 <span className="font-normal text-gray-400">(메시지 ⋮ → 링크 복사)</span></span>
        <input value={p.slack.url} onChange={(e) => onEdit({ slack: { url: e.target.value } })} placeholder="https://….slack.com/archives/C…/p…" className={input} /></label>
      <label className="block"><span className="text-[11.5px] font-bold text-gray-500">슬랙에서 찾을 말 <span className="font-normal text-gray-400">(리브라가 이 말이 나오면 소식으로 가져옴 · 쉼표로)</span></span>
        <input value={p.keywords.join(", ")} onChange={(e) => onEdit({ keywords: list(e.target.value) })} placeholder="팝업, 축제 부스" className={input} /></label>

      {editing && (
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={onCommit} className="px-3 py-1.5 rounded-lg bg-navy text-white font-bold disabled:opacity-50">{saving ? "저장 중…" : isNew ? "만들기" : "저장"}</button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-black/10">취소</button>
        </div>
      )}

      {!isNew && (
        <>
          <div className="rounded-xl bg-black/[0.025] p-3">
            <p className="text-[11.5px] font-bold text-gray-500 mb-1.5">할 일</p>
            <ul className="space-y-1">
              {p.todos.map((t) => (
                <li key={t.id} className="flex items-start gap-2 group">
                  <input type="checkbox" checked={t.done} disabled={saving} onChange={() => onQuick({ todos: p.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done, by: actor, at: new Date().toISOString() } : x)) })} className="mt-1 accent-[#060073]" aria-label={t.text} />
                  <span className={`flex-1 ${t.done ? "line-through text-gray-400" : ""}`}>{t.text}{t.done && t.by && <span className="text-[10.5px] text-gray-400 ml-1">· {t.by}</span>}</span>
                  <button type="button" aria-label="할 일 지우기" onClick={() => onQuick({ todos: p.todos.filter((x) => x.id !== t.id) })} className="opacity-0 group-hover:opacity-100 text-gray-400"><IconTrash size={13} /></button>
                </li>))}
            </ul>
            <form className="flex gap-1.5 mt-2" onSubmit={(e) => { e.preventDefault(); if (!todo.trim()) return; onQuick({ todos: [...p.todos, { id: Math.random().toString(36).slice(2, 10), text: todo.trim(), done: false, by: actor, at: new Date().toISOString() }] }); setTodo(""); }}>
              <input value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="할 일 추가" className={input} />
              <button type="submit" disabled={saving || !todo.trim()} className="shrink-0 px-2.5 rounded-lg border border-black/10 disabled:opacity-40"><IconPlus size={14} /></button>
            </form>
          </div>

          <div>
            <p className="text-[11.5px] font-bold text-gray-500 mb-1.5">최근 소식 <span className="font-normal text-gray-400">· 리브라가 슬랙에서 모음</span></p>
            {p.feed.length === 0 ? <p className="text-[12px] text-gray-400">아직 없습니다. 스레드 링크나 「찾을 말」을 적어 두면 슬랙에서 언급될 때 여기 쌓입니다.</p> : (
              <ul className="space-y-2 max-h-72 overflow-auto pr-1">
                {p.feed.map((f, i) => (
                  <li key={`${f.ch}${f.ts}${i}`} className={`border-l-2 pl-2.5 ${f.q ? "border-amber-400" : "border-black/10"}`}>
                    <span className="block text-[10.5px] text-gray-400">{(f.at || "").slice(5, 16).replace("T", " ")}{f.chn ? ` · #${f.chn}` : ""}{f.who ? ` · ${f.who}` : ""}{f.q ? " · 답 기다림" : ""}</span>
                    <span className="text-[12.5px] text-gray-800">{f.text}</span>
                    <span className="flex gap-2 mt-0.5 text-[11px]">
                      {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-navy underline">슬랙에서 보기</a>}
                      {f.q && <button type="button" onClick={() => onQuick({ feed: p.feed.map((x) => (x.ts === f.ts && x.ch === f.ch ? { ...x, q: false } : x)) })} className="text-gray-500 underline">답함으로 표시</button>}
                    </span>
                  </li>))}
              </ul>)}
          </div>

          {(p.stage_log ?? []).length > 0 && (
            <details><summary className="text-[11.5px] font-bold text-gray-500 cursor-pointer">단계 기록 {p.stage_log!.length}</summary>
              <ul className="mt-1 text-[11.5px] text-gray-500 space-y-0.5">{[...p.stage_log!].reverse().map((s, i) => <li key={i}>{s.at.slice(5, 16).replace("T", " ")} · {s.from} → {s.to} · {s.by}</li>)}</ul></details>)}

          <div className="flex items-center justify-between pt-1">
            {p.slack.url ? <a href={p.slack.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#4A154B]"><IconBrandSlack size={15} /> 슬랙 스레드 열기</a> : <span className="text-[11.5px] text-gray-400">슬랙 스레드 미연결</span>}
            {sure ? <span className="flex gap-2 text-[12px]"><button type="button" onClick={onDelete} className="text-red-600 font-bold">정말 지우기</button><button type="button" onClick={() => setSure(false)}>취소</button></span>
              : <button type="button" onClick={() => setSure(true)} className="text-[12px] text-gray-400 hover:text-red-600">지우기</button>}
          </div>
        </>
      )}
    </div>
  );
}
