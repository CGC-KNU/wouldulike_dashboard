"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCopy, IconExternalLink, IconPlus, IconRefresh, IconSearch } from "@tabler/icons-react";
import { APP_CATEGORIES } from "@/lib/draft/types";
import { looseToISO } from "@/lib/draft/dates";
import {
  ALL_SPOT_STAGES, SPOT_PRODUCTS, SPOT_SIDE_STAGES, SPOT_STAGES,
  productOf, spotAmount, type SpotJob, type SpotStage,
} from "@/lib/draft/spot";
import {
  Button, Card, Chip, DraftBadge, Empty, Field, Input, Kpi, Notice, PageHeader,
  PanelSection, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, agoLabel, focusRing, rowClickable, todayLocal, type ChipTone,
} from "../_shared/ui";

/**
 * Astro · 스팟 제작 — 제휴와 별개로 파는 콘텐츠 제작 건 (민열님 0914).
 *
 * ## 왜 따로 있나
 *
 * 파트너 매장은 **월 구독**이고 스팟은 **한 편씩** 파는 것이다.
 * 서서맥주·후추처럼 제휴를 안 해도 사 가는 곳이 있어서, 후보·매장 파이프라인에 얹으면
 * 영업 숫자에 제작 건이 섞인다. 담당도 다르다 — 스팟은 윤지님이 맡는다.
 *
 * ## 흐름이 영업과 다르다
 *
 * 계약이 끝이 아니다. 계약 뒤에 **촬영 · 편집 · 납품**이 붙고 돈은 납품 뒤에 들어온다.
 *   컨택 → 미팅 → 기획안 → 계약 → 촬영 → 편집 → 납품 → 정산
 *
 * ## 기획안
 *
 * 미팅에 들고 갈 5장짜리 기획안은 윤지님 교안의 파이프라인이 만든다.
 * 그 첫 단계인 **카카오맵 리서치**만 여기서 대신 해 준다 — 주소나 상호를 넣으면
 * 메뉴·가격·영업시간·리뷰·태그를 긁어 오고, 교안의 프롬프트에 채워 복사까지 해 준다.
 * **기획안 문장을 여기서 쓰지는 않는다.** 소구점을 고르는 건 판단이라 사람이 한다.
 */

const STAGE_TONE: Record<string, ChipTone> = {
  컨택: "gray", 미팅: "blue", 기획안: "blue", 계약: "navy",
  촬영: "amber", 편집: "amber", 납품: "green", 정산: "green",
  보류: "gray", 거절: "red",
};
const won = (n: number | null) => (n === null ? "-" : `${n.toLocaleString()}원`);

export default function SpotBoard({ actor }: { actor: string }) {
  const [spots, setSpots] = useState<SpotJob[] | null>(null);
  const [draft, setDraft] = useState(false);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/astro/spots")
      .then((r) => r.json())
      .then((d) => { setSpots(d?.spots ?? []); setDraft(Boolean(d?.draft)); })
      .catch(() => setSpots([]));
  }, []);
  useEffect(load, [load]);
  // 일정 탭에서 넘어올 때 그 건을 바로 연다 (astro-spots?open=<id>)
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);

  const loading = spots === null;
  const all = spots ?? [];
  const visible = useMemo(() => {
    const s = q.trim();
    return all.filter((x) => !s || x.name.includes(s));
  }, [all, q]);

  /** 진행 중 = 보류·거절이 아닌 것. 돈은 납품 뒤에 들어오므로 '받을 돈'과 '받은 돈'을 갈라 센다. */
  const live = all.filter((s) => !SPOT_SIDE_STAGES.includes(s.stage as (typeof SPOT_SIDE_STAGES)[number]));
  const contracted = live.filter((s) => ["계약", "촬영", "편집", "납품", "정산"].includes(s.stage));
  const unpaid = contracted.filter((s) => !s.paid_at);
  const sum = (list: SpotJob[]) => list.reduce((a, s) => a + (spotAmount(s) ?? 0), 0);

  async function patch(id: string, body: Partial<SpotJob>) {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch(`/api/astro/spots/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setMsg((await res.json().catch(() => ({}))).detail ?? "저장하지 못했습니다."); return; }
      load();
    } finally { setBusy(null); }
  }

  const open = all.find((s) => s.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="스팟 제작"
        description="제휴와 별개로 한 편씩 파는 제작 건. 계약이 끝이 아니라 촬영·편집·납품이 뒤에 붙습니다."
        actions={
          <>
            {draft && <DraftBadge note="백엔드에 스팟 테이블이 아직 없어 임시 저장소를 씁니다." />}
            <Button icon={<IconSearch />} onClick={() => setPlanning(true)}>기획안 리서치</Button>
            <Button icon={<IconRefresh />} onClick={load}>다시 읽기</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>건 추가</Button>
          </>
        }
      >
        {/* 캠퍼스 구분 없음 (민열님 0914). 스팟 제작은 제휴 영업과 달리 상권으로 나뉘지 않는다 —
            윤지님이 전 상권을 혼자 맡고, 한 건은 캠퍼스가 아니라 **매장**에 붙는다. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52 ml-auto">
            <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="매장명" className="pl-7" aria-label="매장명으로 찾기" />
          </div>
        </div>
      </PageHeader>

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="진행 중" value={loading ? "-" : live.length} hint="보류·거절 뺀 것" />
        <Kpi label="계약 이후" value={loading ? "-" : contracted.length} hint="촬영·편집·납품·정산" />
        <Kpi label="받을 돈" value={loading ? "-" : won(sum(unpaid))} tone={unpaid.length ? "alert" : "plain"} hint={`아직 ${unpaid.length}건`} />
        <Kpi label="받은 돈" value={loading ? "-" : won(sum(contracted.filter((s) => s.paid_at)))} hint="정산 완료" />
      </div>

      {msg && <div className="mb-4"><Notice tone="red" title={msg} /></div>}

      {/* 상품과 정가 — 견적 대화의 출발점이라 화면에 늘 띄워 둔다 */}
      <Card flush title="상품과 정가" description="건마다 다르게 받을 수 있습니다. 여기 값은 부르는 값입니다." className="mb-4">
        <Table minWidth="30rem">
          <thead><tr><Th>상품</Th><Th width="7rem">촬영</Th><Th width="8rem" align="right">정가</Th><Th width="5rem" align="right">진행 중</Th></tr></thead>
          <tbody>
            {SPOT_PRODUCTS.map((p) => (
              <tr key={p.key}>
                <Td><span className="font-semibold text-gray-900">{p.label}</span></Td>
                <Td>{p.shoot ? <Chip tone="amber">촬영 포함</Chip> : <span className="text-gray-400">촬영 없이</span>}</Td>
                <Td align="right" numeric className="font-semibold text-gray-900">{p.price.toLocaleString()}원</Td>
                <Td align="right" numeric className="text-gray-500">{loading ? "-" : live.filter((s) => s.product === p.key).length}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card flush title={`제작 건 ${visible.length}곳`} description="줄을 누르면 상세가 열립니다. 단계는 표에서 바로 바꿉니다.">
        {loading ? (
          <Skeleton rows={5} cols={5} />
        ) : visible.length === 0 ? (
          <div className="px-5 py-6">
            <Empty
              title={all.length === 0 ? "아직 등록된 제작 건이 없습니다" : "이 조건에 맞는 건이 없습니다"}
              detail={all.length === 0 ? "서서맥주·후추처럼 제휴 없이 제작만 사 가는 곳을 여기에 세웁니다." : undefined}
              action={all.length === 0 ? <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>건 추가</Button> : undefined}
            />
          </div>
        ) : (
          <Table minWidth="62rem">
            <thead>
              <tr>
                <Th>매장</Th>
                <Th width="10rem">상품</Th>
                <Th width="8rem" align="right">금액</Th>
                <Th width="9rem">단계</Th>
                <Th width="9rem">다음 일정</Th>
                <Th width="7.5rem">기획안</Th>
                <Th width="6rem" align="right">마지막</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const p = productOf(s.product);
                const amount = spotAmount(s);
                // 단계에 따라 지금 중요한 날짜가 다르다 — 계약 전엔 미팅, 계약 뒤엔 촬영, 그 뒤엔 납품 기한.
                const next = s.stage === "촬영" || s.stage === "계약" ? s.shoot_at : s.stage === "미팅" ? s.meeting_at : s.due;
                const nextLabel = s.stage === "촬영" || s.stage === "계약" ? "촬영" : s.stage === "미팅" ? "미팅" : "기한";
                return (
                  <tr key={s.id} className={rowClickable} onClick={() => setOpenId(s.id)}>
                    <Td>
                      <span className="font-semibold text-gray-900 inline-flex items-center gap-1.5">
                        {s.name}
                      </span>
                      <span className="block text-[11px] text-gray-400">{[s.owner ? `담당 ${s.owner}` : null, s.category, s.next_action].filter(Boolean).join(" · ") || "—"}</span>
                    </Td>
                    <Td>
                      <span onClick={(e) => e.stopPropagation()}>
                        <Select aria-label={`${s.name} 상품`} value={s.product ?? ""} disabled={busy === s.id}
                          onChange={(e) => patch(s.id, { product: (e.target.value || null) as SpotJob["product"] })}
                          className="h-8 text-[12px] w-[9rem]">
                          <option value="">미정</option>
                          {SPOT_PRODUCTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </Select>
                      </span>
                    </Td>
                    <Td align="right" numeric className={s.price ? "font-semibold text-gray-900" : "text-gray-500"}>
                      {won(amount)}
                      {!s.price && p && <span className="block text-[11px] text-gray-400">정가</span>}
                    </Td>
                    <Td>
                      <span onClick={(e) => e.stopPropagation()}>
                        <Select aria-label={`${s.name} 단계`} value={s.stage} disabled={busy === s.id}
                          onChange={(e) => patch(s.id, { stage: e.target.value as SpotStage })}
                          className="h-8 text-[12px] w-[8rem]">
                          {ALL_SPOT_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </Select>
                      </span>
                    </Td>
                    <Td className="text-[12px] text-gray-600">
                      {next ? <><span className="text-gray-400">{nextLabel}</span> {next}</> : <span className="text-gray-300">-</span>}
                    </Td>
                    {/* 기획안은 '링크가 있나'가 아니라 **보냈나**가 중요하다 — 만들어 두고 못 보낸 건이 막힌 자리다 */}
                    <Td>
                      <span onClick={(e) => e.stopPropagation()}>
                        {s.plan_sent_at ? (
                          <Chip tone="blue">{s.plan_sent_at.slice(5).replace("-", "/")} 발송</Chip>
                        ) : (
                          <button type="button" disabled={busy === s.id}
                            onClick={() => patch(s.id, { plan_sent_at: todayLocal(), ...(s.stage === "컨택" || s.stage === "미팅" ? { stage: "기획안" as SpotStage } : {}) })}
                            className={`h-7 px-2 rounded-lg text-[12px] font-semibold text-gray-600 bg-black/[0.05] hover:bg-black/[0.08] disabled:opacity-50 ${focusRing}`}>
                            오늘 보냄
                          </button>
                        )}
                      </span>
                    </Td>
                    <Td align="right" className="text-[12px] text-gray-500">{agoLabel(s.last_touch_at ?? s.updated_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        금액은 <span className="font-semibold text-gray-700">적어 둔 값</span>이 있으면 그것, 없으면 정가로 셉니다.
        받을 돈은 계약 이후 단계 중 정산이 안 된 건의 합입니다.
      </p>

      {open && <SpotPanel spot={open} actor={actor} onClose={() => setOpenId(null)} onPatch={patch} onDeleted={() => { setOpenId(null); load(); }} />}
      {adding && <NewSpotPanel actor={actor} onClose={() => setAdding(false)} onCreated={load} />}
      {planning && <ResearchPanel onClose={() => setPlanning(false)} />}
    </>
  );
}

/* ═══════════ 상세 ═══════════ */

function Cell({ label, value, onCommit, placeholder, type, hint }: { label: string; value: string | null; onCommit: (v: string | null) => void; placeholder?: string; type?: string; hint?: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <Field label={label} hint={hint}>
      <Input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = v.trim(); if (n !== (value ?? "")) onCommit(n || null); }} placeholder={placeholder} />
    </Field>
  );
}

/**
 * 미팅·촬영은 **날짜와 시각**을 같이 적는다. 그런데 원본은 "8/6(목) 14시" 같은 자유 서식이라
 * 통째로 날짜 칸으로 바꿔 버리면 시트에서 넘어온 값이 날아간다. 그래서 둘로 나눠 받고
 * `"2026-09-20 14시"` 로 합쳐 저장한다 — 달력이 읽는 형식이면서 시각 메모도 남는다.
 */
function WhenCell({ label, value, onCommit, hint }: { label: string; value: string | null; onCommit: (v: string | null) => void; hint?: string }) {
  const iso = looseToISO(value);
  // 앞머리의 날짜를 떼면 나머지가 시각 메모다. "8/6(목) 14시" · "2026-09-20 14:00" 둘 다 문다.
  const rest = (value ?? "").replace(/^\s*(\d{4}[-./])?\d{1,2}[-./]\d{1,2}(\([^)]*\))?\s*/, "").trim();
  const [t, setT] = useState(rest);
  useEffect(() => setT(rest), [rest]);
  const put = (d: string | null, time: string) => {
    const v = [d, time.trim()].filter(Boolean).join(" ").trim();
    if (v !== (value ?? "")) onCommit(v || null);
  };
  return (
    <Field label={label} hint={hint ?? (value && !iso ? `지금 값: ${value} (날짜로 못 읽어 달력에 안 뜹니다)` : undefined)}>
      <div className="flex gap-1.5">
        <Input type="date" value={iso ?? ""} onChange={(e) => put(e.target.value || null, t)} className="flex-1" aria-label={`${label} 날짜`} />
        <Input value={t} onChange={(e) => setT(e.target.value)} onBlur={() => put(iso, t)} placeholder="14시" className="w-[5.5rem]" aria-label={`${label} 시각`} />
      </div>
    </Field>
  );
}

function SpotPanel({ spot, actor, onClose, onPatch, onDeleted }: {
  spot: SpotJob; actor: string; onClose: () => void;
  onPatch: (id: string, body: Partial<SpotJob>) => void; onDeleted: () => void;
}) {
  const set = (k: keyof SpotJob) => (v: string | null) => onPatch(spot.id, { [k]: v } as Partial<SpotJob>);
  const p = productOf(spot.product);
  const amount = spotAmount(spot);
  const [removing, setRemoving] = useState(false);

  return (
    <SlideOver open onClose={onClose} title={spot.name} subtitle={`${p?.label ?? "상품 미정"}${amount ? ` · ${amount.toLocaleString()}원` : ""}`}
      badge={<Chip tone={STAGE_TONE[spot.stage] ?? "gray"}>{spot.stage}</Chip>}
      footer={<><Button variant="ghost" onClick={onClose}>닫기</Button>
        <span className="ml-auto">
          {removing ? (
            <span className="inline-flex items-center gap-2">
              <Button size="sm" variant="danger" onClick={async () => { await fetch(`/api/astro/spots/${spot.id}`, { method: "DELETE" }); onDeleted(); }}>네, 지웁니다</Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(false)}>취소</Button>
            </span>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setRemoving(true)}>이 건 지우기</Button>
          )}
        </span></>}>

      <div className="grid grid-cols-2 gap-3">
        <Field label="단계">
          <Select value={spot.stage} onChange={(e) => onPatch(spot.id, { stage: e.target.value as SpotStage })}>
            {SPOT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            <optgroup label="곁가지">{SPOT_SIDE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="상품">
          <Select value={spot.product ?? ""} onChange={(e) => onPatch(spot.id, { product: (e.target.value || null) as SpotJob["product"] })}>
            <option value="">미정</option>
            {SPOT_PRODUCTS.map((x) => <option key={x.key} value={x.key}>{x.label} · {x.price.toLocaleString()}원</option>)}
          </Select>
        </Field>
        <Cell label="금액" value={spot.price === null ? "" : String(spot.price)} type="number"
          hint={p ? `비워 두면 정가 ${p.price.toLocaleString()}원으로 셉니다.` : "상품을 고르면 정가가 붙습니다."}
          onCommit={(v) => onPatch(spot.id, { price: v ? Number(v.replace(/[^\d]/g, "")) || null : null })} />
        <Cell label="담당" value={spot.owner} onCommit={set("owner")} placeholder={actor} />
        <Field label="카테고리">
          <Select value={spot.category ?? ""} onChange={(e) => onPatch(spot.id, { category: e.target.value || null })}>
            <option value="">미정</option>{APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>

      {/* 일정 — 적으면 **일정 탭 달력에 바로 뜬다** (민열님 0914).
          날짜를 못 읽는 값은 조용히 빠진다. 지어내지 않는다. */}
      <PanelSection title="일정 (적으면 일정 탭 달력에 바로 뜹니다)">
        <div className="grid grid-cols-2 gap-3">
          <WhenCell label="미팅" value={spot.meeting_at} onCommit={set("meeting_at")} />
          <WhenCell label="촬영" value={spot.shoot_at} onCommit={set("shoot_at")} />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Field label="기획안 보낸 날" hint="보냈는지가 링크보다 먼저입니다.">
            <div className="flex gap-1.5">
              <Input type="date" value={spot.plan_sent_at ?? ""} onChange={(e) => onPatch(spot.id, { plan_sent_at: e.target.value || null })} className="flex-1" />
              {!spot.plan_sent_at && (
                <Button size="sm" onClick={() => onPatch(spot.id, { plan_sent_at: todayLocal(), ...(spot.stage === "컨택" || spot.stage === "미팅" ? { stage: "기획안" as SpotStage } : {}) })}>오늘</Button>
              )}
            </div>
          </Field>
          <Cell label="기획안 링크" value={spot.plan_url} onCommit={set("plan_url")} placeholder="드라이브 PDF" />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Cell label="납품 기한" value={spot.due} onCommit={set("due")} type="date" />
          <Cell label="납품한 날" value={spot.delivered_at} onCommit={set("delivered_at")} type="date" />
          <Cell label="입금된 날" value={spot.paid_at} onCommit={set("paid_at")} type="date" hint="적으면 '받을 돈'에서 빠집니다." />
        </div>
      </PanelSection>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Cell label="대표자" value={spot.owner_name} onCommit={set("owner_name")} />
        <Cell label="연락처" value={spot.contact} onCommit={set("contact")} />
        <Cell label="인스타" value={spot.insta} onCommit={set("insta")} placeholder="@handle" />
        <Cell label="지도 링크" value={spot.map_url} onCommit={set("map_url")} placeholder="카카오맵" />
      </div>

      <Cell label="다음 할 일" value={spot.next_action} onCommit={set("next_action")} placeholder="예: 촬영 콘티 확인" hint="표 앞면에 보입니다." />
      <Field label="메모"><Textarea rows={4} defaultValue={spot.memo ?? ""} onBlur={(e) => onPatch(spot.id, { memo: e.target.value.trim() || null })} /></Field>
    </SlideOver>
  );
}

/* ═══════════ 새 건 ═══════════ */

function NewSpotPanel({ actor, onClose, onCreated }: { actor: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", category: "", product: "", owner: actor, contact: "", insta: "", map_url: "", memo: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/astro/spots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, product: form.product || null, category: form.category || null }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).detail ?? "만들지 못했습니다."); return; }
      onCreated(); onClose();
    } catch { setError("서버에 연결하지 못했습니다."); } finally { setSaving(false); }
  }

  return (
    <SlideOver open onClose={onClose} title="스팟 제작 건 추가" subtitle="제휴가 아니어도 됩니다. 매장명만 있어도 만들 수 있습니다."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.name.trim() || saving}>{saving ? "만드는 중…" : "건 추가"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <Field label="매장명" required><Input value={form.name} onChange={set("name")} placeholder="예: 서서맥주" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="상품" hint="나중에 정해도 됩니다.">
          <Select value={form.product} onChange={set("product")}>
            <option value="">미정</option>{SPOT_PRODUCTS.map((x) => <option key={x.key} value={x.key}>{x.label} · {x.price.toLocaleString()}원</option>)}
          </Select>
        </Field>
        <Field label="카테고리"><Select value={form.category} onChange={set("category")}><option value="">미정</option>{APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="담당"><Input value={form.owner} onChange={set("owner")} /></Field>
        <Field label="연락처"><Input value={form.contact} onChange={set("contact")} type="tel" inputMode="tel" /></Field>
        <Field label="인스타"><Input value={form.insta} onChange={set("insta")} placeholder="@handle" /></Field>
      </div>
      <Field label="지도 링크" hint="기획안 리서치에 씁니다."><Input value={form.map_url} onChange={set("map_url")} placeholder="카카오맵 링크" /></Field>
      <Field label="메모"><Textarea rows={3} value={form.memo} onChange={set("memo")} /></Field>
    </SlideOver>
  );
}

/* ═══════════ 기획안 리서치 ═══════════ */

interface Research {
  matched?: string | null; category?: string | null; address?: string | null;
  rating?: number | null; review_count?: number | null; hours?: string;
  strength?: string[]; tags?: string[]; menus?: string[]; reviews?: string[]; blogs?: string[];
  roadview?: string | null; detail?: string;
}

/**
 * 기획안을 쓰기 전 단계 — 카카오맵에서 **실물**을 모은다.
 *
 * 교안 철칙 1번이 "실측·실물만 쓴다"이다. 메뉴·가격·영업시간은 카카오맵에 있는 것만 쓴다.
 * 그러려면 리서치가 먼저 손에 있어야 하는데 지금까지는 터미널을 열어야 했다.
 *
 * 여기서 기획안 문장을 쓰지는 않는다 — 소구점을 고르는 건 판단이다.
 * 대신 교안의 프롬프트에 리서치를 채워 복사까지 해 준다. 붙여넣으면 바로 시작한다.
 */
function ResearchPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [data, setData] = useState<Research | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!q.trim() || busy) return;
    setBusy(true); setErr(null); setData(null);
    try {
      const res = await fetch(`/api/astro/research?q=${encodeURIComponent(q.trim())}`);
      const j = (await res.json()) as Research;
      if (!res.ok) { setErr(j.detail ?? "리서치에 실패했습니다."); return; }
      setData(j);
    } catch { setErr("서버에 연결하지 못했습니다."); } finally { setBusy(false); }
  }

  const prompt = useMemo(() => {
    if (!data) return "";
    const name = data.matched || q.trim();
    const lines = [
      `Desktop/CGC/99_아카이브/페이즈_5_미팅/컨텐츠_기획안_검증본 폴더의 파이프라인으로`,
      `"${name}" 큐레이션 콘텐츠 기획안을 만들어줘.`,
      ``,
      `1. _research.py 로 카카오맵 리서치부터 하고`,
      `2. 기존 _stores.py 의 다른 매장을 참고해 이 매장 dict 를 새로 쓰되,`,
      `   소구점은 리서치에서 실제로 확인된 것만 써줘`,
      `3. 사진은 에셋/_원본사진/store_${name.replace(/\s/g, "")}.jpg 로 넣고 _preblur.sh 처리`,
      `4. _build.py 로 생성한 뒤 _verify.py, _triage.py, _korean.py, _editorial.py 다 돌려서`,
      `   지적 0건 될 때까지 고쳐줘`,
      `5. 끝나면 PDF 경로 알려줘`,
      ``,
      `── 툴이 먼저 긁어 온 카카오맵 실측 (2026 기준) ──`,
      `상호: ${name}${data.category ? ` · ${data.category}` : ""}`,
      data.address ? `주소: ${data.address}` : "",
      data.hours ? `영업시간: ${data.hours}` : "",
      data.rating ? `별점 ${data.rating} (리뷰 ${data.review_count ?? "?"})` : "",
      data.strength?.length ? `강점 태그: ${data.strength.join(" · ")}` : "",
      data.tags?.length ? `분위기 태그: ${data.tags.join(" · ")}` : "",
      data.menus?.length ? `메뉴·가격:\n${data.menus.map((m) => `  - ${m}`).join("\n")}` : "",
      data.reviews?.length ? `리뷰(원문 그대로, 변형 금지):\n${data.reviews.map((r) => `  - ${r}`).join("\n")}` : "",
      data.blogs?.length ? `블로그 제목: ${data.blogs.join(" / ")}` : "",
      ``,
      `매장 특이사항: ${note.trim() || "(없음)"}`,
    ];
    return lines.filter((l) => l !== "").join("\n");
  }, [data, q, note]);

  return (
    <SlideOver open onClose={onClose} width="lg" title="기획안 리서치" subtitle="카카오맵에서 실물을 모아 클로드에게 줄 프롬프트까지 만듭니다."
      footer={<>
        <Button variant="primary" icon={<IconCopy />} disabled={!prompt}
          onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* 무시 */ } }}>
          {copied ? "복사했습니다" : "프롬프트 복사"}
        </Button>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
      </>}>

      <Field label="매장명 또는 카카오맵 링크" required hint="지점명까지 넣으면 잘 찾습니다. 못 찾으면 카카오맵 링크를 그대로 붙여 보세요.">
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 서서맥주 경북대 · https://place.map.kakao.com/…" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
          <Button onClick={run} disabled={!q.trim() || busy}>{busy ? "읽는 중…" : "리서치"}</Button>
        </div>
      </Field>

      {err && <Notice tone="amber" title={err} />}

      {data && (
        <>
          <Notice tone="blue" title={`${data.matched ?? q} — 카카오맵에서 읽었습니다`}>
            {[data.category, data.address, data.hours && `영업 ${data.hours}`, data.rating && `별점 ${data.rating}`].filter(Boolean).join(" · ")}
          </Notice>

          {data.menus?.length ? (
            <Field label={`메뉴 ${data.menus.length}개`}>
              <ul className="text-[13px] text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                {data.menus.map((m, i) => <li key={i}>· {m}</li>)}
              </ul>
            </Field>
          ) : null}

          {(data.strength?.length || data.tags?.length) ? (
            <Field label="태그">
              <div className="flex flex-wrap gap-1.5">
                {[...(data.strength ?? []), ...(data.tags ?? [])].map((t, i) => <Chip key={i} tone={i < (data.strength?.length ?? 0) ? "navy" : "gray"}>{t}</Chip>)}
              </div>
            </Field>
          ) : null}

          {data.reviews?.length ? (
            <Field label={`리뷰 ${data.reviews.length}개`} hint="기획안에 인용할 때는 원문 그대로 씁니다 — 다듬으면 검증에서 걸립니다.">
              <ul className="text-[12px] text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                {data.reviews.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Field>
          ) : null}

          <Field label="매장 특이사항" hint="사장님 성향, 우리가 이미 아는 강점, 계약 맥락 — 프롬프트에 같이 들어갑니다.">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <Field label="클로드에게 줄 프롬프트" hint="복사해서 클로드 코드에 붙여넣으면 기획안 제작이 시작됩니다.">
            <Textarea rows={10} value={prompt} readOnly className="font-mono text-[11px]" />
          </Field>

          {data.roadview && (
            <a href={data.roadview} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-navy">
              로드뷰 열기 <IconExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </>
      )}

      <p className="text-[12px] text-gray-500 leading-relaxed pt-1">
        여기서 <span className="font-semibold text-gray-700">기획안 문장을 쓰지는 않습니다.</span> 소구점과 큐레이션 주제를 고르는 건 판단이라 사람이 씁니다.
        PDF 생성과 검증 4종도 파이썬 파이프라인이 맡습니다 — 이 화면은 그 앞의 리서치를 대신할 뿐입니다.
      </p>
    </SlideOver>
  );
}
