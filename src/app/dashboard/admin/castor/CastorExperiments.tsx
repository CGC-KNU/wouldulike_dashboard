"use client";

import { useMemo, useState } from "react";
import { EXP_LIFE, type AppGraph, type ChangesDoc, type ExpMethod, type ExpState, type Experiment, type ExperimentsDoc } from "@/lib/castor/app";
import { Empty, Field, Input, Notice, PageHeader, Select, Skeleton, Textarea } from "../_shared/ui";
import { fmtWhen, useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 실험 (기획안 Castor 절 C3 · 실험 v2 시안, 1008). 만들기 = 5단계 마법사, 진행 = 생애(초안 → 기록) + 출시 점검 + 기록.
 *
 * 표본 계산은 두 비율 검정(검정력 80% · 유의수준 5%, 양측). 하루 표본은 고른 이벤트의 GA4 7일 기기 수 ÷ 7.
 * 결과를 보고 일찍 멈추지 않도록 판정은 정한 기간이 지나야 열린다. 군별 결과는 앱 배정(원격 설정)이 붙은 뒤 Probe 가 같은 ID 로 읽는다.
 */
const STEPS = ["무엇을 바꾸나", "지표 하나", "방식", "가드 · 기간", "출시 준비"];
const METHODS: { key: ExpMethod; label: string; desc: string }[] = [
  { key: "ab", label: "A/B", desc: "자주 일어나는 지표 · 배너 클릭 · 쿠폰함 진입 · 가입 완료" },
  { key: "before_after", label: "전후 비교", desc: "앱 전체에 한 번에 바뀌는 것 · 배포일 기준 2주 전후" },
  { key: "holdout", label: "홀드아웃", desc: "푸시 · 첫 주 여정 · 20%는 보내지 않고 비교" },
  { key: "store", label: "매장 단위", desc: "스티커 · 포스터 · 비슷한 매장끼리 다른 안" },
];
const DEFAULT_CHECKS = ["원격 설정 키 만들기", "테스트 기기에서 노출 · 전환 이벤트 확인", "배정 비율 검사(50:50)", "가드 지표 기준값 기록", "Probe 결과 연결(같은 ID)"];

/** 군당 필요 표본 — 두 비율 검정, 양측 5% · 검정력 80% */
export function sampleSize(p1: number, mde: number) {
  const p2 = p1 + mde;
  if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1 || mde === 0) return null;
  const za = 1.959964, zb = 0.841621, pb = (p1 + p2) / 2;
  return Math.ceil((za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (mde * mde));
}

export default function CastorExperiments({ actor }: { actor: string }) {
  const doc = useCastorDoc<ExperimentsDoc>("experiments");
  const graph = useCastorDoc<AppGraph>("app_graph");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const health = useCastorHealth(7);
  const [openId, setOpenId] = useState<string | null>(null);
  const [wiz, setWiz] = useState<{ step: number; x: Experiment } | null>(null);

  const items = doc.data?.items ?? [];
  const open = items.find((x) => x.id === openId) ?? null;

  async function put(x: Experiment, text?: string) {
    const prev = items.find((i) => i.id === x.id);
    const log = [...x.log];
    if (text) log.push({ at: new Date().toISOString(), by: actor, text });
    const next = { ...x, log };
    return doc.save({ items: prev ? items.map((i) => (i.id === x.id ? next : i)) : [...items, next] });
  }

  function blank(): Experiment {
    const n = items.length + 1;
    return { id: `EXP-${String(n).padStart(3, "0")}`, title: "", hypothesis: "", metric: { name: "" }, method: "ab", days: 14, state: "draft", checks: DEFAULT_CHECKS.map((text) => ({ text, done: false })), log: [] };
  }

  return (
    <div className="cx">
      <PageHeader title="실험" description="가설 · 지표 하나 · 방식 · 가드 · 기간이 다 차야 진행합니다. 같은 ID 로 앱과 Probe 가 읽습니다."
        actions={!wiz && <button type="button" className="cx-btn pri" onClick={() => { setWiz({ step: 0, x: blank() }); setOpenId(null); }}>+ 새 실험</button>} />
      {doc.error && <div className="mb-3"><Notice tone="red" title={doc.error} /></div>}

      {wiz ? <Wizard wiz={wiz} setWiz={setWiz} graph={graph.data} changes={changes.data} health={health} saving={doc.saving}
        onSave={async (x) => { if (await put(x, items.some((i) => i.id === x.id) ? "고침" : "초안 만듦")) { setWiz(null); setOpenId(x.id); } }} />
        : !doc.loaded ? <Skeleton rows={4} cols={3} /> : (
        <div className="grid gap-3" style={{ gridTemplateColumns: open ? "260px minmax(0,1fr)" : "1fr" }}>
          <div className="flex flex-col gap-2">
            {items.length === 0 && <Empty title="아직 실험이 없습니다" detail="[+ 새 실험]으로 시작하거나, 변경 보드 카드에서 '어떻게 잴까 = A/B'로 고른 것을 실험으로 옮깁니다." />}
            {items.map((x) => (
              <button key={x.id} type="button" onClick={() => setOpenId(x.id)} className="cx-card text-left" style={{ borderColor: x.id === openId ? "var(--cx-navy)" : undefined }}>
                <span className="cx-cap">{x.id} · {EXP_LIFE.find((l) => l.key === x.state)?.label}</span>
                <b className="block text-[13.5px]" style={{ color: "var(--cx-ink)" }}>{x.title || "(제목 없음)"}</b>
                <span className="cx-cap">{METHODS.find((m) => m.key === x.method)?.label} · {x.screen ?? "화면 없음"} · {x.days}일</span>
              </button>
            ))}
          </div>
          {open && <Run x={open} saving={doc.saving} onEdit={() => setWiz({ step: 0, x: open })} onPut={put} />}
        </div>
      )}
    </div>
  );
}

function Wizard({ wiz, setWiz, graph, changes, health, saving, onSave }: {
  wiz: { step: number; x: Experiment }; setWiz: (w: { step: number; x: Experiment } | null) => void;
  graph: AppGraph | null; changes: ChangesDoc | null; health: ReturnType<typeof useCastorHealth>; saving: boolean; onSave: (x: Experiment) => void;
}) {
  const { step, x } = wiz;
  const set = (p: Partial<Experiment>) => setWiz({ step, x: { ...x, ...p } });
  const ev = health?.ok ? health.events.find((e) => e.name === x.metric.event) : undefined;
  const perDay = ev ? ev.devices7 / 7 : null;
  const n = sampleSize((x.metric.base ?? 0) / 100, (x.metric.mde ?? 0) / 100);
  const arms = x.method === "ab" ? 2 : 1;
  const needDays = n && perDay ? Math.ceil((n * arms) / Math.max(0.1, perDay)) : null;
  const rec: ExpMethod = !perDay ? "before_after" : perDay >= 30 ? "ab" : "before_after";
  const ok = [!!x.title.trim() && !!x.hypothesis.trim(), !!x.metric.name.trim(), !!x.method, !!x.guard?.trim() && x.days > 0, true];

  return (
    <div className="flex flex-col gap-3">
      <div className="x-steps">{STEPS.map((s, i) => <button key={s} type="button" className={i === step ? "on" : i < step && ok[i] ? "done" : ""} onClick={() => setWiz({ step: i, x })}><i>{i < step && ok[i] ? "✓" : i + 1}</i>{s}</button>)}</div>
      <div className="x-grid">
        <div className="cx-card flex flex-col gap-2.5">
          {step === 0 && <>
            <Field label="제목" required><Input value={x.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 배너 넘김 방식" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="화면"><Select value={x.screen ?? ""} onChange={(e) => set({ screen: e.target.value || undefined })}><option value="">—</option>{(graph?.screens ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="변경 카드"><Select value={x.change ?? ""} onChange={(e) => set({ change: e.target.value || undefined })}><option value="">—</option>{(changes?.cards ?? []).filter((c) => c.status !== "done").map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
            </div>
            <Field label="가설" required hint="'~하면 ~가 늘 것이다, 왜냐하면 ~' — 없으면 실험이 낭비입니다"><Textarea rows={3} value={x.hypothesis} onChange={(e) => set({ hypothesis: e.target.value })} /></Field>
          </>}
          {step === 1 && <>
            <Field label="주요 지표 하나" required hint="여럿이면 유리한 걸 고르게 됩니다"><Input value={x.metric.name} onChange={(e) => set({ metric: { ...x.metric, name: e.target.value } })} placeholder="배너 노출 대비 클릭률" /></Field>
            <Field label="전환 이벤트" hint="하루 표본을 GA4 에서 읽습니다"><Select value={x.metric.event ?? ""} onChange={(e) => set({ metric: { ...x.metric, event: e.target.value || undefined } })}><option value="">—</option>{(health?.ok ? health.events : []).map((e) => <option key={e.name} value={e.name}>{e.name} · 7일 기기 {e.devices7}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="지금 값(%)"><Input type="number" step="0.1" value={x.metric.base ?? ""} onChange={(e) => set({ metric: { ...x.metric, base: e.target.value === "" ? undefined : Number(e.target.value) } })} /></Field>
              <Field label="보고 싶은 차이(%p)"><Input type="number" step="0.1" value={x.metric.mde ?? ""} onChange={(e) => set({ metric: { ...x.metric, mde: e.target.value === "" ? undefined : Number(e.target.value) } })} /></Field>
            </div>
          </>}
          {step === 2 && <>
            <div className="x-rec"><b>추천: {METHODS.find((m) => m.key === rec)?.label}</b><span>{perDay === null ? "하루 표본을 모릅니다 — 전환 이벤트를 고르면 다시 추천합니다." : perDay >= 30 ? `하루 약 ${perDay.toFixed(0)} 기기 — 무작위 배정으로 판정 가능.` : `하루 약 ${perDay.toFixed(1)} 기기 — A/B 로는 너무 오래 걸립니다. 전후 비교 · 매장 단위로.`}</span></div>
            <div className="x-meth">{METHODS.map((m) => <button key={m.key} type="button" className={x.method === m.key ? "on" : ""} onClick={() => set({ method: m.key })}><b>{m.label}</b><span>{m.desc}</span></button>)}</div>
          </>}
          {step === 3 && <>
            <Field label="가드 지표" required hint="망가지면 안 되는 것"><Input value={x.guard ?? ""} onChange={(e) => set({ guard: e.target.value })} placeholder="홈 이탈률" /></Field>
            <Field label="중단 규칙"><Input value={x.stop_rule ?? ""} onChange={(e) => set({ stop_rule: e.target.value })} placeholder="가드가 10% 이상 나빠지면 중지" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="기간(일)" required><Input type="number" min={1} value={x.days} onChange={(e) => set({ days: Math.max(1, Number(e.target.value) || 1) })} /></Field>
              <Field label="시작일"><Input type="date" value={x.start ?? ""} onChange={(e) => set({ start: e.target.value || undefined })} /></Field>
            </div>
          </>}
          {step === 4 && <>
            <span className="cx-sub">출시 점검 — 모두 통과해야 진행</span>
            {x.checks.map((c, i) => <div key={i} className="x-ck"><span>○</span><span>{c.text}</span></div>)}
            <p className="cx-cap">점검은 진행 화면에서 하나씩 체크합니다. 저장하면 &apos;초안&apos;으로 들어갑니다.</p>
          </>}
          <div className="flex gap-2 mt-1">
            {step > 0 && <button type="button" className="cx-btn" onClick={() => setWiz({ step: step - 1, x })}>← {STEPS[step - 1]}</button>}
            {step < 4 ? <button type="button" className="cx-btn pri" disabled={!ok[step]} onClick={() => setWiz({ step: step + 1, x })}>{STEPS[step + 1]} →</button>
              : <button type="button" className="cx-btn pri" disabled={!ok.every(Boolean) || saving} onClick={() => onSave(x)}>{saving ? "저장 중…" : "저장"}</button>}
            <button type="button" className="cx-btn" style={{ marginLeft: "auto" }} onClick={() => setWiz(null)}>닫기</button>
          </div>
        </div>

        <div className="cx-card flex flex-col gap-2.5">
          <div className="cx-card-h"><b>표본 계산</b><span className="cx-cap">두 비율 검정 · 검정력 80% · 유의수준 5%</span></div>
          <div className="x-need">
            <div><em>{x.method === "ab" ? "군당 필요" : "필요 표본"}</em><b>{n ? n.toLocaleString() : "—"}</b></div>
            <div><em>하루 표본</em><b>{perDay === null ? "—" : perDay < 10 ? perDay.toFixed(1) : Math.round(perDay)}</b></div>
            <div><em>예상 기간</em><b>{needDays ? `${needDays}일` : "—"}</b></div>
          </div>
          {!n && <p className="cx-cap">지표 단계에서 지금 값 · 보고 싶은 차이를 넣으면 계산합니다.</p>}
          {needDays && needDays > x.days && <p className="x-warn">{x.days}일로는 부족합니다 — 기간을 {needDays}일로 늘리거나, 보고 싶은 차이를 키우세요.</p>}
          {needDays && needDays > 90 && <p className="x-warn">90일이 넘습니다 — 이 지표로는 A/B 가 맞지 않습니다. 전후 비교 · 매장 단위를 고르세요.</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--cx-body)" }}>
            <dt className="cx-cap">제목</dt><dd>{x.title || "—"}</dd>
            <dt className="cx-cap">화면</dt><dd>{x.screen ? <code>{x.screen}</code> : "—"}</dd>
            <dt className="cx-cap">지표</dt><dd>{x.metric.name || "—"}{x.metric.event && <> · <code>{x.metric.event}</code></>}</dd>
            <dt className="cx-cap">방식</dt><dd>{METHODS.find((m) => m.key === x.method)?.label}</dd>
            <dt className="cx-cap">가드</dt><dd>{x.guard || "—"}{x.stop_rule && ` · ${x.stop_rule}`}</dd>
            <dt className="cx-cap">기간</dt><dd>{x.days}일{x.start && ` · ${x.start} 시작`}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

function Run({ x, saving, onEdit, onPut }: { x: Experiment; saving: boolean; onEdit: () => void; onPut: (x: Experiment, text?: string) => Promise<boolean> }) {
  const idx = EXP_LIFE.findIndex((l) => l.key === x.state);
  const elapsed = x.start ? Math.max(0, Math.floor((Date.now() - Date.parse(x.start)) / 864e5)) : 0;
  const allChecked = x.checks.every((c) => c.done);
  const next = EXP_LIFE[idx + 1]?.key as ExpState | undefined;
  const canNext = next && (next !== "running" || allChecked) && (next !== "judged" || (x.start && elapsed >= x.days));
  const [verdict, setVerdict] = useState("");
  const pct = useMemo(() => Math.min(100, (elapsed / Math.max(1, x.days)) * 100), [elapsed, x.days]);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="cx-card-h" style={{ alignItems: "center" }}>
        <div><span className="cx-tag run">{EXP_LIFE[idx]?.label}{x.state === "running" && ` · ${elapsed}/${x.days}일`}</span> <b style={{ fontSize: 15 }}>{x.id} · {x.title}</b>
          <span className="cx-cap block">{METHODS.find((m) => m.key === x.method)?.label} · {x.screen ?? "화면 없음"} · 지표 {x.metric.name} · 가드 {x.guard ?? "—"}{x.start && ` · ${x.start} 시작`}</span></div>
        <button type="button" className="cx-btn" onClick={onEdit}>고치기</button>
      </div>
      <div className="x-life">{EXP_LIFE.map((l, i) => <span key={l.key} className={i < idx ? "done" : i === idx ? "on" : ""}><i />{l.label}</span>)}</div>
      <div className="x-grid">
        <div className="cx-card flex flex-col gap-2">
          <div className="cx-card-h"><b>진행</b><span className="cx-cap">정한 기간까지</span></div>
          <div className="cx-barrow" style={{ gridTemplateColumns: "1fr 3fr 60px" }}><span>기간</span><span className="cx-bar"><i style={{ width: `${pct}%` }} /></span><b>{elapsed}/{x.days}일</b></div>
          <p className="cx-cap" style={{ lineHeight: 1.6 }}>가설 — {x.hypothesis}</p>
          <p className="x-warn">군별 결과는 앱 배정(원격 설정)이 붙은 뒤 Probe 가 같은 ID({x.id})로 읽습니다. 결과를 보고 일찍 멈추지 않도록 판정은 {x.days}일째에 열립니다.</p>
          {x.state === "judged" && <Field label="판정 · 다음 행동"><Textarea rows={2} value={verdict} onChange={(e) => setVerdict(e.target.value)} placeholder="예: B 채택 — 변경 카드 결론으로" /></Field>}
          <div className="flex gap-2">
            {next && <button type="button" className="cx-btn pri" disabled={!canNext || saving || (x.state === "judged" && !verdict.trim())}
              onClick={() => onPut({ ...x, state: next, start: next === "running" && !x.start ? new Date().toISOString().slice(0, 10) : x.start }, x.state === "judged" ? `판정: ${verdict.trim()}` : `${EXP_LIFE[idx].label} → ${EXP_LIFE[idx + 1].label}`)}>{EXP_LIFE[idx + 1].label}(으)로</button>}
            {next === "running" && !allChecked && <span className="cx-cap">출시 점검을 모두 체크해야 진행합니다</span>}
            {next === "judged" && x.start && elapsed < x.days && <span className="cx-cap">{x.days - elapsed}일 뒤 판정할 수 있습니다</span>}
          </div>
        </div>
        <div className="cx-card flex flex-col gap-1.5">
          <div className="cx-card-h"><b>출시 점검</b><span className="cx-cap">모두 통과해야 진행</span></div>
          {x.checks.map((c, i) => <label key={i} className="x-ck"><input type="checkbox" checked={c.done} disabled={saving} onChange={(e) => onPut({ ...x, checks: x.checks.map((k, j) => (j === i ? { ...k, done: e.target.checked } : k)) }, `${e.target.checked ? "체크" : "체크 해제"}: ${c.text}`)} /><span>{c.text}</span></label>)}
          <span className="cx-sub mt-2">기록</span>
          <div className="x-log">{[...x.log].reverse().map((l, i) => <span key={i}>{fmtWhen(l.at)} · {l.by} · {l.text}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
