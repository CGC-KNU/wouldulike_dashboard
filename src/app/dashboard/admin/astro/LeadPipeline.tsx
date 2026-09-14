"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconBuildingStore, IconDownload, IconExternalLink, IconLayoutKanban, IconPlus, IconSearch, IconTable, IconTableImport, IconTargetArrow } from "@tabler/icons-react";
import { ALL_LEAD_STAGES, APP_CATEGORIES, CAMPUSES, INTENT_LABEL, LEAD_SIDE_STAGES, LEAD_STAGES, PROPOSED_PLANS, type Campus, type Lead, type LeadIntent, type LeadStage } from "@/lib/draft/types";
import { looseToISO } from "@/lib/draft/dates";
import { INSTA_STATES, fitOf, type InstaState } from "@/lib/draft/fit";
import { SALES_SHEET } from "@/lib/satellite";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Kpi, PageHeader, PanelSection, Segmented, Select, Skeleton, SlideOver, Stepper, Table, Td, Textarea, Th, agoLabel, daysSince, focusRing, rowClickable, type ChipTone } from "../_shared/ui";
import ActivityLog from "./ActivityLog";
import CampusPicker, { allCampuses } from "./CampusPicker";
import CampusMark from "./CampusMark";

/**
 * Astro · 입점 후보.
 *
 * 0911 정리(민열님): 사람별로 나누지 않는다(멤버가 늘어난다). **캠퍼스**(경북대 · 영남대 · 계명대)가 1차 축, 상권이 2차 축.
 * 칸반은 시트 단계 7개를 그대로 열로 세우면 정신없어서 **4묶음**으로 접는다 — 연락 전 / 연락·미팅 중 / 합의·계약 / 옆으로 빠짐.
 * 카드의 칩은 여전히 시트 단계 그대로다. 묶음은 보기 위한 것이고 데이터는 시트 어휘를 잃지 않는다.
 */

const STALE_DAYS = 7;

const STAGE_TONE: Record<string, ChipTone> = {
  미컨택: "gray", "컨택 중": "blue", "미팅 조율": "blue", "미팅 예정": "navy", "미팅 완료": "navy",
  "구두 합의": "amber", "계약 완료": "green", 재컨택: "amber", 보류: "gray", 거절: "red",
};
const INTENT_TONE: Record<LeadIntent, ChipTone> = { A: "green", B: "blue", C: "gray", D: "red" };

/** 칸반 묶음. 시트 단계 → 4열. */
const GROUPS: { key: string; label: string; stages: LeadStage[]; hint: string }[] = [
  { key: "todo", label: "연락 전", stages: ["미컨택"], hint: "이번 주에 갈 곳" },
  { key: "active", label: "연락 · 미팅", stages: ["컨택 중", "미팅 조율", "미팅 예정", "미팅 완료"], hint: "답을 기다리거나 만나는 중" },
  { key: "closing", label: "합의 · 계약", stages: ["구두 합의", "계약 완료"], hint: "계약서 · 혜택 등록" },
  { key: "side", label: "재컨택 · 보류 · 거절", stages: [...LEAD_SIDE_STAGES], hint: "학기 바뀌면 다시" },
];

function isSide(stage: LeadStage) { return (LEAD_SIDE_STAGES as readonly string[]).includes(stage); }
function isStale(l: Lead) {
  if (l.stage === "계약 완료" || isSide(l.stage)) return false;
  const d = daysSince(l.last_touch_at);
  return d !== null && d >= STALE_DAYS;
}
const campusOf = (l: Lead): Campus => l.campus ?? "경북대";

export default function LeadPipeline({ actor }: { actor: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [campus, setCampus] = useState<Campus | "all">("경북대");
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [showSide, setShowSide] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림에서 바로 이 항목을 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/astro/leads").then((r) => r.json())
      .then((d) => { setLeads(d.leads ?? []); setDraft({ on: Boolean(d.draft), note: d.draft_note }); })
      .catch(() => setLeads([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const patch = useCallback(async (id: string, body: Partial<Lead>) => {
    let snapshot: Lead[] = [];
    setLeads((prev) => { snapshot = prev; return prev.map((l) => (l.id === id ? { ...l, ...body } : l)); });
    try {
      const res = await fetch(`/api/astro/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) return setLeads(snapshot);
      const d = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? d.lead : l)));
    } catch { setLeads(snapshot); }
  }, []);

  const campuses = useMemo(() => allCampuses(leads.map((l) => l.campus)), [leads]);
  const countIn = (c: Campus) => leads.filter((l) => campusOf(l) === c && !isSide(l.stage)).length;
  const inCampus = useMemo(() => leads.filter((l) => campus === "all" || campusOf(l) === campus), [leads, campus]);
  const scoped = useMemo(() => {
    const q = search.trim();
    return inCampus.filter((l) => !q || [l.name, l.owner_name, l.category, l.memo, l.next_action, l.owner].some((v) => v?.includes(q)));
  }, [inCampus, search]);
  const active = useMemo(() => scoped.filter((l) => !isSide(l.stage)), [scoped]);
  const stale = useMemo(() => active.filter(isStale), [active]);
  const meetings = active.filter((l) => l.stage === "미팅 조율" || l.stage === "미팅 예정");

  const rank = (l: Lead) => (l.intent ? "ABCD".indexOf(l.intent) : 4) * 10 + (l.grade ? "ABC".indexOf(l.grade) : 3);
  const sorted = useMemo(() => [...scoped].sort((a, b) => ALL_LEAD_STAGES.indexOf(a.stage) - ALL_LEAD_STAGES.indexOf(b.stage) || rank(a) - rank(b) || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, "ko")), [scoped]);
  const open = leads.find((l) => l.id === openId) ?? null;
  const groups = GROUPS.filter((g) => g.key !== "side" || showSide);


  return (
    <>
      <PageHeader
        title="파트너 후보"
        description="캠퍼스별로 봅니다. 단계 이름은 팀 시트와 같고, 칸반은 네 묶음으로 접었습니다."
        actions={
          <>
            {draft.on && <DraftBadge note={draft.note} />}
            <Button icon={<IconTableImport />} onClick={() => setImporting(true)}>불러오기</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>후보 추가</Button>
          </>
        }
      >
        {/* 1차 축: 캠퍼스. 사람별 분리는 없다. */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Campus | "all"> label="캠퍼스" value={campus} onChange={setCampus} options={[...campuses.map((c) => ({ key: c as Campus | "all", label: `${c} ${countIn(c)}`, icon: <CampusMark campus={c} size={15} /> })), { key: "all", label: "전체" }]} />
          <Segmented<"board" | "table"> label="보기" value={view} onChange={setView} options={[{ key: "board", label: "칸반", icon: <IconLayoutKanban /> }, { key: "table", label: "테이블", icon: <IconTable /> }]} />
          <div className="relative flex-1 min-w-[12rem] max-w-xs ml-auto">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장, 대표자, 담당, 메모" aria-label="후보 검색" className="pl-8" />
          </div>
        </div>
      </PageHeader>

      <div className="sat-stagger grid grid-cols-3 gap-2.5 mb-5">
        <Kpi label="진행 중" value={loading ? "-" : active.length} hint={`연락 전 ${active.filter((l) => l.stage === "미컨택").length} · 합의 이후 ${active.filter((l) => l.stage === "구두 합의" || l.stage === "계약 완료").length}`} />
        <Kpi label="미팅 잡힘" value={loading ? "-" : meetings.length} hint="조율 + 예정" tone="good" />
        <Kpi label={`${STALE_DAYS}일 이상 멈춤`} value={loading ? "-" : stale.length} tone="alert" hint="기록 없는 후보" />
      </div>

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : leads.length === 0 ? (
        <Card><Empty title="아직 후보가 없습니다" detail="팀 시트의 신규 컨택·후보 실측 탭을 한 번에 불러옵니다." action={<Button variant="primary" icon={<IconTableImport />} onClick={() => setImporting(true)}>시트에서 불러오기</Button>} /></Card>
      ) : view === "board" ? (
        <div className={`grid gap-3 ${groups.length === 4 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}`}>
          {groups.map((g) => {
            const list = sorted.filter((l) => g.stages.includes(l.stage));
            return (
              <section key={g.key} className={g.key === "side" ? "opacity-80" : ""} aria-label={`${g.label} ${list.length}곳`}>
                <header className="flex items-baseline justify-between px-1 mb-2">
                  <div><span className="text-[13px] font-semibold text-gray-900">{g.label}</span><span className="ml-2 text-[12px] text-gray-400">{g.hint}</span></div>
                  <span className="text-[13px] font-bold text-gray-700 tabular-nums">{list.length}</span>
                </header>
                <div className="space-y-2">
                  {list.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} showCampus={campus === "all"} />)}
                  {list.length === 0 && <div className="border border-dashed border-black/[0.08] rounded-xl py-8 text-center text-[12px] text-gray-400">비어 있음</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Card flush>
          <Table minWidth="52rem">
            <thead><tr><Th>매장</Th><Th width="7rem">단계</Th><Th width="6rem">의향</Th><Th width="7rem">제안 플랜</Th><Th>다음 액션</Th><Th width="5rem">담당</Th><Th width="7rem" align="right">마지막 접촉</Th></tr></thead>
            <tbody>
              {(showSide ? sorted : sorted.filter((l) => !isSide(l.stage))).map((l) => (
                <tr key={l.id} className={rowClickable} onClick={() => setOpenId(l.id)}>
                  <Td><span className="font-semibold text-gray-900 inline-flex items-center gap-1.5">{campus === "all" && <CampusMark campus={campusOf(l)} size={15} />}{l.name}</span><span className="block text-[11px] text-gray-400">{l.category ?? ""}</span></Td>
                  <Td><Chip tone={STAGE_TONE[l.stage]}>{l.stage}</Chip></Td>
                  <Td>{l.intent ? <Chip tone={INTENT_TONE[l.intent]}>{l.intent}</Chip> : <span className="text-gray-300">-</span>}</Td>
                  <Td>{l.proposed_plan ?? <span className="text-gray-300">-</span>}</Td>
                  <Td className="text-gray-700 truncate max-w-[14rem]">{l.next_action ?? <span className="text-gray-300">-</span>}{l.due && <span className="text-gray-400"> · {l.due}</span>}</Td>
                  <Td className="text-gray-600">{l.owner ?? "-"}</Td>
                  <Td align="right" className={`text-[12px] ${isStale(l) ? "text-red-600 font-semibold" : "text-gray-500"}`}>{agoLabel(l.last_touch_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <label className="inline-flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showSide} onChange={(e) => setShowSide(e.target.checked)} className="w-4 h-4 accent-[#050072]" />
          재컨택 · 보류 · 거절도 보기 ({scoped.filter((l) => isSide(l.stage)).length})
        </label>
        <div className="flex items-center gap-4">
          <a href="/api/astro/export?tab=후보" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-navy"><IconDownload size={13} aria-hidden="true" /> 시트 형식 CSV</a>
          <a href={SALES_SHEET.url(SALES_SHEET.tabs.현황)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-navy">원본 시트 <IconExternalLink size={12} aria-hidden="true" /></a>
        </div>
      </div>

      <LeadDetailPanel lead={open} actor={actor} campusOptions={campuses} onClose={() => setOpenId(null)} onPatch={patch} onConverted={load} />
      {adding && <NewLeadPanel actor={actor} campus={campus === "all" ? (campuses[0] ?? "경북대") : campus} campusOptions={campuses} onClose={() => setAdding(false)} onCreated={load} />}
      {importing && <ImportPanel onClose={() => setImporting(false)} onDone={load} />}
    </>
  );
}

/* ═══════════ 카드 — 한 줄에 필요한 것만 ═══════════ */

function LeadCard({ lead, onOpen, showCampus }: { lead: Lead; onOpen: () => void; showCampus?: boolean }) {
  const stale = isStale(lead);
  return (
    <button type="button" onClick={onOpen} className={`w-full text-left bg-white rounded-xl border p-3 transition-[border-color,box-shadow] hover:border-navy/30 hover:shadow-[0_8px_20px_-14px_rgba(5,0,114,0.35)] ${focusRing} ${stale ? "border-red-200" : "border-black/[0.06]"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-900 leading-snug inline-flex items-center gap-1.5">{showCampus && <CampusMark campus={campusOf(lead)} size={14} />}{lead.name}</p>
        <Chip tone={STAGE_TONE[lead.stage]}>{lead.stage}</Chip>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[12px] text-gray-500">
        {/* 유료화 의향은 카드 앞면에 배지로 — 어느 카드부터 볼지가 여기서 갈린다 (애딧 Pitchr 의 '관심도'). */}
        {lead.intent && <Chip tone={INTENT_TONE[lead.intent]}>의향 {lead.intent}</Chip>}
        {lead.grade && <span>실측 {lead.grade}{lead.score !== null ? ` ${lead.score}` : ""}</span>}
        {lead.proposed_plan && <span>{lead.proposed_plan}</span>}
      </div>
      {lead.next_action && <p className="mt-1.5 text-[12px] text-navy font-medium line-clamp-1"><IconArrowRight size={12} className="inline -mt-0.5 mr-0.5" aria-hidden="true" />{lead.next_action}{lead.due && <span className="text-gray-400 font-normal"> · {lead.due}</span>}</p>}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/[0.05] text-[11px]">
        <span className="text-gray-500">{lead.owner ?? "담당 없음"}</span>
        <span className={stale ? "text-red-600 font-semibold" : "text-gray-400"}>{agoLabel(lead.last_touch_at)}</span>
      </div>
    </button>
  );
}



/* ═══════════ 골라서 넣는 칸 ═══════════
   손으로 적던 칸을 목록으로 바꾼다. 사람마다 "한식"·"한식당"·"韓食" 으로 적으면
   나중에 세지도 거르지도 못한다. 다만 **예전 값을 지우지는 않는다** —
   목록에 없는 값이 이미 들어 있으면 그 값도 보기에 넣어 준다. */
function PickCell({ label, value, options, onCommit, hint, placeholder }: {
  label: string; value: string | null; options: readonly string[];
  onCommit: (v: string | null) => void; hint?: string; placeholder?: string;
}) {
  const extra = value && !options.includes(value) ? [value] : [];
  return (
    <Field label={label} hint={hint}>
      <Select value={value ?? ""} onChange={(e) => onCommit(e.target.value || null)}>
        <option value="">{placeholder ?? "미정"}</option>
        {[...options, ...extra].map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    </Field>
  );
}

/** 기한은 달력에서 고른다. 시트에서 온 "9/20" 같은 값은 열 때 날짜로 읽어 준다. */
function DateCell({ label, value, onCommit, hint }: { label: string; value: string | null; onCommit: (v: string | null) => void; hint?: string }) {
  const iso = looseToISO(value);
  return (
    <Field label={label} hint={hint ?? (value && !iso ? `지금 값: ${value} (날짜로 못 읽었습니다)` : undefined)}>
      <Input type="date" value={iso ?? ""} onChange={(e) => onCommit(e.target.value || null)} />
    </Field>
  );
}

/* ═══════════ 상세 패널 ═══════════ */

function Cell({ label, value, onCommit, placeholder, type, rows, hint }: { label: string; value: string | null; onCommit: (v: string | null) => void; placeholder?: string; type?: string; rows?: number; hint?: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const commit = () => { const n = v.trim(); if (n !== (value ?? "")) onCommit(n || null); };
  return (
    <Field label={label} hint={hint}>
      {rows ? <Textarea rows={rows} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} /> : <Input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} />}
    </Field>
  );
}

function LeadDetailPanel({ lead, actor, campusOptions, onClose, onPatch, onConverted }: { lead: Lead | null; actor: string; campusOptions: string[]; onClose: () => void; onPatch: (id: string, body: Partial<Lead>) => void; onConverted?: () => void }) {
  const [converting, setConverting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMsg(null), [lead?.id]);
  if (!lead) return null;
  const idx = LEAD_STAGES.indexOf(lead.stage as (typeof LEAD_STAGES)[number]);
  const side = isSide(lead.stage);
  const set = (k: keyof Lead) => (v: string | null) => onPatch(lead.id, { [k]: v } as Partial<Lead>);

  async function convert() {
    if (converting) return;
    setConverting(true); setMsg(null);
    try {
      const plan = (lead!.proposed_plan ?? "").toLowerCase();
      const tier = plan.includes("boost") ? "BOOST" : plan.includes("content") ? "CONTENT" : plan.includes("무료") || plan.includes("free") ? "FREE" : null;
      const res = await fetch("/api/astro/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: lead!.id, tier, updated_by: actor }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.detail ?? "등록하지 못했습니다."); return; }
      setMsg(d.created ? `매장 #${d.restaurant_id} 를 만들고 이었습니다. 계약 조건은 매장 현황에서 채우세요.` : `이미 있던 매장 #${d.restaurant_id} 에 이었습니다.`);
      onConverted?.();
    } catch { setMsg("서버에 연결하지 못했습니다."); }
    finally { setConverting(false); }
  }

  return (
    <SlideOver open onClose={onClose} title={lead.name}
      subtitle={[campusOf(lead), lead.category, lead.kind, lead.source.startsWith("sheet") ? `시트 ${lead.source.split(":")[1]} 탭` : "직접 등록", lead.converted_restaurant_id && `매장 #${lead.converted_restaurant_id}`].filter(Boolean).join(" · ")}
      badge={<Chip tone={STAGE_TONE[lead.stage]}>{lead.stage}</Chip>} width="lg"
      footer={
        <>
          {!side && idx >= 0 && idx < LEAD_STAGES.length - 1 && <Button variant="primary" icon={<IconArrowRight />} onClick={() => onPatch(lead.id, { stage: LEAD_STAGES[idx + 1] })}>{LEAD_STAGES[idx + 1]}(으)로</Button>}
          {(lead.stage === "구두 합의" || lead.stage === "계약 완료") && !lead.converted_restaurant_id && <Button icon={<IconBuildingStore />} onClick={convert} disabled={converting}>{converting ? "등록하는 중…" : "제휴 매장으로 등록"}</Button>}
          <Select value={lead.stage} onChange={(e) => onPatch(lead.id, { stage: e.target.value as LeadStage })} aria-label="단계 직접 지정" className="w-32 ml-auto">{ALL_LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</Select>
        </>
      }>
      {!side && <Stepper steps={[...LEAD_STAGES]} current={Math.max(0, idx)} />}
      {msg && <p className="text-[13px] text-navy bg-navy/5 rounded-lg px-3 py-2" role="status">{msg}</p>}

      <PanelSection title="진행">
        <div className="grid grid-cols-2 gap-3">
          <Field label="캠퍼스"><CampusPicker value={campusOf(lead)} options={campusOptions} onChange={(v) => onPatch(lead.id, { campus: v })} /></Field>
          <Field label="유료화 의향"><Select value={lead.intent ?? ""} onChange={(e) => onPatch(lead.id, { intent: (e.target.value || null) as LeadIntent | null })}><option value="">미정</option>{(["A", "B", "C", "D"] as LeadIntent[]).map((i) => <option key={i} value={i}>{i} · {INTENT_LABEL[i]}</option>)}</Select></Field>
          <PickCell label="제안 플랜" value={lead.proposed_plan} options={PROPOSED_PLANS} onCommit={set("proposed_plan")} />
          <Cell label="담당" value={lead.owner} onCommit={set("owner")} placeholder="이름 (참고용)" />
          <DateCell label="기한" value={lead.due} onCommit={set("due")} />
        </div>
        <div className="mt-3"><Cell label="다음 액션" value={lead.next_action} onCommit={set("next_action")} placeholder="예: 금요일 재방문" hint="카드 앞면에 보입니다." /></div>
      </PanelSection>

      <PanelSection title="미팅">
        <div className="grid grid-cols-3 gap-3">
          <Cell label="컨택 일시" value={lead.contacted_at} onCommit={set("contacted_at")} placeholder="8/6" />
          <Cell label="미팅 일시" value={lead.meeting_at} onCommit={set("meeting_at")} placeholder="8/6(목) 14시" />
          <Cell label="참석자" value={lead.attendees} onCommit={set("attendees")} placeholder="준영, 윤지" />
        </div>
      </PanelSection>

      <PanelSection title="매장 정보">
        <div className="grid grid-cols-2 gap-3">
          <Field label="구분"><Select value={lead.kind ?? ""} onChange={(e) => onPatch(lead.id, { kind: (e.target.value || null) as Lead["kind"] })}><option value="">-</option><option>기존 파트너</option><option>신규</option></Select></Field>
          <PickCell label="카테고리" value={lead.category} options={APP_CATEGORIES} onCommit={set("category")} hint="앱이 쓰는 목록입니다." />
          <Cell label="대표자" value={lead.owner_name} onCommit={set("owner_name")} />
          <Cell label="대표 연락처" value={lead.contact} onCommit={set("contact")} type="tel" />
          <Cell label="매장 전화" value={lead.phone} onCommit={set("phone")} type="tel" />
          <Cell label="인스타" value={lead.insta} onCommit={set("insta")} placeholder="@handle" />
        </div>
        <div className="mt-3"><Cell label="링크" value={lead.link} onCommit={set("link")} type="url" placeholder="네이버 플레이스" />{lead.link && <a href={lead.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy mt-1">열기 <IconExternalLink size={12} aria-hidden="true" /></a>}</div>
      </PanelSection>

      <PanelSection title="실측 · 메모">
        {(lead.grade || lead.score !== null) && <p className="text-[12px] text-gray-500 mb-2">0909 실측 등급 <b className="text-gray-800">{lead.grade ?? "-"}</b> · 점수 <b className="text-gray-800">{lead.score ?? "-"}</b> · 마지막 접촉 {agoLabel(lead.last_touch_at)}</p>}
        <div className="space-y-3"><Cell label="공략 포인트" value={lead.angle} onCommit={set("angle")} rows={2} /><Cell label="비고 · 사전조사" value={lead.memo} onCommit={set("memo")} rows={4} /></div>
      </PanelSection>

      <PanelSection title="기록"><ActivityLog targetType="lead" targetId={lead.id} actor={actor} /></PanelSection>
    </SlideOver>
  );
}

/* ═══════════ 등록 ═══════════ */

function NewLeadPanel({ actor, campus, campusOptions, onClose, onCreated }: { actor: string; campus: Campus; campusOptions: string[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", campus, kind: "신규", category: "", owner: actor, intent: "", phone: "", link: "", insta: "", proposed_plan: "", next_action: "", due: "", memo: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 파트너 적합도 — 접혀 있다가 펼치면 나온다. 안 쓰는 사람에게는 없는 칸이어야 한다. */
  const [fitOpen, setFitOpen] = useState(false);
  const [fitIn, setFitIn] = useState<{ reviews: string; blogs: string; followers: string; insta_state: string }>({ reviews: "", blogs: "", followers: "", insta_state: "" });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d]/g, "")) || 0);
  const fit = fitOf({ reviews: num(fitIn.reviews), blogs: num(fitIn.blogs), followers: num(fitIn.followers), insta_state: (fitIn.insta_state || null) as InstaState | null });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/astro/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // 적합도를 봤으면 등급·점수·공략 포인트도 같이 넣는다 — Lead 에 이미 있는 칸이다
        body: JSON.stringify({ ...form, intent: form.intent || null,
          ...(fit.score !== null ? { grade: fit.grade, score: fit.score, angle: fit.angle } : {}) }),
      });
      if (res.ok) { onCreated(); onClose(); } else { const d = await res.json().catch(() => ({})); setError(d.detail ?? "등록하지 못했습니다."); }
    } catch { setError("서버에 연결하지 못했습니다."); } finally { setSaving(false); }
  }
  return (
    <SlideOver open onClose={onClose} title="파트너 후보 추가" subtitle="매장명만 있어도 됩니다."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.name.trim() || saving}>{saving ? "추가하는 중…" : "후보 추가"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <Field label="매장명" required><Input value={form.name} onChange={set("name")} placeholder="예: 경대북문 ○○식당" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="캠퍼스"><CampusPicker value={form.campus} options={campusOptions} onChange={(v) => setForm((f) => ({ ...f, campus: v }))} /></Field>
        <Field label="구분"><Select value={form.kind} onChange={set("kind")}><option>신규</option><option>기존 파트너</option></Select></Field>
        <Field label="카테고리" hint="앱이 쓰는 목록입니다."><Select value={form.category} onChange={set("category")}><option value="">미정</option>{APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="유료화 의향"><Select value={form.intent} onChange={set("intent")}><option value="">미정</option>{(["A", "B", "C", "D"] as LeadIntent[]).map((i) => <option key={i} value={i}>{i} · {INTENT_LABEL[i]}</option>)}</Select></Field>
        <Field label="제안 플랜"><Select value={form.proposed_plan} onChange={set("proposed_plan")}><option value="">미정</option>{PROPOSED_PLANS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}</Select></Field>
        <Field label="매장 전화"><Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" /></Field>
        <Field label="링크"><Input value={form.link} onChange={set("link")} type="url" inputMode="url" placeholder="네이버 플레이스" /></Field>
        <Field label="인스타"><Input value={form.insta} onChange={set("insta")} placeholder="@handle" /></Field>
        <Field label="다음 액션"><Input value={form.next_action} onChange={set("next_action")} placeholder="예: 금요일 재방문" /></Field>
        <Field label="기한"><Input type="date" value={form.due} onChange={set("due")} /></Field>
      </div>
      {/* 파트너 적합도 (베타) — 판단이 실제로 일어나는 자리에 둔다.
          Scope 를 툴로 세우는 대신 후보를 넣는 이 화면 안으로 접어 넣었다 (민열님 0914). */}
      <div className="rounded-[14px] border border-black/[0.07] bg-black/[0.015] overflow-hidden">
        <button type="button" onClick={() => setFitOpen((v) => !v)}
          className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left ${focusRing}`}>
          <IconTargetArrow size={16} className="text-navy shrink-0" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-gray-900">파트너 적합도</span>
          <span className="text-[10.5px] font-bold text-white bg-navy/80 rounded px-1.5 py-[1px]">베타</span>
          {fit.score !== null && !fitOpen && (
            <span className="text-[12px] font-semibold text-navy ml-1">{fit.score}점 · {fit.grade}</span>
          )}
          <span className="ml-auto text-[12px] font-semibold text-navy">{fitOpen ? "접기" : "보기"}</span>
        </button>

        {fitOpen && (
          <div className="px-3.5 pb-3.5 pt-0.5 border-t border-black/[0.05]">
            <p className="text-[12px] text-gray-500 leading-relaxed mb-3">
              네이버 플레이스와 인스타를 열어 네 칸만 옮겨 적으면 등급이 나옵니다.
              <span className="text-gray-700 font-medium"> 인스타 상태만 골라도</span> 절반은 채워집니다.
            </p>
            <Field label="인스타 상태" hint={INSTA_STATES.find((v) => v.key === fitIn.insta_state)?.why}>
              <Select value={fitIn.insta_state} onChange={(e) => setFitIn((f) => ({ ...f, insta_state: e.target.value }))}>
                <option value="">아직 안 봤습니다</option>
                {INSTA_STATES.map((v) => <option key={v.key} value={v.key}>{v.label} · 여지 {v.room}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-2.5 mt-2">
              <Field label="방문자리뷰"><Input value={fitIn.reviews} onChange={(e) => setFitIn((f) => ({ ...f, reviews: e.target.value }))} inputMode="numeric" placeholder="820" /></Field>
              <Field label="블로그리뷰"><Input value={fitIn.blogs} onChange={(e) => setFitIn((f) => ({ ...f, blogs: e.target.value }))} inputMode="numeric" placeholder="140" /></Field>
              <Field label="팔로워"><Input value={fitIn.followers} onChange={(e) => setFitIn((f) => ({ ...f, followers: e.target.value }))} inputMode="numeric" placeholder="290" /></Field>
            </div>

            <div className="mt-3 rounded-[12px] bg-white border border-black/[0.06] px-3.5 py-3">
              {fit.score === null ? (
                <p className="text-[12.5px] text-gray-400">
                  규모 {fit.size ?? "—"} · 여지 {fit.room ?? "—"} — <span className="font-medium text-gray-500">둘 다 있어야 점수를 매깁니다.</span>
                </p>
              ) : (
                <>
                  <p className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[26px] font-bold text-gray-900 tabular-nums leading-none tracking-[-0.02em]">{fit.score}</span>
                    <span className={`text-[13px] font-bold px-2 py-0.5 rounded-md text-white ${fit.grade === "A" ? "bg-emerald-700" : fit.grade === "B" ? "bg-amber-600" : "bg-gray-400"}`}>{fit.grade}</span>
                    <span className="text-[12px] text-gray-500 font-mono ml-auto">0.75 × {fit.size} + 0.25 × {fit.room}</span>
                  </p>
                  <div className="mt-2.5 grid gap-1.5">
                    <FitBar label="규모" hint="손님이 얼마나 오나" v={fit.size ?? 0} tone="navy" />
                    <FitBar label="여지" hint="우리가 낄 자리가 있나" v={fit.room ?? 0} tone="teal" />
                  </div>
                  {fit.angle && <p className="mt-2.5 text-[12.5px] text-gray-700 leading-relaxed">{fit.angle}</p>}
                </>
              )}
            </div>
            <p className="text-[11.5px] text-gray-400 mt-2 leading-relaxed">
              영남대 37곳에 팀이 이미 매겨 둔 등급에서 역산한 공식입니다 — 되돌려 보니 <span className="text-gray-600 font-medium">37곳 중 35곳</span>이 맞았습니다.
              다른 상권에서도 맞는지는 아직 모릅니다. 어긋나면 알려 주세요.
            </p>
          </div>
        )}
      </div>

      <Field label="메모"><Textarea rows={3} value={form.memo} onChange={set("memo")} /></Field>
    </SlideOver>
  );
}

/** 규모·여지 막대. 둘이 무엇을 재는지 옆에 적는다 — 숫자만 있으면 무슨 뜻인지 모른다. */
function FitBar({ label, hint, v, tone }: { label: string; hint: string; v: number; tone: "navy" | "teal" }) {
  return (
    <span className="grid grid-cols-[38px_1fr_28px] items-center gap-2">
      <span className="text-[11.5px] font-semibold text-gray-700">{label}</span>
      <span className="h-[7px] rounded-full bg-black/[0.06] overflow-hidden" title={hint}>
        <span className={`block h-full rounded-full ${tone === "navy" ? "bg-navy" : "bg-libra"}`} style={{ width: `${v}%` }} />
      </span>
      <span className="text-[11.5px] tabular-nums text-right text-gray-600 font-semibold">{v}</span>
    </span>
  );
}

/* ═══════════ 시트에서 불러오기 ═══════════ */

type Tab = "현황" | "신규" | "후보" | "후보계명" | "계약";
const TAB_DESC: Record<Tab, string> = {
  현황: "매장 현황 탭 (33곳, 경북대). 대표자·연락처·상권은 매장 운영 필드에도 들어갑니다.",
  신규: "신규 컨택 탭 (24곳, 경북대). 담당자·단계·미팅 일시.",
  후보: "후보 실측 탭 (61곳, 영남대 0909). 등급·점수·공략 포인트. 캠퍼스는 영남대로 들어갑니다.",
  후보계명: "후보 실측 탭 — 계명대 (36곳, 0913). 등급·점수·공략 포인트. 캠퍼스는 계명대로 들어갑니다.",
  계약: "계약 세부사항 탭 (39곳). 플랜·월 이용료·납부·계산서·혜택·홍보물·PIN → 매장 운영 필드.",
};

/**
 * 가져오기 세 갈래 (민열님 0911): ① 팀 시트 링크를 직접 읽기 ② 시트에서 복사해 붙여넣기 ③ 고정 양식(CSV) 내려받아 채운 뒤 업로드.
 * ②③은 같은 파서(`parseTable`)를 탄다 — 첫 줄이 머리글이면 그대로, 없으면 양식 열 순서로 본다. 미리 세어 보고(dry) 확정한다.
 */
function ImportPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"sheet" | "paste" | "file">("sheet");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dry, setDry] = useState<{ rows: number; created: number; updated: number; skipped: number; columns: string[]; sample: string[] } | null>(null);
  const [tab, setTab] = useState<Tab>("신규");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPreview(null); setResult(null); setError(null);
    fetch(`/api/astro/import?tab=${encodeURIComponent(tab)}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.detail); setPreview(d); }).catch((e) => setError(e.message ?? "시트를 읽지 못했습니다."));
  }, [tab]);
  async function run() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/astro/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tab }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail);
      setResult(tab === "계약" || tab === "현황" ? `${d.applied}곳의 운영 필드를 채웠습니다.${d.unmatched?.length ? ` 못 찾은 ${d.unmatched.length}곳: ${d.unmatched.join(", ")}` : ""}` : `${d.created}곳 추가, ${d.updated}곳 갱신.`);
      onDone();
    } catch (e) { setError((e as Error).message ?? "불러오지 못했습니다."); } finally { setBusy(false); }
  }
  const n = (k: string) => (preview?.[k] as number | undefined) ?? 0;

  // 붙여넣기·업로드: 서버에 미리 세어 보게 한 뒤(dry) 확정한다
  useEffect(() => {
    if (mode === "sheet" || !text.trim()) { setDry(null); return; }
    const id = setTimeout(() => {
      fetch("/api/astro/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, dry: true }) })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.detail); setDry(d); setError(null); })
        .catch((e) => { setDry(null); setError(e.message); });
    }, 300);
    return () => clearTimeout(id);
  }, [mode, text]);
  async function runText() {
    if (busy || !text.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/astro/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.detail);
      setResult(`${d.created}곳 추가, ${d.updated}곳 갱신${d.skipped ? `, ${d.skipped}행 건너뜀(매장명 없음)` : ""}.`); onDone();
    } catch (e) { setError((e as Error).message ?? "불러오지 못했습니다."); } finally { setBusy(false); }
  }
  function onFile(f: File | null) {
    if (!f) return;
    setFileName(f.name);
    f.text().then((t) => setText(t));
  }
  const textMode = mode !== "sheet";
  return (
    <SlideOver open onClose={onClose} title="후보 불러오기" subtitle="시트 링크를 읽거나, 복사해 붙여넣거나, 양식을 채워 올립니다. 시트는 건드리지 않습니다." width="lg"
      footer={<>{textMode ? <Button variant="primary" onClick={runText} disabled={!dry || busy}>{busy ? "불러오는 중…" : dry ? `${dry.created + dry.updated}곳 불러오기` : "불러오기"}</Button> : <Button variant="primary" onClick={run} disabled={!preview || busy}>{busy ? "불러오는 중…" : `${tab} 탭 불러오기`}</Button>}<Button variant="ghost" onClick={onClose}>{result ? "닫기" : "취소"}</Button>{result && <span className="text-[12px] text-emerald-700 ml-auto" aria-live="polite">{result}</span>}</>}>
      <Segmented<"sheet" | "paste" | "file"> label="방법" value={mode} onChange={(m) => { setMode(m); setResult(null); setError(null); }} options={[{ key: "sheet", label: "팀 시트 링크" }, { key: "paste", label: "붙여넣기" }, { key: "file", label: "양식 업로드" }]} />
      {mode === "paste" && (
        <>
          <p className="text-[13px] text-gray-600">구글시트에서 머리글 줄부터 드래그해 복사(⌘C)한 뒤 여기에 붙여넣으세요. 머리글이 없으면 <a href="/api/astro/export?tab=양식" className="text-navy font-medium">양식</a> 열 순서로 읽습니다.</p>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"캠퍼스\t담당자\t매장명\t전화번호\t…\n경북대\t준영\t○○식당\t053-…"} className="font-mono text-[12px]" />
        </>
      )}
      {mode === "file" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/api/astro/export?tab=양식" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-800 hover:bg-gray-50"><IconDownload size={15} aria-hidden="true" /> 빈 양식 내려받기 (CSV)</a>
            <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-navy text-white text-[13px] font-semibold cursor-pointer hover:bg-navy/90"><IconTableImport size={15} aria-hidden="true" /> 채운 양식 올리기<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} /></label>
            {fileName && <span className="text-[12px] text-gray-500">{fileName}</span>}
          </div>
          <p className="text-[12px] text-gray-500">양식 머리글은 팀 시트 열과 같습니다(캠퍼스 · 담당자 · 매장명 · … · 비고). 엑셀에서 열어 채우고 CSV 로 저장하면 됩니다. 예시 줄은 지우세요.</p>
        </>
      )}
      {textMode && error && <div className="bg-red-50 rounded-lg px-3 py-2 text-[13px] text-red-700" role="alert">{error}</div>}
      {textMode && dry && (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Kpi label="읽은 행" value={dry.rows} hint={dry.skipped ? `매장명 없는 ${dry.skipped}행 제외` : undefined} />
            <Kpi label="새로 추가" value={dry.created} tone="good" />
            <Kpi label="이미 있음 · 갱신" value={dry.updated} hint="빈 칸만 채움" />
          </div>
          <p className="text-[12px] text-gray-500">읽은 열: {dry.columns.join(" · ")}</p>
          {dry.sample.length > 0 && <p className="text-[12px] text-gray-600">새로 들어올 매장: {dry.sample.join(", ")}{dry.created > dry.sample.length ? " …" : ""}</p>}
        </>
      )}
      {mode === "sheet" && <>
      <FilterPills label="탭" value={tab} onChange={setTab} options={(["신규", "후보", "후보계명", "현황", "계약"] as Tab[]).map((t) => ({ key: t, label: t === "후보" ? "후보 (영남대)" : t === "후보계명" ? "후보 (계명대)" : t }))} />
      <p className="text-[13px] text-gray-600">{TAB_DESC[tab]}</p>
      {mode !== "sheet" ? null : error ? <div className="bg-red-50 rounded-lg px-3 py-2 text-[13px] text-red-700" role="alert">{error}</div> : !preview ? <Skeleton rows={3} cols={2} /> : (
        <div className="grid grid-cols-3 gap-2.5">
          <Kpi label="시트 행" value={n("rows")} />
          {tab === "계약" || tab === "현황" ? <><Kpi label="매장 매칭" value={n("matched")} tone="good" /><Kpi label="못 찾음" value={(preview.unmatched as string[] | undefined)?.length ?? 0} tone="alert" /></> : <><Kpi label="새로 추가" value={n("new")} tone="good" /><Kpi label="이미 있음 · 갱신" value={n("update")} hint="빈 칸만 채움" /></>}
        </div>
      )}
      {preview && Array.isArray(preview.unmatched) && (preview.unmatched as string[]).length > 0 && (
        <PanelSection title="이름이 안 맞는 매장"><ul className="flex flex-wrap gap-1.5">{(preview.unmatched as string[]).map((nme) => <li key={nme} className="text-[12px] bg-black/[0.04] rounded-lg px-2 py-1">{nme}</li>)}</ul></PanelSection>
      )}
      <a href={(preview?.sheet_url as string | undefined) ?? SALES_SHEET.url(0)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy font-medium">시트에서 이 탭 열기 <IconExternalLink size={12} aria-hidden="true" /></a>
      </>}
    </SlideOver>
  );
}
