"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LEAD_STAGES, type Lead, type LeadStage, type PlanTier } from "@/lib/draft/types";
import { Card, Chip, DraftBadge, Empty, Kpi, Segmented, Spinner, agoLabel, daysSince, inputCls } from "../_shared/ui";
import ActivityLog from "./ActivityLog";

/**
 * Astro · 신규 컨택 — 입점 후보 파이프라인.
 *
 * ADIT Pitchr 에서 가져온 것 두 가지.
 *
 * 1) **파이프라인이 계약에서 끝나지 않는다.** "계약" 다음에 "입점완료"(첫 콘텐츠 발행·비치물
 *    전달)를 둔다. 영업이 자기가 딴 건이 실제로 굴러갔는지 툴을 갈아타지 않고 본다.
 *
 * 2) **방치 감지.** 7일 이상 아무 기록이 없는 카드는 흐려지고 상단 KPI 에 빨갛게 잡힌다.
 *    총 24곳이라는 숫자보다 "10곳이 미컨택으로 멈춰 있다"가 훨씬 쓸모 있다.
 *
 * 테이블/칸반은 **같은 데이터의 두 렌더**다. 숫자를 셀 때는 테이블이, 밀어야 할 때는
 * 칸반이 낫다. 둘 중 하나만 두면 반드시 다른 하나를 시트로 만든다.
 */

const STALE_DAYS = 7;

const STAGE_TONE: Record<string, "gray" | "blue" | "amber" | "indigo" | "green" | "red"> = {
  미컨택: "gray",
  컨택: "blue",
  미팅조율: "blue",
  미팅: "indigo",
  "제안·견적": "amber",
  계약: "green",
  입점완료: "green",
  거절: "red",
};

export default function LeadPipeline({ actor }: { actor: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [view, setView] = useState<"board" | "table">("board");
  const [showRejected, setShowRejected] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/astro/leads")
      .then((r) => r.json())
      .then((d) => {
        setLeads(d.leads ?? []);
        setDraft({ on: Boolean(d.draft), note: d.draft_note });
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const patch = useCallback(async (id: string, body: Partial<Lead>) => {
    let snapshot: Lead[] = [];
    setLeads((prev) => {
      snapshot = prev;
      return prev.map((l) => (l.id === id ? { ...l, ...body } : l));
    });
    try {
      const res = await fetch(`/api/astro/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // "옮겼는데 안 옮겨져 있다"를 새로고침 때 겪게 하지 않는다 — 지금 되돌린다
        setLeads(snapshot);
        return;
      }
      const d = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? d.lead : l)));
    } catch {
      setLeads(snapshot);
    }
  }, []);

  const active = useMemo(() => leads.filter((l) => l.stage !== "거절"), [leads]);
  const stale = useMemo(
    () =>
      active.filter((l) => {
        if (l.stage === "입점완료") return false;
        const d = daysSince(l.last_touch_at);
        return d !== null && d >= STALE_DAYS;
      }),
    [active]
  );
  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of LEAD_STAGES) map.set(s, []);
    map.set("거절", []);
    for (const l of leads) map.get(l.stage)?.push(l);
    return map;
  }, [leads]);

  const columns: LeadStage[] = showRejected ? [...LEAD_STAGES, "거절"] : [...LEAD_STAGES];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Kpi label="진행 중" value={loading ? "—" : active.length} hint="거절 제외" />
        <Kpi
          label={`${STALE_DAYS}일+ 방치`}
          value={loading ? "—" : stale.length}
          tone="alert"
          hint="아무 기록이 없는 카드"
        />
        <Kpi label="미컨택" value={loading ? "—" : byStage.get("미컨택")?.length ?? 0} hint="아직 안 건드림" />
        <Kpi label="미팅 이후" value={loading ? "—" : (byStage.get("미팅")?.length ?? 0) + (byStage.get("제안·견적")?.length ?? 0)} />
        <Kpi
          label="계약"
          value={loading ? "—" : (byStage.get("계약")?.length ?? 0) + (byStage.get("입점완료")?.length ?? 0)}
          tone="good"
        />
      </div>

      <Card
        padded={false}
        title="입점 파이프라인"
        desc="단계를 옮기면 슬랙에 알림이 가고, 마지막 접촉 시각이 갱신됩니다."
        right={
          <div className="flex items-center gap-2">
            {draft.on && <DraftBadge note={draft.note} />}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { key: "board", label: "칸반" },
                { key: "table", label: "테이블" },
              ]}
            />
            <button
              onClick={() => setAdding(true)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle transition-colors"
            >
              + 후보 등록
            </button>
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : leads.length === 0 ? (
          <Empty
            title="아직 등록된 입점 후보가 없습니다"
            detail={
              "시트 '신규_식당_컨택' 에 24곳이 있다고 들었지만, 지어낸 값으로 채우지 않았습니다. " +
              "위 '+ 후보 등록' 으로 한 건씩 넣거나, 아래 붙여넣기로 시트 열을 그대로 옮기세요."
            }
          />
        ) : view === "board" ? (
          <div className="p-4 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {columns.map((stage) => {
                const list = byStage.get(stage) ?? [];
                return (
                  <div key={stage} className="w-56 shrink-0">
                    <div className="flex items-center justify-between px-1 mb-2">
                      <Chip tone={STAGE_TONE[stage]}>{stage}</Chip>
                      <span className="text-[10px] font-semibold text-gray-400">{list.length}</span>
                    </div>
                    <div className="space-y-2">
                      {list.map((l) => (
                        <LeadCard
                          key={l.id}
                          lead={l}
                          onMove={(s) => patch(l.id, { stage: s })}
                          onOpen={() => setOpenId(openId === l.id ? null : l.id)}
                          open={openId === l.id}
                          actor={actor}
                        />
                      ))}
                      {list.length === 0 && (
                        <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-[10px] text-gray-300">
                          비어 있음
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {(showRejected ? leads : active).map((l) => {
              const idle = daysSince(l.last_touch_at);
              return (
                <li key={l.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{l.name}</span>
                    {l.district && <span className="ml-1.5 text-[10px] text-gray-400">{l.district}</span>}
                  </span>
                  <select
                    value={l.stage}
                    onChange={(e) => patch(l.id, { stage: e.target.value as LeadStage })}
                    className="text-[11px] bg-white text-gray-800 border border-gray-200 rounded-lg px-2 py-1"
                  >
                    {[...LEAD_STAGES, "거절"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <span className="w-16 text-[10px] text-gray-400 text-right">{l.owner ?? "미배정"}</span>
                  <span
                    className={`w-16 text-[10px] text-right ${
                      idle !== null && idle >= STALE_DAYS ? "text-red-500 font-semibold" : "text-gray-400"
                    }`}
                  >
                    {agoLabel(l.last_touch_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* 붙여넣기는 항상 여기 있다 — 24곳을 한 번에 다 옮기지 않고 나눠 붙이는 게 자연스럽다 */}
        <div className="px-4 border-t border-gray-50">
          <PasteImport actor={actor} onDone={load} collapsed={leads.length > 0} />
        </div>

        <div className="px-4 py-2.5 border-t border-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <input
              type="checkbox"
              checked={showRejected}
              onChange={(e) => setShowRejected(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#6366E0]"
            />
            거절한 곳도 보기 ({byStage.get("거절")?.length ?? 0})
          </label>
          <span className="text-[10px] text-gray-400">
            거절은 지우지 않습니다 — 학기가 바뀌면 재컨택 대상이 됩니다.
          </span>
        </div>
      </Card>

      {adding && <NewLeadModal actor={actor} onClose={() => setAdding(false)} onCreated={load} />}
    </div>
  );
}

/* ═══════════ 카드 ═══════════ */

function LeadCard({
  lead,
  onMove,
  onOpen,
  open,
  actor,
}: {
  lead: Lead;
  onMove: (s: LeadStage) => void;
  onOpen: () => void;
  open: boolean;
  actor: string;
}) {
  const idle = daysSince(lead.last_touch_at);
  const isStale = idle !== null && idle >= STALE_DAYS && lead.stage !== "입점완료" && lead.stage !== "거절";
  const stageIdx = LEAD_STAGES.indexOf(lead.stage as (typeof LEAD_STAGES)[number]);

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm transition-opacity ${
        isStale ? "border-red-200 opacity-70" : "border-gray-100"
      }`}
    >
      <button onClick={onOpen} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full text-left p-2.5">
        <div className="flex items-start justify-between gap-1.5">
          <p className="text-xs font-semibold text-gray-800 leading-snug">{lead.name}</p>
          {isStale && <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {lead.expected_plan && <Chip tone="amber">{lead.expected_plan}</Chip>}
          {lead.district && <span className="text-[10px] text-gray-400">{lead.district}</span>}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">{lead.owner ?? "미배정"}</span>
          <span className={`text-[10px] ${isStale ? "text-red-500 font-semibold" : "text-gray-400"}`}>
            {agoLabel(lead.last_touch_at)}
          </span>
        </div>
        {lead.next_action && (
          <p className="mt-1.5 text-[10px] text-periwinkle font-medium truncate">→ {lead.next_action}</p>
        )}
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 border-t border-gray-50 pt-2">
          <div className="flex gap-1">
            <button
              disabled={stageIdx <= 0}
              onClick={() => onMove(LEAD_STAGES[stageIdx - 1])}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation flex-1 text-[10px] font-semibold py-1 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30 hover:border-periwinkle"
            >
              ← 뒤로
            </button>
            <button
              disabled={stageIdx < 0 || stageIdx >= LEAD_STAGES.length - 1}
              onClick={() => onMove(LEAD_STAGES[stageIdx + 1])}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation flex-1 text-[10px] font-semibold py-1 rounded-lg bg-navy text-white disabled:opacity-30 hover:bg-periwinkle"
            >
              다음 →
            </button>
            <button
              onClick={() => onMove("거절")}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold py-1 px-2 rounded-lg border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500"
            >
              거절
            </button>
          </div>
          <ActivityLog targetType="lead" targetId={lead.id} actor={actor} />
        </div>
      )}
    </div>
  );
}

/* ═══════════ 등록 ═══════════ */

function NewLeadModal({
  actor,
  onClose,
  onCreated,
}: {
  actor: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    district: "",
    category: "",
    owner: actor,
    contact: "",
    channel: "방문",
    expected_plan: "" as "" | PlanTier,
    next_action: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/astro/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expected_plan: form.expected_plan || null,
          district: form.district || null,
          category: form.category || null,
          contact: form.contact || null,
          next_action: form.next_action || null,
          memo: form.memo || null,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? "등록하지 못했습니다. 잠시 후 다시 시도하세요.");
      }
    } catch {
      setError("서버에 연결하지 못했습니다. 네트워크를 확인하세요.");
    } finally {
      setSaving(false); // 실패해도 버튼이 영구히 잠기지 않게
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6" role="dialog" aria-modal="true" aria-labelledby="new-lead-title">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between mb-4">
          <h3 id="new-lead-title" className="text-base font-bold text-navy">입점 후보 등록</h3>
          <button onClick={onClose} aria-label="닫기" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-gray-300 hover:text-gray-500 text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          {(
            [
              ["name", "매장명 *", "예: 경대북문 OO식당"],
              ["district", "상권", "예: 경대북문"],
              ["category", "업종", "예: 한식"],
              ["contact", "연락처", "사장님 번호"],
              ["next_action", "다음 할 일", "예: 금요일 재방문"],
            ] as const
          ).map(([k, label, ph]) => (
            <label key={k} className="block">
              <span className="text-[10px] font-semibold text-gray-400">{label}</span>
              <input
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                placeholder={ph}
                autoComplete="off"
                className={`${inputCls} mt-1`}
              />
            </label>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-400">유입</span>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className={`${inputCls} mt-1 bg-white text-gray-800`}
              >
                {["방문", "전화", "인스타DM", "소개", "폼"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-400">예상 플랜</span>
              <select
                value={form.expected_plan}
                onChange={(e) => setForm({ ...form, expected_plan: e.target.value as "" | PlanTier })}
                className={`${inputCls} mt-1 bg-white text-gray-800`}
              >
                <option value="">미정</option>
                {["FREE", "BOOST", "CONTENT"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-400">메모</span>
            <textarea
              rows={3}
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              className={`${inputCls} mt-1 resize-none`}
            />
          </label>
        </div>
        {error && <p className="text-[11px] text-red-600 mt-3" role="alert">{error}</p>}
        <button
          onClick={submit}
          disabled={!form.name.trim() || saving}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full mt-4 bg-navy text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-30 hover:bg-periwinkle transition-colors"
        >
          {saving ? "등록 중…" : "등록"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════ 시트 붙여넣기 가져오기 ═══════════
   시트를 없애자는 게 아니다. 지금 시트가 잘 돌아가고 있으므로, 옮기고 싶을 때만
   열을 그대로 붙여넣어 한 번에 올린다. 형식은 탭 또는 쉼표 구분 — 시트에서 복사하면 탭이다. */

function PasteImport({
  actor,
  onDone,
  collapsed = false,
}: {
  actor: string;
  onDone: () => void;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    const rows = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!rows.length || busy) return;
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    try {
      for (const row of rows) {
        const [name, stage, owner, district, memo] = row.split(/\t|,/).map((s) => s?.trim());
        if (!name) continue;
        try {
          const res = await fetch("/api/astro/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              stage: (LEAD_STAGES as readonly string[]).includes(stage ?? "") ? stage : "미컨택",
              owner: owner || actor,
              district: district || null,
              memo: memo || null,
            }),
          });
          if (res.ok) ok += 1;
          else failed.push(name);
        } catch {
          failed.push(name);
        }
      }
    } finally {
      setBusy(false);
    }
    // 실패한 줄은 이름을 그대로 남긴다 — 뭘 다시 붙여야 하는지 알아야 한다
    setResult(
      failed.length ? `${ok}건 등록 · 실패 ${failed.length}건: ${failed.join(", ")}` : `${ok}건 등록했습니다.`
    );
    setText(failed.length ? rows.filter((r) => failed.some((f) => r.startsWith(f))).join("\n") : "");
    onDone();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation py-2.5 text-[11px] font-semibold text-gray-400 hover:text-navy"
      >
        + 시트에서 붙여넣기
      </button>
    );
  }

  return (
    <div className="pt-4 pb-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-500">시트에서 붙여넣기</p>
        {collapsed && (
          <button
            onClick={() => setOpen(false)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] text-gray-400 hover:text-gray-600"
          >
            접기
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5">
        한 줄에 한 곳. <code className="bg-gray-100 px-1 rounded">매장명 · 단계 · 담당 · 상권 · 메모</code> 순서,
        탭 또는 쉼표 구분. 단계가 비면 <span className="font-semibold">미컨택</span>으로 들어갑니다.
      </p>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"OO식당\t미컨택\t준영\t경대북문\n△△카페\t컨택\t정환\t정문"}
        aria-label="시트에서 붙여넣기"
        className={`${inputCls} mt-2 resize-none font-mono`}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={run}
          disabled={!text.trim() || busy}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-30 hover:bg-periwinkle"
        >
          {busy ? "올리는 중…" : "가져오기"}
        </button>
        {result && (
          <span className={`text-[10px] font-semibold ${result.includes("실패") ? "text-red-600" : "text-emerald-600"}`} aria-live="polite">
            {result}
          </span>
        )}
      </div>
    </div>
  );
}
