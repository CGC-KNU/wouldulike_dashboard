"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconBuildingStore, IconDownload, IconExternalLink, IconLayoutKanban, IconPlus, IconSearch, IconTable, IconTableImport } from "@tabler/icons-react";
import {
  ALL_LEAD_STAGES,
  INTENT_LABEL,
  LEAD_SIDE_STAGES,
  LEAD_STAGES,
  type Lead,
  type LeadIntent,
  type LeadStage,
} from "@/lib/draft/types";
import { SALES_SHEET } from "@/lib/satellite";
import {
  Button,
  Card,
  Chip,
  DraftBadge,
  Empty,
  Field,
  FilterPills,
  Input,
  Kpi,
  PageHeader,
  PanelSection,
  Segmented,
  Select,
  Skeleton,
  SlideOver,
  Stepper,
  Table,
  Td,
  Textarea,
  Th,
  agoLabel,
  daysSince,
  focusRing,
  rowClickable,
  type ChipTone,
} from "../_shared/ui";
import ActivityLog from "./ActivityLog";

/**
 * Astro · 입점 후보 파이프라인.
 *
 * 단계·열은 팀 세일즈 시트(매장 현황 · 신규 컨택 · 후보 실측)와 같다. 시트가 지금 실제로 쓰는 도구라서,
 * 툴이 새 어휘를 만들면 둘 사이에 번역이 생기고 아무도 둘 다 안 믿게 된다.
 *
 * Pitchr 에서 가져온 것: 담당자 필터 알약 · 칸반 ⇄ 테이블 · 열 머리에 개수 · 카드의 빨간 점 = 7일 이상 기록 없음 ·
 * 상세는 오른쪽 패널. 시트에서 한 번에 불러오는 버튼이 있어 24곳을 손으로 옮길 일이 없다.
 */

const STALE_DAYS = 7;

const STAGE_TONE: Record<string, ChipTone> = {
  미컨택: "gray", "컨택 중": "blue", "미팅 조율": "blue", "미팅 예정": "navy", "미팅 완료": "navy",
  "구두 합의": "amber", "계약 완료": "green", 재컨택: "amber", 보류: "gray", 거절: "red",
};
const INTENT_TONE: Record<LeadIntent, ChipTone> = { A: "green", B: "blue", C: "gray", D: "red" };
const GRADE_TONE: Record<string, ChipTone> = { A: "green", B: "blue", C: "gray" };

function isSide(stage: LeadStage) {
  return (LEAD_SIDE_STAGES as readonly string[]).includes(stage);
}
function isStale(l: Lead) {
  if (l.stage === "계약 완료" || isSide(l.stage)) return false;
  const d = daysSince(l.last_touch_at);
  return d !== null && d >= STALE_DAYS;
}

export default function LeadPipeline({ actor }: { actor: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [view, setView] = useState<"board" | "table">("board");
  const [owner, setOwner] = useState<string>("all");
  const [district, setDistrict] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"touch" | "grade" | "name">("grade");
  const [showSide, setShowSide] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/astro/leads")
      .then((r) => r.json())
      .then((d) => { setLeads(d.leads ?? []); setDraft({ on: Boolean(d.draft), note: d.draft_note }); })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
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

  const owners = useMemo(() => [...new Set(leads.map((l) => l.owner).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ko")), [leads]);
  const districts = useMemo(() => [...new Set(leads.map((l) => l.district).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ko")), [leads]);
  const scoped = useMemo(
    () => {
      const q = search.trim();
      return leads
        .filter((l) => (owner === "unassigned" ? !l.owner : owner === "all" ? true : l.owner === owner))
        .filter((l) => district === "all" || l.district === district)
        .filter((l) => !q || [l.name, l.owner_name, l.category, l.district, l.memo, l.next_action].some((v) => v?.includes(q)));
    },
    [leads, owner, district, search]
  );
  const active = useMemo(() => scoped.filter((l) => !isSide(l.stage)), [scoped]);
  const stale = useMemo(() => active.filter(isStale), [active]);
  const byStage = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const s of ALL_LEAD_STAGES) m.set(s, []);
    for (const l of scoped) m.get(l.stage)?.push(l);
    // 열 안 순서: 유료화 의향 A → 실측 등급 A → 점수 높은 순 → 이름. 46곳짜리 미컨택 열에서 "먼저 갈 곳"이 위에 오게.
    const rank = (l: Lead) => (l.intent ? "ABCD".indexOf(l.intent) : 4) * 10 + (l.grade ? "ABC".indexOf(l.grade) : 3);
    const cmp = (a: Lead, b: Lead) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ko")
        : sort === "touch"
          ? (Date.parse(b.last_touch_at ?? "") || 0) - (Date.parse(a.last_touch_at ?? "") || 0) || a.name.localeCompare(b.name, "ko")
          : rank(a) - rank(b) || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, "ko");
    for (const list of m.values()) list.sort(cmp);
    return m;
  }, [scoped, sort]);
  const sortedScoped = useMemo(() => [...ALL_LEAD_STAGES].flatMap((st) => byStage.get(st) ?? []), [byStage]);
  const sideCount = (LEAD_SIDE_STAGES as readonly string[]).reduce((a, s) => a + (byStage.get(s)?.length ?? 0), 0);
  const columns: LeadStage[] = showSide ? [...LEAD_STAGES, ...LEAD_SIDE_STAGES] : [...LEAD_STAGES];
  const open = leads.find((l) => l.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="입점 후보"
        description="처음 연락부터 계약 완료까지 한 보드에서 봅니다. 단계와 열은 팀 시트와 같고, 단계를 옮기면 슬랙에 알림이 갑니다."
        actions={
          <>
            {draft.on && <DraftBadge note={draft.note} />}
            <Button icon={<IconTableImport />} onClick={() => setImporting(true)}>시트에서 불러오기</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>후보 추가</Button>
          </>
        }
      >
        {/* Console 캠페인 관리의 한 줄 툴바: 검색 · 정렬 · 보기 · 총 N */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[14rem] max-w-md">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장명, 대표자, 상권, 메모 검색" aria-label="후보 검색" className="pl-8" />
          </div>
          <FilterPills label="정렬" value={sort} onChange={setSort} options={[{ key: "grade", label: "의향·등급순" }, { key: "touch", label: "최근 접촉순" }, { key: "name", label: "이름순" }]} />
          <Segmented label="보기" value={view} onChange={setView} options={[{ key: "board", label: "칸반", icon: <IconLayoutKanban /> }, { key: "table", label: "테이블", icon: <IconTable /> }]} />
          <span className="text-[12px] text-gray-500 ml-auto tabular-nums">총 {scoped.length}곳</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterPills
            label="담당자"
            value={owner}
            onChange={setOwner}
            options={[
              { key: "all", label: "전체", count: leads.filter((l) => !isSide(l.stage)).length },
              { key: "unassigned", label: "미배정", count: leads.filter((l) => !l.owner && !isSide(l.stage)).length },
              ...owners.map((o) => ({ key: o, label: o, count: leads.filter((l) => l.owner === o && !isSide(l.stage)).length })),
            ]}
          />
        </div>
        {districts.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-gray-400 mr-1">상권</span>
            <FilterPills
              label="상권"
              value={district}
              onChange={setDistrict}
              options={[{ key: "all", label: "전체" }, ...districts.map((d) => ({ key: d, label: d, count: leads.filter((l) => l.district === d && !isSide(l.stage)).length }))]}
            />
            <a href={`/api/astro/export?tab=후보${district !== "all" ? `&district=${encodeURIComponent(district)}` : ""}`} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-gray-500 hover:text-navy">
              <IconDownload size={14} aria-hidden="true" /> 시트 형식 CSV
            </a>
          </div>
        )}
      </PageHeader>

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-5">
        <Kpi label="진행 중" value={loading ? "-" : active.length} hint="재컨택·보류·거절 제외" />
        <Kpi label={`${STALE_DAYS}일 이상 멈춤`} value={loading ? "-" : stale.length} tone="alert" hint="기록이 없는 후보" />
        <Kpi label="미컨택" value={loading ? "-" : byStage.get("미컨택")?.length ?? 0} hint="아직 연락 안 함" />
        <Kpi label="미팅 잡힘" value={loading ? "-" : (byStage.get("미팅 조율")?.length ?? 0) + (byStage.get("미팅 예정")?.length ?? 0)} hint="조율 + 예정" />
        <Kpi label="합의 이후" value={loading ? "-" : (byStage.get("구두 합의")?.length ?? 0) + (byStage.get("계약 완료")?.length ?? 0)} tone="good" hint="구두 합의 + 계약 완료" />
      </div>

      {loading ? (
        <Card flush><Skeleton rows={6} cols={5} /></Card>
      ) : leads.length === 0 ? (
        <Card>
          <Empty
            title="아직 등록된 입점 후보가 없습니다"
            detail="팀 시트의 '신규 컨택' 24곳과 '후보 실측' 61곳을 지어낸 값으로 채우지 않았습니다. 아래 버튼 하나로 시트에서 그대로 불러옵니다."
            action={
              <>
                <Button variant="primary" icon={<IconTableImport />} onClick={() => setImporting(true)}>시트에서 불러오기</Button>
                <Button icon={<IconPlus />} onClick={() => setAdding(true)}>후보 추가</Button>
              </>
            }
          />
        </Card>
      ) : view === "board" ? (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-3 min-w-max">
            {columns.map((stage) => {
              const list = byStage.get(stage) ?? [];
              return (
                <section key={stage} className={`w-64 shrink-0 ${isSide(stage) ? "opacity-80" : ""}`} aria-label={`${stage} ${list.length}곳`}>
                  <header className="flex items-center justify-between px-1 mb-2">
                    <Chip tone={STAGE_TONE[stage]}>{stage}</Chip>
                    <span className="text-[12px] font-semibold text-gray-500 tabular-nums">{list.length}</span>
                  </header>
                  <div className="space-y-2">
                    {list.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />)}
                    {list.length === 0 && <div className="border border-dashed border-gray-200 rounded-xl py-8 text-center text-[12px] text-gray-400">비어 있음</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card flush>
          <Table minWidth="56rem">
            <thead>
              <tr>
                <Th>매장</Th>
                <Th width="7rem">단계</Th>
                <Th width="5rem">담당</Th>
                <Th width="6rem">의향</Th>
                <Th width="7rem">제안 플랜</Th>
                <Th>다음 액션</Th>
                <Th width="6rem">기한</Th>
                <Th width="7rem" align="right">마지막 접촉</Th>
              </tr>
            </thead>
            <tbody>
              {(showSide ? sortedScoped : sortedScoped.filter((l) => !isSide(l.stage))).map((l) => (
                <tr key={l.id} className={rowClickable} onClick={() => setOpenId(l.id)}>
                  <Td>
                    <span className="font-semibold text-gray-900">{l.name}</span>
                    <span className="block text-[11px] text-gray-400">{[l.district, l.category, l.kind].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td><Chip tone={STAGE_TONE[l.stage]}>{l.stage}</Chip></Td>
                  <Td>{l.owner ?? <span className="text-amber-700">미배정</span>}</Td>
                  <Td>{l.intent ? <Chip tone={INTENT_TONE[l.intent]}>{l.intent}</Chip> : <span className="text-gray-300">-</span>}</Td>
                  <Td>{l.proposed_plan ?? <span className="text-gray-300">-</span>}</Td>
                  <Td className="text-gray-700 truncate max-w-[14rem]">{l.next_action ?? <span className="text-gray-300">-</span>}</Td>
                  <Td className="text-gray-600">{l.due ?? <span className="text-gray-300">-</span>}</Td>
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
          재컨택 · 보류 · 거절도 보기 ({sideCount})
        </label>
        <a href={SALES_SHEET.url(SALES_SHEET.tabs.현황)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-navy">
          원본 시트 열기 <IconExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      <LeadDetailPanel lead={open} actor={actor} onClose={() => setOpenId(null)} onPatch={patch} onConverted={load} />
      {adding && <NewLeadPanel actor={actor} owners={owners} onClose={() => setAdding(false)} onCreated={load} />}
      {importing && <ImportPanel onClose={() => setImporting(false)} onDone={load} />}
    </>
  );
}

/* ═══════════ 카드 ═══════════ */

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const stale = isStale(lead);
  return (
    <button type="button" onClick={onOpen} className={`w-full text-left bg-white rounded-xl border p-3 transition-colors hover:border-gray-400 ${focusRing} ${stale ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-900 leading-snug">{lead.name}</p>
        {stale && <span className="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" title={`${STALE_DAYS}일 이상 기록 없음`} />}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {lead.intent && <Chip tone={INTENT_TONE[lead.intent]}>의향 {lead.intent}</Chip>}
        {lead.grade && <Chip tone={GRADE_TONE[lead.grade]}>{lead.grade}등급{lead.score !== null ? ` ${lead.score}` : ""}</Chip>}
        {lead.proposed_plan && <span className="text-[12px] text-gray-600">{lead.proposed_plan}</span>}
        {lead.district && <span className="text-[12px] text-gray-400">{lead.district}</span>}
      </div>
      {lead.next_action && (
        <p className="mt-2 text-[12px] text-navy font-medium line-clamp-2">
          <IconArrowRight size={12} className="inline -mt-0.5 mr-0.5" aria-hidden="true" />{lead.next_action}
          {lead.due && <span className="text-gray-400 font-normal"> · {lead.due}</span>}
        </p>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className={`text-[12px] ${lead.owner ? "text-gray-600" : "text-amber-700 font-semibold"}`}>{lead.owner ?? "미배정"}</span>
        <span className={`text-[12px] ${stale ? "text-red-600 font-semibold" : "text-gray-400"}`}>{agoLabel(lead.last_touch_at)}</span>
      </div>
    </button>
  );
}

/* ═══════════ 상세 패널 ═══════════
   시트의 열이 전부 여기서 편집된다. 칸에서 나가면(blur) 바로 저장. 저장 버튼 없음. */

function Cell({ label, value, onCommit, placeholder, type, rows, hint }: { label: string; value: string | null; onCommit: (v: string | null) => void; placeholder?: string; type?: string; rows?: number; hint?: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const commit = () => { const n = v.trim(); if (n !== (value ?? "")) onCommit(n || null); };
  return (
    <Field label={label} hint={hint}>
      {rows ? <Textarea rows={rows} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} />
            : <Input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} />}
    </Field>
  );
}

function LeadDetailPanel({ lead, actor, onClose, onPatch, onConverted }: { lead: Lead | null; actor: string; onClose: () => void; onPatch: (id: string, body: Partial<Lead>) => void; onConverted?: () => void }) {
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  useEffect(() => setConvertMsg(null), [lead?.id]);
  if (!lead) return null;

  const idx = LEAD_STAGES.indexOf(lead.stage as (typeof LEAD_STAGES)[number]);
  const side = isSide(lead.stage);
  const set = (k: keyof Lead) => (v: string | null) => onPatch(lead.id, { [k]: v } as Partial<Lead>);

  async function convert() {
    if (converting) return;
    setConverting(true); setConvertMsg(null);
    try {
      const plan = (lead!.proposed_plan ?? "").toLowerCase();
      const tier = plan.includes("boost") ? "BOOST" : plan.includes("content") ? "CONTENT" : plan.includes("무료") || plan.includes("free") ? "FREE" : null;
      const res = await fetch("/api/astro/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: lead!.id, tier, updated_by: actor }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setConvertMsg(d.detail ?? "등록하지 못했습니다."); return; }
      setConvertMsg(d.created ? `매장 #${d.restaurant_id} 를 새로 만들고 이었습니다. 계약 조건은 매장 현황에서 채우세요.` : `이미 있던 매장 #${d.restaurant_id} 에 이었습니다.`);
      onConverted?.();
    } catch { setConvertMsg("서버에 연결하지 못했습니다."); }
    finally { setConverting(false); }
  }

  return (
    <SlideOver
      open
      onClose={onClose}
      title={lead.name}
      subtitle={[lead.kind, lead.district, lead.category, lead.source.startsWith("sheet") ? `시트 ${lead.source.split(":")[1]} 탭에서` : "직접 등록", lead.converted_restaurant_id && `매장 #${lead.converted_restaurant_id}`].filter(Boolean).join(" · ")}
      badge={<Chip tone={STAGE_TONE[lead.stage]}>{lead.stage}</Chip>}
      width="lg"
      footer={
        <>
          {!side && idx >= 0 && idx < LEAD_STAGES.length - 1 && (
            <Button variant="primary" icon={<IconArrowRight />} onClick={() => onPatch(lead.id, { stage: LEAD_STAGES[idx + 1] })}>{LEAD_STAGES[idx + 1]}(으)로</Button>
          )}
          {(lead.stage === "구두 합의" || lead.stage === "계약 완료") && !lead.converted_restaurant_id && (
            <Button icon={<IconBuildingStore />} onClick={convert} disabled={converting}>{converting ? "등록하는 중…" : "제휴 매장으로 등록"}</Button>
          )}
          <Select value={lead.stage} onChange={(e) => onPatch(lead.id, { stage: e.target.value as LeadStage })} aria-label="단계 직접 지정" className="w-32 ml-auto">
            {ALL_LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </>
      }
    >
      {!side && <Stepper steps={[...LEAD_STAGES]} current={Math.max(0, idx)} />}
      {convertMsg && <p className="text-[13px] text-navy bg-navy/5 border border-navy/20 rounded-lg px-3 py-2" role="status">{convertMsg}</p>}

      <PanelSection title="담당 · 진행 (시트 '매장 현황' 열)">
        <div className="grid grid-cols-2 gap-3">
          <Cell label="담당자" value={lead.owner} onCommit={set("owner")} placeholder="이름" />
          <Field label="구분">
            <Select value={lead.kind ?? ""} onChange={(e) => onPatch(lead.id, { kind: (e.target.value || null) as Lead["kind"] })}>
              <option value="">-</option><option>기존 파트너</option><option>신규</option>
            </Select>
          </Field>
          <Field label="유료화 의향">
            <Select value={lead.intent ?? ""} onChange={(e) => onPatch(lead.id, { intent: (e.target.value || null) as LeadIntent | null })}>
              <option value="">미정</option>
              {(["A", "B", "C", "D"] as LeadIntent[]).map((i) => <option key={i} value={i}>{i} · {INTENT_LABEL[i]}</option>)}
            </Select>
          </Field>
          <Cell label="제안 플랜" value={lead.proposed_plan} onCommit={set("proposed_plan")} placeholder="예: Boost 3만" />
          <Cell label="컨택 일시" value={lead.contacted_at} onCommit={set("contacted_at")} placeholder="예: 8/6" />
          <Cell label="미팅 일시" value={lead.meeting_at} onCommit={set("meeting_at")} placeholder="예: 8/6(목) 14시" />
          <Cell label="미팅 참석자" value={lead.attendees} onCommit={set("attendees")} placeholder="예: 준영, 윤지" />
          <Cell label="기한" value={lead.due} onCommit={set("due")} placeholder="예: 9/20" />
        </div>
        <div className="mt-3">
          <Cell label="다음 액션" value={lead.next_action} onCommit={set("next_action")} placeholder="예: 금요일 재방문" hint="카드 앞면에 보입니다." />
        </div>
      </PanelSection>

      <PanelSection title="매장 정보">
        <div className="grid grid-cols-2 gap-3">
          <Cell label="상권" value={lead.district} onCommit={set("district")} placeholder="북문 / 정문 / 쪽문" />
          <Cell label="카테고리" value={lead.category} onCommit={set("category")} placeholder="한식" />
          <Cell label="대표자" value={lead.owner_name} onCommit={set("owner_name")} />
          <Cell label="대표 연락처" value={lead.contact} onCommit={set("contact")} type="tel" />
          <Cell label="매장 전화" value={lead.phone} onCommit={set("phone")} type="tel" />
          <Cell label="인스타" value={lead.insta} onCommit={set("insta")} placeholder="@handle" />
        </div>
        <div className="mt-3">
          <Cell label="링크" value={lead.link} onCommit={set("link")} type="url" placeholder="네이버 플레이스" />
          {lead.link && <a href={lead.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy mt-1">열기 <IconExternalLink size={12} aria-hidden="true" /></a>}
        </div>
      </PanelSection>

      <PanelSection title="실측 · 메모">
        {(lead.grade || lead.score !== null) && <p className="text-[12px] text-gray-500 mb-2">0909 실측 등급 <span className="font-semibold text-gray-800">{lead.grade ?? "-"}</span> · 점수 <span className="font-semibold text-gray-800">{lead.score ?? "-"}</span> · 마지막 접촉 {agoLabel(lead.last_touch_at)}</p>}
        <div className="space-y-3">
          <Cell label="공략 포인트" value={lead.angle} onCommit={set("angle")} rows={2} />
          <Cell label="비고 · 사전조사" value={lead.memo} onCommit={set("memo")} rows={4} />
        </div>
      </PanelSection>

      <PanelSection title="기록"><ActivityLog targetType="lead" targetId={lead.id} actor={actor} /></PanelSection>
    </SlideOver>
  );
}

/* ═══════════ 등록 ═══════════ */

function NewLeadPanel({ actor, owners, onClose, onCreated }: { actor: string; owners: string[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", kind: "신규", district: "", category: "", owner: actor, intent: "", phone: "", link: "", proposed_plan: "", next_action: "", due: "", memo: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/astro/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, intent: form.intent || null }) });
      if (res.ok) { onCreated(); onClose(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail ?? "등록하지 못했습니다."); }
    } catch { setError("서버에 연결하지 못했습니다."); }
    finally { setSaving(false); }
  }

  return (
    <SlideOver open onClose={onClose} title="입점 후보 추가" subtitle="매장명만 있어도 됩니다. 열은 팀 시트와 같습니다."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.name.trim() || saving}>{saving ? "추가하는 중…" : "후보 추가"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <Field label="매장명" required><Input value={form.name} onChange={set("name")} placeholder="예: 경대북문 ○○식당" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="구분"><Select value={form.kind} onChange={set("kind")}><option>신규</option><option>기존 파트너</option></Select></Field>
        <Field label="담당자"><Input value={form.owner} onChange={set("owner")} list="lead-owners" /><datalist id="lead-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist></Field>
        <Field label="상권"><Input value={form.district} onChange={set("district")} placeholder="예: 북문" /></Field>
        <Field label="카테고리"><Input value={form.category} onChange={set("category")} placeholder="예: 한식" /></Field>
        <Field label="유료화 의향"><Select value={form.intent} onChange={set("intent")}><option value="">미정</option>{(["A", "B", "C", "D"] as LeadIntent[]).map((i) => <option key={i} value={i}>{i} · {INTENT_LABEL[i]}</option>)}</Select></Field>
        <Field label="제안 플랜"><Input value={form.proposed_plan} onChange={set("proposed_plan")} placeholder="예: Boost 3만" /></Field>
        <Field label="매장 전화"><Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" /></Field>
        <Field label="링크"><Input value={form.link} onChange={set("link")} type="url" inputMode="url" placeholder="네이버 플레이스" /></Field>
        <Field label="다음 액션"><Input value={form.next_action} onChange={set("next_action")} placeholder="예: 금요일 재방문" /></Field>
        <Field label="기한"><Input value={form.due} onChange={set("due")} placeholder="예: 9/20" /></Field>
      </div>
      <Field label="메모"><Textarea rows={3} value={form.memo} onChange={set("memo")} placeholder="첫 인상, 사장님 성향, 경쟁사 사용 여부" /></Field>
    </SlideOver>
  );
}

/* ═══════════ 시트에서 불러오기 ═══════════
   붙여넣기가 아니라 시트를 직접 읽는다. 공개 CSV export 가 열려 있어 인증 없이 된다.
   같은 매장은 덮어쓰지 않고 시트 값이 있는 칸만 채운다. 툴에서 찍은 입금 확인은 시트가 못 지운다. */

type Tab = "현황" | "신규" | "후보" | "계약";
const TAB_DESC: Record<Tab, string> = {
  현황: "매장 현황 탭 (33곳). 기존 파트너 위주. 대표자·연락처는 매장 운영 필드에도 들어갑니다.",
  신규: "신규 컨택 탭 (24곳). 담당자·단계·미팅 일시가 있습니다.",
  후보: "후보 실측 탭 (61곳, 0909 영남대). 등급·점수·공략 포인트가 있습니다.",
  계약: "계약 세부사항 탭 (39곳). 플랜·월 이용료·납부·계산서 발송·혜택·홍보물·PIN 을 매장 운영 필드에 채웁니다.",
};

function ImportPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<Tab>("신규");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null); setResult(null); setError(null);
    fetch(`/api/astro/import?tab=${tab}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.detail); setPreview(d); })
      .catch((e) => setError(e.message ?? "시트를 읽지 못했습니다."));
  }, [tab]);

  async function run() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/astro/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tab }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail);
      setResult(
        tab === "계약" || tab === "현황"
          ? `${d.applied}곳의 운영 필드를 채웠습니다.${d.unmatched?.length ? ` 매장을 못 찾은 ${d.unmatched.length}곳: ${d.unmatched.join(", ")}` : ""}`
          : `${d.created}곳 추가, ${d.updated}곳 갱신했습니다.`
      );
      onDone();
    } catch (e) { setError((e as Error).message ?? "불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  const n = (k: string) => (preview?.[k] as number | undefined) ?? 0;

  return (
    <SlideOver open onClose={onClose} title="시트에서 불러오기" subtitle="팀 세일즈 시트를 직접 읽습니다. 시트는 건드리지 않습니다." width="lg"
      footer={<><Button variant="primary" onClick={run} disabled={!preview || busy}>{busy ? "불러오는 중…" : `${tab} 탭 불러오기`}</Button><Button variant="ghost" onClick={onClose}>{result ? "닫기" : "취소"}</Button>{result && <span className="text-[12px] text-emerald-700 ml-auto" aria-live="polite">{result}</span>}</>}>
      <FilterPills label="탭" value={tab} onChange={setTab} options={(["신규", "후보", "현황", "계약"] as Tab[]).map((t) => ({ key: t, label: t }))} />
      <p className="text-[13px] text-gray-600">{TAB_DESC[tab]}</p>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[13px] text-red-700" role="alert">{error}</div>
      ) : !preview ? (
        <Skeleton rows={3} cols={2} />
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          <Kpi label="시트 행" value={n("rows")} />
          {tab === "계약" || tab === "현황" ? (
            <>
              <Kpi label="매장 매칭" value={n("matched")} tone="good" hint="이름이 맞은 곳" />
              <Kpi label="못 찾음" value={(preview.unmatched as string[] | undefined)?.length ?? 0} tone="alert" hint="이름이 다른 곳" />
            </>
          ) : (
            <>
              <Kpi label="새로 추가" value={n("new")} tone="good" />
              <Kpi label="이미 있음 · 갱신" value={n("update")} hint="빈 칸만 채움" />
            </>
          )}
        </div>
      )}

      {preview && Array.isArray(preview.unmatched) && (preview.unmatched as string[]).length > 0 && (
        <PanelSection title="이름이 안 맞는 매장">
          <p className="text-[12px] text-gray-500 mb-2">시트와 대시보드의 표기가 달라 자동으로 못 이었습니다. 시트 쪽 이름을 대시보드와 맞추면 다음 불러오기에 잡힙니다.</p>
          <ul className="flex flex-wrap gap-1.5">{(preview.unmatched as string[]).map((nme) => <li key={nme} className="text-[12px] bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">{nme}</li>)}</ul>
        </PanelSection>
      )}

      <a href={preview?.sheet_url as string | undefined ?? SALES_SHEET.url(0)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy font-medium">
        시트에서 이 탭 열기 <IconExternalLink size={12} aria-hidden="true" />
      </a>
    </SlideOver>
  );
}
