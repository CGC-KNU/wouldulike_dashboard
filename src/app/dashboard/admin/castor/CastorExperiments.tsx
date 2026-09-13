"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCopy, IconPlus, IconPlayerPlay, IconPlayerStop, IconFileText } from "@tabler/icons-react";
import type { CastorExperiment } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, Input, PageHeader, PanelSection, Skeleton, SlideOver, Textarea, focusRing, type ChipTone } from "../_shared/ui";

/**
 * Castor · A/B 후보.
 *
 * 결과물은 그림이 아니라 기계가 읽는 정의(experiment.json) + 사람이 읽는 착수 스펙 두 벌이다.
 * 앱과 Probe 가 같은 실험 ID 를 쓴다. Castor 가 후보를 만들고 Probe 가 결과를 읽는다.
 *
 * 폼이 강제하는 넷: 가설(없으면 낭비) · 주요 지표 하나(여럿이면 유리한 걸 고른다) · 가드 지표(망가지면 안 되는 것) · 기간("좋아 보일 때 멈추기"를 막는 유일한 장치).
 */

const STATUS_TONE: Record<CastorExperiment["status"], ChipTone> = { draft: "gray", running: "blue", done: "green", abandoned: "red" };
const STATUS_LABEL: Record<CastorExperiment["status"], string> = { draft: "초안", running: "진행 중", done: "종료", abandoned: "중단" };

export interface VariantSeed { screen: string; blocksA: string[]; blocksB: string[] }

export default function CastorExperiments({ seed, onSeedConsumed, actor }: { seed?: VariantSeed | null; onSeedConsumed?: () => void; actor: string }) {
  const [items, setItems] = useState<CastorExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(false);
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/castor/experiments")
      .then((r) => r.json())
      .then((d) => { setItems(d.experiments ?? []); setDraft(Boolean(d.draft)); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { if (seed) setComposing(true); }, [seed]);

  const open = items.find((e) => e.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="A/B 후보"
        description="가설·지표·기간이 다 차야 저장됩니다. 저장된 정의는 앱과 Probe 가 같은 ID 로 읽습니다."
        actions={
          <>
            {draft && <DraftBadge note="백엔드 테이블이 생기기 전까지 초안 저장소에 보관합니다." />}
            <Button variant="primary" icon={<IconPlus />} onClick={() => setComposing(true)}>실험 만들기</Button>
          </>
        }
      />

      {loading ? (
        <Card flush><Skeleton rows={4} cols={3} /></Card>
      ) : items.length === 0 ? (
        <Card><Empty title="아직 실험이 없습니다" detail="화면 지도에서 블록 순서를 바꾼 뒤 'A/B 후보로 보내기'를 누르면 여기로 넘어옵니다." /></Card>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setOpenId(e.id)} className={`w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-400 transition-colors ${focusRing}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip tone={STATUS_TONE[e.status]} dot={e.status === "running"}>{STATUS_LABEL[e.status]}</Chip>
                  <span className="text-[14px] font-semibold text-gray-900 flex-1 min-w-0">{e.hypothesis}</span>
                  <span className="text-[12px] text-gray-500 tabular-nums">{e.period.from} 부터 {e.period.days}일</span>
                </div>
                <p className="text-[12px] text-gray-500 mt-1">
                  {e.target.screen || "화면 미지정"} · 주요 지표 <span className="text-gray-700">{e.metric.primary}</span> · <code className="bg-gray-100 px-1 rounded text-[11px]">{e.id}</code>
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <ExperimentPanel exp={open} onClose={() => setOpenId(null)} onChanged={load} />}
      {composing && <Composer seed={seed ?? null} actor={actor} onClose={() => { setComposing(false); onSeedConsumed?.(); }} onCreated={load} />}
    </>
  );
}

function ExperimentPanel({ exp, onClose, onChanged }: { exp: CastorExperiment; onClose: () => void; onChanged: () => void }) {
  const [copied, setCopied] = useState<"json" | "spec" | null>(null);

  async function copy(kind: "json" | "spec") {
    try {
      await navigator.clipboard.writeText(kind === "json" ? JSON.stringify(toJson(exp), null, 2) : toSpec(exp));
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* 무시 */ }
  }
  async function setStatus(status: CastorExperiment["status"]) {
    await fetch("/api/castor/experiments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: exp.id, status }) });
    onChanged();
  }

  return (
    <SlideOver
      open
      onClose={onClose}
      title={exp.hypothesis}
      subtitle={`${exp.id} · ${exp.created_by} · ${exp.created_at.slice(0, 10)}`}
      badge={<Chip tone={STATUS_TONE[exp.status]}>{STATUS_LABEL[exp.status]}</Chip>}
      width="lg"
      footer={
        <>
          {exp.status === "draft" && <Button variant="primary" icon={<IconPlayerPlay />} onClick={() => setStatus("running")}>진행 시작</Button>}
          {exp.status === "running" && (
            <>
              <Button variant="primary" icon={<IconPlayerStop />} onClick={() => setStatus("done")}>종료</Button>
              <Button variant="danger" onClick={() => setStatus("abandoned")}>중단</Button>
            </>
          )}
          <Button icon={<IconCopy />} onClick={() => copy("json")} aria-live="polite" className="ml-auto">{copied === "json" ? "복사했습니다" : "experiment.json"}</Button>
          <Button icon={<IconFileText />} onClick={() => copy("spec")} aria-live="polite">{copied === "spec" ? "복사했습니다" : "착수 스펙"}</Button>
        </>
      }
    >
      <PanelSection title="후보안">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {exp.variants.map((v) => (
            <div key={v.key} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-navy bg-navy/10 rounded px-1.5 py-0.5">{v.key}</span>
                <span className="text-[13px] font-semibold text-gray-800">{v.name}</span>
                <span className="ml-auto text-[12px] text-gray-400 tabular-nums">{v.weight}%</span>
              </div>
              <ol className="text-[12px] text-gray-600 space-y-0.5">
                {v.blocks.length ? v.blocks.map((b, i) => <li key={`${i}-${b}`}>{i + 1}. {b}</li>) : <li className="text-gray-300">블록 없음</li>}
              </ol>
            </div>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="지표 · 기간">
        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          <div className="flex justify-between gap-4 px-3 py-2"><dt className="text-[12px] text-gray-500">주요 지표</dt><dd className="text-[13px] text-gray-900 text-right">{exp.metric.primary}</dd></div>
          <div className="flex justify-between gap-4 px-3 py-2"><dt className="text-[12px] text-gray-500">가드 지표</dt><dd className="text-[13px] text-gray-900 text-right">{exp.metric.guard.join(", ") || "-"}</dd></div>
          <div className="flex justify-between gap-4 px-3 py-2"><dt className="text-[12px] text-gray-500">기간</dt><dd className="text-[13px] text-gray-900 text-right">{exp.period.from} 부터 {exp.period.days}일</dd></div>
          <div className="flex justify-between gap-4 px-3 py-2"><dt className="text-[12px] text-gray-500">대상</dt><dd className="text-[13px] text-gray-900 text-right">{exp.target.screen || "-"} · {exp.target.audience}</dd></div>
          <div className="flex justify-between gap-4 px-3 py-2"><dt className="text-[12px] text-gray-500">기준 커밋</dt><dd className="text-[13px] text-gray-900 text-right">{exp.source.commit || "미지정"}</dd></div>
        </dl>
      </PanelSection>
    </SlideOver>
  );
}

function Composer({ seed, actor, onClose, onCreated }: { seed: VariantSeed | null; actor: string; onClose: () => void; onCreated: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ hypothesis: "", screen: seed?.screen ?? "", primary: "", guard: "", from: today, days: 14, nameA: "현재", nameB: "변경안" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(form.hypothesis.trim() && form.primary.trim() && form.from && form.days > 0);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: k === "days" ? Number(e.target.value) : e.target.value }));

  async function submit() {
    if (!ready || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/castor/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hypothesis: form.hypothesis,
          target: { screen: form.screen, audience: "all" },
          variants: [
            { key: "A", name: form.nameA, weight: 50, blocks: seed?.blocksA ?? [] },
            { key: "B", name: form.nameB, weight: 50, blocks: seed?.blocksB ?? [] },
          ],
          metric: { primary: form.primary, guard: form.guard.split(",").map((s) => s.trim()).filter(Boolean) },
          period: { from: form.from, days: form.days },
          created_by: actor,
        }),
      });
      if (res.ok) { onCreated(); onClose(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail ?? "저장하지 못했습니다."); }
    } catch { setError("서버에 연결하지 못했습니다. 네트워크를 확인하세요."); }
    finally { setSaving(false); }
  }

  return (
    <SlideOver
      open
      onClose={onClose}
      title="실험 만들기"
      subtitle="네 칸이 다 차야 저장됩니다. 하나라도 못 쓰겠으면 아직 실험할 준비가 안 된 것입니다."
      width="lg"
      footer={
        <>
          <Button variant="primary" onClick={submit} disabled={!ready || saving}>{saving ? "저장하는 중…" : "실험 저장"}</Button>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          {error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}
        </>
      }
    >
      <Field label="가설" required hint="무엇이 왜 좋아지나. 한 문장.">
        <Textarea rows={2} value={form.hypothesis} onChange={set("hypothesis")} placeholder="예: 배너를 누르면 쿠폰함으로 바로 보내면 쿠폰 사용률이 오른다" autoFocus />
      </Field>
      <Field label="대상 화면"><Input value={form.screen} onChange={set("screen")} placeholder="예: home" /></Field>
      <Field label="주요 지표" required hint="승패를 가를 단 하나의 숫자.">
        <Input value={form.primary} onChange={set("primary")} placeholder="예: 배너 노출 → 쿠폰 사용 전환율" />
      </Field>
      <Field label="가드 지표" hint="망가지면 안 되는 것. 쉼표로 구분.">
        <Input value={form.guard} onChange={set("guard")} placeholder="예: 매장 상세 진입 수, 세션당 체류시간" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일" required><Input type="date" value={form.from} onChange={set("from")} /></Field>
        <Field label="기간(일)" required><Input type="number" min={1} inputMode="numeric" value={form.days} onChange={set("days")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="A 이름"><Input value={form.nameA} onChange={set("nameA")} /></Field>
        <Field label="B 이름"><Input value={form.nameB} onChange={set("nameB")} /></Field>
      </div>
      {seed && (
        <PanelSection title="화면 지도에서 가져온 배치">
          <div className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
            <p><span className="font-semibold text-gray-800">A</span> {seed.blocksA.join(" → ") || "없음"}</p>
            <p><span className="font-semibold text-gray-800">B</span> {seed.blocksB.join(" → ") || "없음"}</p>
          </div>
        </PanelSection>
      )}
    </SlideOver>
  );
}

function toJson(e: CastorExperiment) {
  return { id: e.id, hypothesis: e.hypothesis, target: e.target, variants: e.variants, metric: e.metric, period: e.period, source: e.source };
}

/** 재민님이 받아서 바로 착수할 수 있는 형태. 그림이 아니라 파일 경로와 체크리스트다. */
function toSpec(e: CastorExperiment): string {
  const [a, b] = e.variants;
  const n = Math.max(a?.blocks.length ?? 0, b?.blocks.length ?? 0);
  return [
    `# ${e.id}`, "",
    `**가설** ${e.hypothesis}`,
    `**대상** ${e.target.screen || "-"} · ${e.target.audience}`,
    `**기간** ${e.period.from} 부터 ${e.period.days}일`,
    `**주요 지표** ${e.metric.primary}`,
    `**가드 지표** ${e.metric.guard.join(", ") || "-"}`, "",
    "## 블록 순서", "",
    `| # | A · ${a?.name ?? ""} | B · ${b?.name ?? ""} |`, "|---|---|---|",
    ...Array.from({ length: n }, (_, i) => `| ${i + 1} | ${a?.blocks[i] ?? ""} | ${b?.blocks[i] ?? ""} |`), "",
    "## 체크리스트", "",
    "- [ ] 변형 노출 경로 결정 (미들웨어 분기 / Edge Config)",
    "- [ ] 두 변형 모두 같은 실험 ID 를 이벤트에 실어 보낸다",
    "- [ ] Probe 에서 주요 지표와 가드 지표를 변형별로 나눠 읽을 수 있는지 확인",
    `- [ ] ${e.period.from} + ${e.period.days}일 시점에 종료 (중간에 좋아 보여도 멈추지 않는다)`, "",
    `> 기준 커밋 ${e.source.commit || "미지정"} · 작성 ${e.created_by}`,
  ].join("\n");
}
