"use client";

import { useCallback, useEffect, useState } from "react";
import type { CastorExperiment } from "@/lib/draft/types";
import { Card, Chip, DraftBadge, Empty, Spinner, inputCls } from "../_shared/ui";

/**
 * Castor · A/B 후보.
 *
 * 결과물은 그림이 아니라 **기계가 읽는 정의(experiment.json) + 사람이 읽는 착수 스펙** 두 벌이다.
 * 앱과 Probe 가 같은 실험 ID 를 쓰는 게 설계의 핵심이다 — Castor 가 후보를 만들고 Probe 가 결과를 읽는다.
 *
 * 폼이 강제하는 네 가지. 전부 없으면 실험이 낭비로 끝나는 것들이다.
 *   · 가설 — 무엇이 왜 좋아질 거라 보는지 한 문장. 못 쓰면 실험하지 않는다.
 *   · 주요 지표 하나 — 여러 개면 결국 유리한 걸 고르게 된다.
 *   · 가드 지표 — 진입률이 올라도 체류시간이 반토막이면 실패다.
 *   · 기간 — "좋아 보일 때 멈추기"를 막는 유일한 장치.
 */

const STATUS_TONE = { draft: "gray", running: "blue", done: "green", abandoned: "red" } as const;
const STATUS_LABEL = { draft: "초안", running: "진행 중", done: "종료", abandoned: "중단" } as const;

export interface VariantSeed {
  screen: string;
  blocksA: string[];
  blocksB: string[];
}

export default function CastorExperiments({
  seed,
  onSeedConsumed,
  actor,
}: {
  seed?: VariantSeed | null;
  onSeedConsumed?: () => void;
  actor: string;
}) {
  const [items, setItems] = useState<CastorExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(false);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/castor/experiments")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.experiments ?? []);
        setDraft(Boolean(d.draft));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    if (seed) setComposing(true);
  }, [seed]);

  return (
    <div className="space-y-4">
      <Card
        padded={false}
        title="A/B 후보"
        desc="여기서 만든 정의를 앱과 Probe 가 같은 ID 로 읽습니다."
        right={
          <div className="flex items-center gap-2">
            {draft && <DraftBadge note="백엔드 테이블이 생기기 전까지 초안 저장소에 보관합니다." />}
            <button
              onClick={() => setComposing(true)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle"
            >
              + 실험 만들기
            </button>
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty
            title="아직 실험이 없습니다"
            detail="화면 지도에서 블록 순서를 바꾼 뒤 'A/B 후보로' 를 누르면 여기로 넘어옵니다."
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((e) => (
              <ExperimentRow key={e.id} exp={e} onChanged={load} />
            ))}
          </ul>
        )}
      </Card>

      {composing && (
        <Composer
          seed={seed ?? null}
          actor={actor}
          onClose={() => {
            setComposing(false);
            onSeedConsumed?.();
          }}
          onCreated={load}
        />
      )}
    </div>
  );
}

function ExperimentRow({ exp, onChanged }: { exp: CastorExperiment; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"json" | "spec" | null>(null);

  async function copy(kind: "json" | "spec") {
    const text = kind === "json" ? JSON.stringify(toJson(exp), null, 2) : toSpec(exp);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* 무시 */
    }
  }

  async function setStatus(status: CastorExperiment["status"]) {
    await fetch("/api/castor/experiments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: exp.id, status }),
    });
    onChanged();
  }

  return (
    <li>
      <button onClick={() => setOpen(!open)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full text-left px-4 py-3 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Chip tone={STATUS_TONE[exp.status]}>{STATUS_LABEL[exp.status]}</Chip>
          <span className="flex-1 text-xs font-semibold text-gray-800">{exp.hypothesis}</span>
          <span className="text-[10px] text-gray-400">{exp.period.from} · {exp.period.days}일</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          {exp.target.screen || "화면 미지정"} · 주요 지표 {exp.metric.primary}
        </p>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50/60 border-t border-gray-100 pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {exp.variants.map((v) => (
              <div key={v.key} className="bg-white rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold text-navy bg-navy/10 rounded px-1.5 py-0.5">{v.key}</span>
                  <span className="text-[11px] font-semibold text-gray-700">{v.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{v.weight}%</span>
                </div>
                <ol className="text-[10px] text-gray-500 space-y-0.5">
                  {v.blocks.map((b, i) => (
                    <li key={`${i}-${b}`}>
                      {i + 1}. {b}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {exp.metric.guard.map((g) => (
              <Chip key={g} tone="gray">가드 · {g}</Chip>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => copy("json")} aria-live="polite" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 hover:border-periwinkle">
              {copied === "json" ? "복사됨" : "experiment.json 복사"}
            </button>
            <button onClick={() => copy("spec")} aria-live="polite" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 hover:border-periwinkle">
              {copied === "spec" ? "복사됨" : "개발 착수 스펙 복사"}
            </button>
            {exp.status === "draft" && (
              <button onClick={() => setStatus("running")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle">
                진행으로 표시
              </button>
            )}
            {exp.status === "running" && (
              <>
                <button onClick={() => setStatus("done")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle">
                  종료
                </button>
                <button onClick={() => setStatus("abandoned")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold border border-gray-200 bg-white text-gray-500 rounded-lg px-2.5 py-1.5 hover:border-red-300 hover:text-red-500">
                  중단
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/* ═══════════ 작성기 ═══════════ */

function Composer({
  seed,
  actor,
  onClose,
  onCreated,
}: {
  seed: VariantSeed | null;
  actor: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    hypothesis: "",
    screen: seed?.screen ?? "",
    primary: "",
    guard: "",
    from: today,
    days: 14,
    nameA: "현재",
    nameB: "변경안",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(form.hypothesis.trim() && form.primary.trim() && form.from && form.days > 0);

  async function submit() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
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
        metric: {
          primary: form.primary,
          guard: form.guard.split(",").map((s) => s.trim()).filter(Boolean),
        },
        period: { from: form.from, days: Number(form.days) },
        created_by: actor,
      }),
    });
    if (res.ok) {
      onCreated();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.detail ?? "저장하지 못했습니다.");
    }
    } catch {
      setError("서버에 연결하지 못했습니다. 네트워크를 확인하세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="new-exp-title">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between mb-1">
          <h3 id="new-exp-title" className="text-base font-bold text-navy">실험 만들기</h3>
          <button onClick={onClose} aria-label="닫기" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-gray-300 hover:text-gray-500 text-lg leading-none">✕</button>
        </div>
        <p className="text-[10px] text-gray-400 mb-4">
          네 칸이 다 차야 저장됩니다. 하나라도 못 쓰겠으면 아직 실험할 준비가 안 된 것입니다.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-400">가설 — 무엇이 왜 좋아지나 *</span>
            <textarea
              rows={2}
              value={form.hypothesis}
              onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
              placeholder="예: 배너를 누르면 쿠폰함으로 바로 보내면 쿠폰 사용률이 오른다"
              className={`${inputCls} mt-1 resize-none`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-400">대상 화면</span>
            <input
              value={form.screen}
              onChange={(e) => setForm({ ...form, screen: e.target.value })}
              placeholder="예: home"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-400">주요 지표 — 승패를 가를 단 하나 *</span>
            <input
              value={form.primary}
              onChange={(e) => setForm({ ...form, primary: e.target.value })}
              placeholder="예: 배너 노출 → 쿠폰 사용 전환율"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-400">가드 지표 — 망가지면 안 되는 것 (쉼표)</span>
            <input
              value={form.guard}
              onChange={(e) => setForm({ ...form, guard: e.target.value })}
              placeholder="예: 매장 상세 진입 수, 세션당 체류시간"
              className={`${inputCls} mt-1`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-400">시작일 *</span>
              <input
                type="date"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-400">기간(일) *</span>
              <input
                type="number"
                min={1}
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
                className={`${inputCls} mt-1`}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-400">A 이름</span>
              <input value={form.nameA} onChange={(e) => setForm({ ...form, nameA: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-400">B 이름</span>
              <input value={form.nameB} onChange={(e) => setForm({ ...form, nameB: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
          </div>

          {seed && (
            <div className="bg-gray-50 rounded-xl p-3 text-[10px] text-gray-500">
              <p className="font-semibold text-gray-600 mb-1">화면 지도에서 가져온 배치</p>
              <p>A · {seed.blocksA.join(" → ") || "없음"}</p>
              <p className="mt-0.5">B · {seed.blocksB.join(" → ") || "없음"}</p>
            </div>
          )}
        </div>

        {error && <p className="text-[11px] text-red-600 mt-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving || !ready}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full mt-4 bg-navy text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-30 hover:bg-periwinkle transition-colors"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════ 출력 두 벌 ═══════════ */

function toJson(e: CastorExperiment) {
  return {
    id: e.id,
    hypothesis: e.hypothesis,
    target: e.target,
    variants: e.variants,
    metric: e.metric,
    period: e.period,
    source: e.source,
  };
}

/** 재민님이 받아서 바로 착수할 수 있는 형태. 그림이 아니라 파일 경로와 체크리스트다. */
function toSpec(e: CastorExperiment): string {
  const a = e.variants[0];
  const b = e.variants[1];
  return [
    `# ${e.id}`,
    "",
    `**가설** ${e.hypothesis}`,
    `**대상** ${e.target.screen || "-"} · ${e.target.audience}`,
    `**기간** ${e.period.from} 부터 ${e.period.days}일`,
    `**주요 지표** ${e.metric.primary}`,
    `**가드 지표** ${e.metric.guard.join(", ") || "-"}`,
    "",
    "## 블록 순서",
    "",
    "| # | A · " + (a?.name ?? "") + " | B · " + (b?.name ?? "") + " |",
    "|---|---|---|",
    ...Array.from({ length: Math.max(a?.blocks.length ?? 0, b?.blocks.length ?? 0) }, (_, i) =>
      `| ${i + 1} | ${a?.blocks[i] ?? ""} | ${b?.blocks[i] ?? ""} |`
    ),
    "",
    "## 체크리스트",
    "",
    "- [ ] 변형 노출 경로 결정 (미들웨어 분기 / Edge Config)",
    "- [ ] 두 변형 모두 같은 실험 ID 를 이벤트에 실어 보낸다",
    "- [ ] Probe 에서 주요 지표와 가드 지표를 변형별로 나눠 읽을 수 있는지 확인",
    `- [ ] ${e.period.from} + ${e.period.days}일 시점에 종료 (중간에 좋아 보여도 멈추지 않는다)`,
    "",
    `> 기준 커밋 ${e.source.commit || "미지정"} · 작성 ${e.created_by}`,
  ].join("\n");
}
