"use client";

import { useMemo, useState } from "react";
import type { AppGraph, ChangesDoc, RefsDoc, ResearchDoc, ResearchReq } from "@/lib/castor/app";
import { Field, Input, Notice, PageHeader, Select, Skeleton, Textarea } from "../_shared/ui";
import { fmtWhen, useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 조사 (기획안 Castor 절 C3 · 조사 시안, 1008).
 * 왼쪽 = 데이터가 바뀐 곳에서 자동으로 뽑은 조사 거리(끊긴 이벤트 · 가장 크게 빠지는 단계 · 이름 없는 화면 · 측정 중 카드).
 * [조사 요청]은 큐에 쌓이고, Claude 세션이 범위를 좁혀 찾아 결론 · 레퍼런스 · 변경 카드로 채운다 — 이 화면은 요청과 결과를 보관한다.
 */
const ST: Record<ResearchReq["status"], string> = { queued: "대기", doing: "조사 중", done: "완료" };

export default function CastorResearch({ actor }: { actor: string }) {
  const doc = useCastorDoc<ResearchDoc>("research");
  const refs = useCastorDoc<RefsDoc>("refs");
  const graph = useCastorDoc<AppGraph>("app_graph");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const h = useCastorHealth(7);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<ResearchReq | null>(null);

  const reqs = doc.data?.requests ?? [];
  const cur = reqs.find((r) => r.id === sel) ?? reqs[reqs.length - 1] ?? null;

  const feed = useMemo(() => {
    const out: { scope: ResearchReq["scope"]; text: string; screen?: string }[] = [];
    if (h?.ok) {
      for (const f of h.flows) {
        let w = { i: 0, r: 1 };
        f.steps.forEach((s, i) => { if (i && f.steps[i - 1].devices) { const r = s.devices / f.steps[i - 1].devices; if (r < w.r) w = { i, r }; } });
        if (w.i) out.push({ scope: "흐름", text: `${f.title}: ${f.steps[w.i - 1].label} → ${f.steps[w.i].label} ${Math.round(w.r * 100)}% 만 넘어감` });
      }
      const tot = h.screen_views.reduce((a, s) => a + s.views, 0), un = h.screen_views.find((s) => s.screen === "(이름 없음)")?.views ?? 0;
      if (tot && un / tot > 0.2) out.push({ scope: "화면", text: `화면 기록의 ${Math.round((un / tot) * 100)}% 가 이름 없음 — 어느 화면에서 떠나는지 모름` });
      const live = new Map(h.events.map((e) => [e.name, e.d7]));
      const silent = (graph.data?.events ?? []).filter((e) => e.used.length && !live.get(e.name));
      if (silent.length) out.push({ scope: "화면", text: `코드엔 있는데 7일 0건인 이벤트 ${silent.length}개 (${silent.slice(0, 3).map((e) => e.name).join(", ")}…)` });
    }
    for (const c of changes.data?.cards ?? []) if (c.status === "measuring") out.push({ scope: "실험", text: `측정 중: ${c.title}`, screen: c.screen });
    return out;
  }, [h, graph.data, changes.data]);

  async function save(r: ResearchReq) {
    const exists = reqs.some((x) => x.id === r.id);
    if (await doc.save({ requests: exists ? reqs.map((x) => (x.id === r.id ? r : x)) : [...reqs, r] })) { setForm(null); setSel(r.id); }
  }
  const newReq = (p: Partial<ResearchReq> = {}): ResearchReq => ({ id: `rs-${Date.now()}`, scope: "화면", status: "queued", by: actor, at: new Date().toISOString(), question: "", ...p });

  return (
    <div className="cx">
      <PageHeader title="조사" description="데이터가 바뀐 곳에서 조사 거리를 뽑고, 요청하면 Claude 가 범위를 좁혀 찾아 정리합니다."
        actions={<button type="button" className="cx-btn pri" onClick={() => setForm(newReq())}>+ 조사 요청</button>} />
      {doc.error && <div className="mb-3"><Notice tone="red" title={doc.error} /></div>}
      {!doc.loaded ? <Skeleton rows={5} cols={3} /> : (
        <div className="r-split">
          <aside className="cx-panel">
            <span className="cx-sub">바뀐 것 · 조사 거리 {h === undefined ? "(GA4 읽는 중)" : ""}</span>
            {feed.length === 0 && h !== undefined && <p className="cx-cap">지금은 눈에 띄는 변화가 없습니다.</p>}
            {feed.map((f, i) => (
              <div key={i} className="r-fd">
                <span className="cx-tag">{f.scope}</span><button type="button" className="cx-btn" style={{ justifySelf: "end" }} onClick={() => setForm(newReq({ scope: f.scope, screen: f.screen, question: f.text }))}>조사 요청</button>
                <span className="r-fdt">{f.text}</span>
              </div>
            ))}
            <span className="cx-sub mt-2">요청 {reqs.length}</span>
            {[...reqs].reverse().map((r) => (
              <button key={r.id} type="button" className="r-fd text-left" style={{ background: r.id === cur?.id ? "var(--cx-soft)" : undefined, borderRadius: 8, paddingInline: 6 }} onClick={() => { setSel(r.id); setForm(null); }}>
                <span className={`cx-tag${r.status === "done" ? "" : " e"}`}>{ST[r.status]}</span><em style={{ justifySelf: "end" }}>{r.by}</em>
                <span className="r-fdt">{r.question}</span>
              </button>
            ))}
          </aside>

          <div className="flex flex-col gap-3 min-w-0">
            {form ? (
              <div className="cx-card flex flex-col gap-2.5">
                <div className="cx-card-h"><b>조사 요청</b><span className="cx-cap">대기 칸에 들어가고, Claude 세션에서 &apos;Castor 조사 큐 처리&apos;로 채웁니다</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="부문"><Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as ResearchReq["scope"] })}><option>화면</option><option>흐름</option><option>실험</option></Select></Field>
                  <Field label="화면"><Select value={form.screen ?? ""} onChange={(e) => setForm({ ...form, screen: e.target.value || undefined })}><option value="">—</option>{(graph.data?.screens ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                </div>
                <Field label="질문" required><Textarea rows={2} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="이 화면을 더 쉽게 쓰게 하려면?" /></Field>
                <Field label="범위"><Input value={form.range ?? ""} onChange={(e) => setForm({ ...form, range: e.target.value })} placeholder="비슷한 앱 · 앱스토어 스크린샷" /></Field>
                <div className="flex gap-2"><button type="button" className="cx-btn pri" disabled={!form.question.trim() || doc.saving} onClick={() => save({ ...form, question: form.question.trim() })}>{doc.saving ? "저장 중…" : "요청"}</button><button type="button" className="cx-btn" onClick={() => setForm(null)}>취소</button></div>
              </div>
            ) : !cur ? <p className="cx-cap">아직 요청이 없습니다.</p> : (
              <>
                <div className="r-brief">
                  <div className="cx-card-h"><span><span className={`cx-tag${cur.status === "done" ? " run" : " e"}`}>{ST[cur.status]}</span> <b>{cur.question}</b></span><span className="cx-cap">{cur.by}{cur.at ? ` · ${fmtWhen(cur.at)}` : ""}</span></div>
                  <p><b>부문</b> {cur.scope}{cur.screen && <> · <code>{cur.screen}</code></>}{cur.range && <> · <b>범위</b> {cur.range}</>}</p>
                  {cur.answer ? <p><b>결론</b> {cur.answer}</p> : <p className="cx-cap">아직 결론이 없습니다.</p>}
                  {cur.card && <p className="cx-cap">→ 변경 카드: {(changes.data?.cards ?? []).find((c) => c.id === cur.card)?.title ?? cur.card}</p>}
                  {cur.status !== "done" && <div className="flex gap-2"><button type="button" className="cx-btn" onClick={() => save({ ...cur, status: cur.status === "queued" ? "doing" : "done" })}>{cur.status === "queued" ? "조사 중으로" : "완료로"}</button></div>}
                </div>
                {!!cur.refs?.length && (
                  <div className="r-cards">
                    {cur.refs.map((id) => refs.data?.items.find((r) => r.id === id)).filter(Boolean).map((r) => (
                      <div key={r!.id} className="r-card">
                        <div className="r-shots">{r!.shots.slice(0, 2).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ backgroundImage: `url(${u})` }} aria-label={`${r!.app} 화면`} />)}</div>
                        <b>{r!.app}</b><p>{r!.take}</p>{r!.screen && <code>{r!.screen}</code>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
