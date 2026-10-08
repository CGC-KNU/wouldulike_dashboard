"use client";

import { useMemo, useState } from "react";
import { IconCopy, IconPlus } from "@tabler/icons-react";
import { CHANGE_KIND_LABEL, CHANGE_PATH_LABEL, CHANGE_STATUS, type AppGraph, type ChangeCard, type ChangeKind, type ChangePath, type ChangeStatus, type ChangesDoc } from "@/lib/castor/app";
import { Button, Chip, Field, FilterPills, Input, Notice, PageHeader, PanelSection, Select, Skeleton, SlideOver, Textarea, type ChipTone } from "../_shared/ui";
import { fmtWhen, useCastorDoc } from "./useCastor";

/**
 * Castor · 변경 보드 (2단계, 1008). 카드 하나 = 화면 ID · 종류 · 적용 경로 · 잴 방법.
 * 제안 → 디자인 → 개발 → 배포 → 측정 중 → 결론. 개발 경로 카드는 재민에게 넘길 문장을 바로 꺼낸다.
 * 측정할 수 없는 개선은 하지 않는다(기획안 원칙 2) — '잴 방법'이 비면 카드에 경고가 붙는다.
 */
const PATH_TONE: Record<ChangePath, ChipTone> = { remote: "blue", dev: "amber", ops: "gray", us: "navy" };

export default function CastorChanges({ actor }: { actor: string }) {
  const doc = useCastorDoc<ChangesDoc>("changes");
  const graph = useCastorDoc<AppGraph>("app_graph");
  const [stage, setStage] = useState<"all" | "1" | "2" | "3">("all");
  const [edit, setEdit] = useState<ChangeCard | null>(null);
  const [copied, setCopied] = useState(false);

  const cards = useMemo(() => (doc.data?.cards ?? []).filter((c) => stage === "all" || String(c.stage) === stage), [doc.data, stage]);
  const screenName = (id?: string) => graph.data?.screens.find((s) => s.id === id)?.name;

  async function saveCard(c: ChangeCard, text?: string) {
    const all = doc.data?.cards ?? [];
    const prev = all.find((x) => x.id === c.id);
    const log = [...(c.log ?? [])];
    if (prev && prev.status !== c.status) log.push({ at: new Date().toISOString(), by: actor, text: `${label(prev.status)} → ${label(c.status)}` });
    if (!prev) log.push({ at: new Date().toISOString(), by: actor, text: "카드 만듦" });
    if (text) log.push({ at: new Date().toISOString(), by: actor, text });
    const next = { ...c, log };
    const ok = await doc.save({ cards: prev ? all.map((x) => (x.id === c.id ? next : x)) : [...all, next] });
    if (ok) setEdit(null);
  }

  function handoffText(c: ChangeCard) {
    return [`재민님, Castor 변경 보드 카드 하나 넘겨요 — ${c.title}`, c.screen ? `화면: ${screenName(c.screen) ?? c.screen} (${c.screen})` : "", c.now ? `지금: ${c.now}` : "", c.next ? `바꿀 것: ${c.next}` : "", c.measure ? `잴 방법: ${c.measure}` : "", "편하실 때 보시고, 다르게 가는 게 낫다 싶으면 말씀 주세요!"].filter(Boolean).join("\n");
  }

  return (
    <>
      <PageHeader title="변경 보드" description="바꿀 것 하나 = 카드 하나. 화면 · 적용 경로 · 잴 방법을 같이 적습니다."
        actions={<Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEdit({ id: `chg-${Date.now()}`, title: "", kind: "screen", path: "dev", status: "proposed" })}>새 카드</Button>} />
      {doc.error && <div className="mb-3"><Notice tone="red" title={doc.error} /></div>}
      <div className="mb-3"><FilterPills label="단계" value={stage} onChange={setStage} options={[{ key: "all", label: "전체", count: doc.data?.cards.length ?? 0 }, ...(["1", "2", "3"] as const).map((k) => ({ key: k, label: `${k}단계`, count: (doc.data?.cards ?? []).filter((c) => String(c.stage) === k).length }))]} /></div>
      {!doc.loaded ? <Skeleton rows={4} cols={6} /> : (
        <div className="overflow-x-auto -mx-1 px-1 pb-2">
          <div className="grid grid-flow-col auto-cols-[minmax(15rem,1fr)] gap-3 min-w-max xl:min-w-0">
            {CHANGE_STATUS.map((col) => {
              const list = cards.filter((c) => c.status === col.key);
              return (
                <section key={col.key} aria-label={col.label} className="rounded-2xl bg-black/[0.025] p-2.5">
                  <h3 className="px-1 pb-2 text-[12px] font-bold text-gray-500">{col.label} <span className="font-medium text-gray-400">{list.length}</span></h3>
                  <div className="flex flex-col gap-2">
                    {list.map((c) => (
                      <button key={c.id} type="button" onClick={() => setEdit(c)} className="text-left rounded-xl bg-white border border-black/[0.06] px-3 py-2.5 hover:border-navy/40 transition-colors">
                        <span className="block text-[13px] font-bold text-gray-900 leading-snug">{c.title}</span>
                        {c.screen && <span className="block font-mono text-[11px] text-gray-400 mt-0.5">{c.screen}</span>}
                        <span className="flex flex-wrap gap-1 mt-1.5">
                          <Chip tone={PATH_TONE[c.path]}>{CHANGE_PATH_LABEL[c.path]}</Chip>
                          <Chip tone="gray">{CHANGE_KIND_LABEL[c.kind]}</Chip>
                          {c.stage && <Chip tone="navy">{c.stage}단계</Chip>}
                          {!c.measure && c.kind !== "ops" && <Chip tone="red">잴 방법 없음</Chip>}
                          {c.path === "dev" && c.handed_off_at && <Chip tone="green">넘김</Chip>}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {edit && (
        <SlideOver open onClose={() => setEdit(null)} title={edit.title || "새 카드"} subtitle={edit.screen ? `${screenName(edit.screen) ?? "지도에 없는 화면"} · ${edit.screen}` : "화면을 고르면 지도와 이어집니다"} width="lg"
          footer={<>
            <Button variant="primary" disabled={!edit.title.trim() || doc.saving} onClick={() => saveCard({ ...edit, title: edit.title.trim() })}>{doc.saving ? "저장 중…" : "저장"}</Button>
            {edit.path === "dev" && <Button icon={<IconCopy size={14} />} onClick={async () => { await navigator.clipboard.writeText(handoffText(edit)); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? "복사했습니다" : "재민에게 보낼 문장"}</Button>}
            {edit.path === "dev" && !edit.handed_off_at && (doc.data?.cards ?? []).some((x) => x.id === edit.id) && <Button variant="ghost" onClick={() => saveCard({ ...edit, handed_off_at: new Date().toISOString() }, "재민에게 넘김")}>넘김으로 표시</Button>}
            <Button variant="ghost" onClick={() => setEdit(null)}>닫기</Button>
          </>}>
          <div className="space-y-3">
            <Field label="제목" required><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="예: 쿠폰 사용 화면 문구 '관리자 비밀번호' → '매장 PIN'" /></Field>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="상태"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as ChangeStatus })}>{CHANGE_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
              <Field label="종류"><Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as ChangeKind })}>{(Object.keys(CHANGE_KIND_LABEL) as ChangeKind[]).map((k) => <option key={k} value={k}>{CHANGE_KIND_LABEL[k]}</option>)}</Select></Field>
              <Field label="적용 경로"><Select value={edit.path} onChange={(e) => setEdit({ ...edit, path: e.target.value as ChangePath })}>{(Object.keys(CHANGE_PATH_LABEL) as ChangePath[]).map((k) => <option key={k} value={k}>{CHANGE_PATH_LABEL[k]}</option>)}</Select></Field>
              <Field label="단계"><Select value={edit.stage ?? ""} onChange={(e) => setEdit({ ...edit, stage: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined })}><option value="">—</option><option value="1">1단계</option><option value="2">2단계</option><option value="3">3단계</option></Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="화면 ID"><Select value={edit.screen ?? ""} onChange={(e) => setEdit({ ...edit, screen: e.target.value || undefined })}><option value="">— (앱 밖 · 여러 화면)</option>{(graph.data?.screens ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.id}</option>)}</Select></Field>
              <Field label="담당 · 과제"><Input value={[edit.owner, edit.task].filter(Boolean).join(" · ")} onChange={(e) => { const [o, ...t] = e.target.value.split("·").map((x) => x.trim()); setEdit({ ...edit, owner: o || undefined, task: t.join(" · ") || undefined }); }} placeholder="재민 · 과제 2" /></Field>
            </div>
            <Field label="지금"><Textarea rows={2} value={edit.now ?? ""} onChange={(e) => setEdit({ ...edit, now: e.target.value })} /></Field>
            <Field label="바뀐 뒤"><Textarea rows={2} value={edit.next ?? ""} onChange={(e) => setEdit({ ...edit, next: e.target.value })} /></Field>
            <Field label="잴 방법" hint="무엇으로, 언제 판정하나. 쿠폰 · 스탬프 같은 드문 전환은 매장 단위 전후 비교로."><Textarea rows={2} value={edit.measure ?? ""} onChange={(e) => setEdit({ ...edit, measure: e.target.value })} /></Field>
            <Field label="메모"><Textarea rows={2} value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
            {(edit.log?.length ?? 0) > 0 && (
              <PanelSection title="기록">
                <ul className="space-y-1 text-[12.5px] text-gray-600">{[...(edit.log ?? [])].reverse().map((l, i) => <li key={i}>{fmtWhen(l.at)} · {l.by} · {l.text}</li>)}</ul>
              </PanelSection>
            )}
          </div>
        </SlideOver>
      )}
    </>
  );
}

const label = (s: ChangeStatus) => CHANGE_STATUS.find((x) => x.key === s)?.label ?? s;
