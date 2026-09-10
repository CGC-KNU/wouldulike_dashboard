"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconBuildingStore, IconDownload, IconExternalLink, IconLayoutKanban, IconPlus, IconSearch, IconTable, IconTableImport } from "@tabler/icons-react";
import { ALL_LEAD_STAGES, CAMPUSES, INTENT_LABEL, LEAD_SIDE_STAGES, LEAD_STAGES, type Campus, type Lead, type LeadIntent, type LeadStage } from "@/lib/draft/types";
import { SALES_SHEET } from "@/lib/satellite";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Kpi, PageHeader, PanelSection, Segmented, Select, Skeleton, SlideOver, Stepper, Table, Td, Textarea, Th, agoLabel, daysSince, focusRing, rowClickable, type ChipTone } from "../_shared/ui";
import ActivityLog from "./ActivityLog";

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
  const [district, setDistrict] = useState<string>("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [showSide, setShowSide] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const countIn = (c: Campus) => leads.filter((l) => campusOf(l) === c && !isSide(l.stage)).length;
  const inCampus = useMemo(() => leads.filter((l) => campus === "all" || campusOf(l) === campus), [leads, campus]);
  const districts = useMemo(() => [...new Set(inCampus.map((l) => l.district).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ko")), [inCampus]);
  const scoped = useMemo(() => {
    const q = search.trim();
    return inCampus.filter((l) => district === "all" || l.district === district).filter((l) => !q || [l.name, l.owner_name, l.category, l.district, l.memo, l.next_action, l.owner].some((v) => v?.includes(q)));
  }, [inCampus, district, search]);
  const active = useMemo(() => scoped.filter((l) => !isSide(l.stage)), [scoped]);
  const stale = useMemo(() => active.filter(isStale), [active]);
  const meetings = active.filter((l) => l.stage === "미팅 조율" || l.stage === "미팅 예정");

  const rank = (l: Lead) => (l.intent ? "ABCD".indexOf(l.intent) : 4) * 10 + (l.grade ? "ABC".indexOf(l.grade) : 3);
  const sorted = useMemo(() => [...scoped].sort((a, b) => ALL_LEAD_STAGES.indexOf(a.stage) - ALL_LEAD_STAGES.indexOf(b.stage) || rank(a) - rank(b) || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, "ko")), [scoped]);
  const open = leads.find((l) => l.id === openId) ?? null;
  const groups = GROUPS.filter((g) => g.key !== "side" || showSide);

  // 상권이 바뀌면(캠퍼스 전환) 상권 필터를 푼다. 없는 상권으로 남아 빈 화면이 되지 않게.
  useEffect(() => { if (district !== "all" && !districts.includes(district)) setDistrict("all"); }, [districts, district]);

  return (
    <>
      <PageHeader
        title="입점 후보"
        description="캠퍼스별로 봅니다. 단계 이름은 팀 시트와 같고, 칸반은 네 묶음으로 접었습니다."
        actions={
          <>
            {draft.on && <DraftBadge note={draft.note} />}
            <Button icon={<IconTableImport />} onClick={() => setImporting(true)}>시트에서 불러오기</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>후보 추가</Button>
          </>
        }
      >
        {/* 1차 축: 캠퍼스. 사람별 분리는 없다. */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Campus | "all"> label="캠퍼스" value={campus} onChange={setCampus} options={[...CAMPUSES.map((c) => ({ key: c as Campus | "all", label: `${c} ${countIn(c)}` })), { key: "all", label: "전체" }]} />
          <Segmented<"board" | "table"> label="보기" value={view} onChange={setView} options={[{ key: "board", label: "칸반", icon: <IconLayoutKanban /> }, { key: "table", label: "테이블", icon: <IconTable /> }]} />
          <div className="relative flex-1 min-w-[12rem] max-w-xs ml-auto">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장, 대표자, 담당, 메모" aria-label="후보 검색" className="pl-8" />
          </div>
        </div>
        {districts.length > 1 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-gray-400 mr-1">상권</span>
            <FilterPills label="상권" value={district} onChange={setDistrict} options={[{ key: "all", label: "전체" }, ...districts.map((d) => ({ key: d, label: d, count: inCampus.filter((l) => l.district === d && !isSide(l.stage)).length }))]} />
          </div>
        )}
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
                  {list.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />)}
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
                  <Td><span className="font-semibold text-gray-900">{l.name}</span><span className="block text-[11px] text-gray-400">{[l.district, l.category].filter(Boolean).join(" · ")}</span></Td>
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
          <a href={`/api/astro/export?tab=후보${district !== "all" ? `&district=${encodeURIComponent(district)}` : ""}`} className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-navy"><IconDownload size={13} aria-hidden="true" /> 시트 형식 CSV</a>
          <a href={SALES_SHEET.url(SALES_SHEET.tabs.현황)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-navy">원본 시트 <IconExternalLink size={12} aria-hidden="true" /></a>
        </div>
      </div>

      <LeadDetailPanel lead={open} actor={actor} onClose={() => setOpenId(null)} onPatch={patch} onConverted={load} />
      {adding && <NewLeadPanel actor={actor} campus={campus === "all" ? "경북대" : campus} onClose={() => setAdding(false)} onCreated={load} />}
      {importing && <ImportPanel onClose={() => setImporting(false)} onDone={load} />}
    </>
  );
}

/* ═══════════ 카드 — 한 줄에 필요한 것만 ═══════════ */

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const stale = isStale(lead);
  return (
    <button type="button" onClick={onOpen} className={`w-full text-left bg-white rounded-xl border p-3 transition-[border-color,box-shadow] hover:border-navy/30 hover:shadow-[0_8px_20px_-14px_rgba(5,0,114,0.35)] ${focusRing} ${stale ? "border-red-200" : "border-black/[0.06]"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-900 leading-snug">{lead.name}</p>
        <Chip tone={STAGE_TONE[lead.stage]}>{lead.stage}</Chip>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[12px] text-gray-500">
        {lead.intent && <span className={`font-semibold ${lead.intent === "A" ? "text-emerald-700" : lead.intent === "D" ? "text-red-600" : "text-gray-700"}`}>의향 {lead.intent}</span>}
        {lead.grade && <span>실측 {lead.grade}{lead.score !== null ? ` ${lead.score}` : ""}</span>}
        {lead.district && <span>{lead.district}</span>}
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

function LeadDetailPanel({ lead, actor, onClose, onPatch, onConverted }: { lead: Lead | null; actor: string; onClose: () => void; onPatch: (id: string, body: Partial<Lead>) => void; onConverted?: () => void }) {
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
      subtitle={[campusOf(lead), lead.district, lead.category, lead.kind, lead.source.startsWith("sheet") ? `시트 ${lead.source.split(":")[1]} 탭` : "직접 등록", lead.converted_restaurant_id && `매장 #${lead.converted_restaurant_id}`].filter(Boolean).join(" · ")}
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
          <Field label="캠퍼스"><Select value={campusOf(lead)} onChange={(e) => onPatch(lead.id, { campus: e.target.value as Campus })}>{CAMPUSES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Cell label="상권" value={lead.district} onCommit={set("district")} placeholder="북문 / 정문" />
          <Field label="유료화 의향"><Select value={lead.intent ?? ""} onChange={(e) => onPatch(lead.id, { intent: (e.target.value || null) as LeadIntent | null })}><option value="">미정</option>{(["A", "B", "C", "D"] as LeadIntent[]).map((i) => <option key={i} value={i}>{i} · {INTENT_LABEL[i]}</option>)}</Select></Field>
          <Cell label="제안 플랜" value={lead.proposed_plan} onCommit={set("proposed_plan")} placeholder="예: Boost 3만" />
          <Cell label="담당" value={lead.owner} onCommit={set("owner")} placeholder="이름 (참고용)" />
          <Cell label="기한" value={lead.due} onCommit={set("due")} placeholder="예: 9/20" />
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
          <Cell label="카테고리" value={lead.category} onCommit={set("category")} />
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

function NewLeadPanel({ actor, campus, onClose, onCreated }: { actor: string; campus: Campus; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", campus, kind: "신규", district: "", category: "", owner: actor, intent: "", phone: "", link: "", proposed_plan: "", next_action: "", due: "", memo: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/astro/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, intent: form.intent || null }) });
      if (res.ok) { onCreated(); onClose(); } else { const d = await res.json().catch(() => ({})); setError(d.detail ?? "등록하지 못했습니다."); }
    } catch { setError("서버에 연결하지 못했습니다."); } finally { setSaving(false); }
  }
  return (
    <SlideOver open onClose={onClose} title="입점 후보 추가" subtitle="매장명만 있어도 됩니다."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.name.trim() || saving}>{saving ? "추가하는 중…" : "후보 추가"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <Field label="매장명" required><Input value={form.name} onChange={set("name")} placeholder="예: 경대북문 ○○식당" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="캠퍼스"><Select value={form.campus} onChange={set("campus")}>{CAMPUSES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="상권"><Input value={form.district} onChange={set("district")} placeholder="예: 북문" /></Field>
        <Field label="구분"><Select value={form.kind} onChange={set("kind")}><option>신규</option><option>기존 파트너</option></Select></Field>
        <Field label="카테고리"><Input value={form.category} onChange={set("category")} placeholder="예: 한식" /></Field>
        <Field label="유료화 의향"><Select value={form.intent} onChange={set("intent")}><option value="">미정</option>{(["A", "B", "C", "D"] as LeadIntent[]).map((i) => <option key={i} value={i}>{i} · {INTENT_LABEL[i]}</option>)}</Select></Field>
        <Field label="제안 플랜"><Input value={form.proposed_plan} onChange={set("proposed_plan")} placeholder="예: Boost 3만" /></Field>
        <Field label="매장 전화"><Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" /></Field>
        <Field label="링크"><Input value={form.link} onChange={set("link")} type="url" inputMode="url" placeholder="네이버 플레이스" /></Field>
        <Field label="다음 액션"><Input value={form.next_action} onChange={set("next_action")} placeholder="예: 금요일 재방문" /></Field>
        <Field label="기한"><Input value={form.due} onChange={set("due")} placeholder="예: 9/20" /></Field>
      </div>
      <Field label="메모"><Textarea rows={3} value={form.memo} onChange={set("memo")} /></Field>
    </SlideOver>
  );
}

/* ═══════════ 시트에서 불러오기 ═══════════ */

type Tab = "현황" | "신규" | "후보" | "계약";
const TAB_DESC: Record<Tab, string> = {
  현황: "매장 현황 탭 (33곳, 경북대). 대표자·연락처·상권은 매장 운영 필드에도 들어갑니다.",
  신규: "신규 컨택 탭 (24곳, 경북대). 담당자·단계·미팅 일시.",
  후보: "후보 실측 탭 (61곳, 영남대 0909). 등급·점수·공략 포인트. 캠퍼스는 영남대로 들어갑니다.",
  계약: "계약 세부사항 탭 (39곳). 플랜·월 이용료·납부·계산서·혜택·홍보물·PIN → 매장 운영 필드.",
};

function ImportPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
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
  return (
    <SlideOver open onClose={onClose} title="시트에서 불러오기" subtitle="팀 세일즈 시트를 직접 읽습니다. 시트는 건드리지 않습니다." width="lg"
      footer={<><Button variant="primary" onClick={run} disabled={!preview || busy}>{busy ? "불러오는 중…" : `${tab} 탭 불러오기`}</Button><Button variant="ghost" onClick={onClose}>{result ? "닫기" : "취소"}</Button>{result && <span className="text-[12px] text-emerald-700 ml-auto" aria-live="polite">{result}</span>}</>}>
      <FilterPills label="탭" value={tab} onChange={setTab} options={(["신규", "후보", "현황", "계약"] as Tab[]).map((t) => ({ key: t, label: t }))} />
      <p className="text-[13px] text-gray-600">{TAB_DESC[tab]}</p>
      {error ? <div className="bg-red-50 rounded-lg px-3 py-2 text-[13px] text-red-700" role="alert">{error}</div> : !preview ? <Skeleton rows={3} cols={2} /> : (
        <div className="grid grid-cols-3 gap-2.5">
          <Kpi label="시트 행" value={n("rows")} />
          {tab === "계약" || tab === "현황" ? <><Kpi label="매장 매칭" value={n("matched")} tone="good" /><Kpi label="못 찾음" value={(preview.unmatched as string[] | undefined)?.length ?? 0} tone="alert" /></> : <><Kpi label="새로 추가" value={n("new")} tone="good" /><Kpi label="이미 있음 · 갱신" value={n("update")} hint="빈 칸만 채움" /></>}
        </div>
      )}
      {preview && Array.isArray(preview.unmatched) && (preview.unmatched as string[]).length > 0 && (
        <PanelSection title="이름이 안 맞는 매장"><ul className="flex flex-wrap gap-1.5">{(preview.unmatched as string[]).map((nme) => <li key={nme} className="text-[12px] bg-black/[0.04] rounded-lg px-2 py-1">{nme}</li>)}</ul></PanelSection>
      )}
      <a href={(preview?.sheet_url as string | undefined) ?? SALES_SHEET.url(0)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy font-medium">시트에서 이 탭 열기 <IconExternalLink size={12} aria-hidden="true" /></a>
    </SlideOver>
  );
}
