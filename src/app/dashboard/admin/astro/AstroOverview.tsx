"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDownload, IconPlus, IconSearch } from "@tabler/icons-react";
import { APP_CATEGORIES, CAMPUSES, TAX_STATUS_LABEL, emptyStoreOps, isPaidTier, type Campus, type StoreOps, type StoreRow, type TaxInvoice } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Kpi, PageHeader, Segmented, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, agoLabel, periodLocal, rowClickable, type ChipTone } from "../_shared/ui";
import StoreDetailPanel from "./StoreDetailPanel";
import CampusPicker, { allCampuses } from "./CampusPicker";
import CampusMark from "./CampusMark";
import { defaultMonthlyFee, feeHint } from "@/lib/draft/pricing";

/**
 * Astro · 매장 현황.
 *
 * 0911 정리(민열님): 후보와 같은 축 — **캠퍼스 → 상권**. 사람별 구분 없음. 매장(식당)도 여기서 바로 추가.
 * '입금' 열은 매장에 하나 붙은 상태값이 아니라 **이번 달 청구(세금계산서 건)** 를 본다.
 * 입금 현황 화면과 같은 데이터라 두 화면이 다른 말을 하지 않는다. 일시납 매장만 예전 방식(매장 상태값)으로 본다.
 *
 * 설계 원칙은 그대로 — 자동 판정하지 않는다. 학기/방학도 입금도 사람이 확인해서 넣는다(2026-08-12 합의).
 */

type Filter = "all" | "paid" | "unpaid" | "kit" | "season";
type SortKey = "name" | "tier" | "billing" | "updated";

const PLAN_TONE: Record<string, ChipTone> = { BOOST: "amber", CONTENT: "navy", FREE: "gray" };
const thisPeriod = () => periodLocal();

function season(o: StoreOps | null): { text: string; tone: ChipTone } {
  if (!o || (o.semester_active === null && o.vacation_active === null)) return { text: "미정", tone: "amber" };
  if (o.semester_active && o.vacation_active) return { text: "학기+방학", tone: "blue" };
  if (o.semester_active) return { text: "학기만", tone: "gray" };
  if (o.vacation_active) return { text: "방학만", tone: "gray" };
  return { text: "둘 다 쉼", tone: "gray" };
}

/** 이번 달 입금 상태 — 월납은 이번 달 계산서 건, 일시납은 매장 상태값. */
type Pay = { key: "paid" | "issued" | "pending" | "none" | "lump_paid" | "lump_open" | "exempt" | "free"; label: string; tone: ChipTone; stuck: boolean };
function payOf(r: StoreRow, inv: TaxInvoice | undefined): Pay {
  if (!isPaidTier(r.tier)) return { key: "free", label: "무료", tone: "gray", stuck: false };
  const o = r.ops;
  if (o?.billing === "EXEMPT") return { key: "exempt", label: "면제", tone: "gray", stuck: false };
  if (o?.pay_cycle === "LUMP") return o.billing === "PAID" ? { key: "lump_paid", label: "일시납 완료", tone: "green", stuck: false } : { key: "lump_open", label: "일시납 대기", tone: "red", stuck: true };
  if (!inv) return { key: "none", label: "청구 안 됨", tone: "red", stuck: true };
  if (inv.paid_at) return { key: "paid", label: "입금 확인", tone: "green", stuck: false };
  if (inv.status === "ISSUED") return { key: "issued", label: "발행 · 대기", tone: "blue", stuck: true };
  return { key: "pending", label: TAX_STATUS_LABEL[inv.status], tone: "amber", stuck: true };
}
const campusOf = (r: StoreRow): Campus => r.ops?.campus ?? "경북대";

/** 탭을 오갈 때 흰 화면을 안 보이게 하는 마지막 값. 새로고침하면 비워진다. */
const cachedStores: { rows: StoreRow[]; invoices: TaxInvoice[] } = { rows: [], invoices: [] };

export default function AstroOverview({ actor, onGo }: { actor: string; onGo?: (tab: string) => void }) {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [campus, setCampus] = useState<Campus | "all">("경북대");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "billing", dir: "asc" });
  const [openId, setOpenId] = useState<number | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림에서 바로 이 항목을 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(Number(o)); } catch { /* 무시 */ } }, []);
  const [adding, setAdding] = useState(false);
  const period = thisPeriod();

  /**
   * 표를 먼저 그린다 — 매장이 오면 바로, 계산서는 오는 대로 입금 열만 채운다 (민열님 0913: 불러오는 게 느리다).
   * 둘을 같이 기다리면 둘 중 느린 쪽만큼 흰 화면을 본다. 화면을 옮겼다 돌아오면 **직전 값을 먼저 보여주고**
   * 뒤에서 새로 읽는다(stale-while-revalidate) — 같은 탭을 오가는 게 이 툴에서 제일 잦은 동작이다.
   */
  const load = useCallback(() => {
    if (cachedStores.rows.length) { setRows(cachedStores.rows); setInvoices(cachedStores.invoices); setLoading(false); }
    else setLoading(true);

    fetch("/api/astro/stores").then((r) => r.json()).catch(() => ({}))
      .then((s) => {
        const next = s.stores ?? [];
        setRows(next); cachedStores.rows = next;
        setDraft({ on: Boolean(s.draft), note: s.draft_note });
      })
      .finally(() => setLoading(false));

    fetch(`/api/astro/invoices?period=${period}`).then((r) => r.json()).catch(() => ({}))
      .then((i) => { const next = i.invoices ?? []; setInvoices(next); cachedStores.invoices = next; });
  }, [period]);
  useEffect(load, [load]);

  /** 낙관적 갱신. 실패하면 화면을 바꾸기 전으로 되돌린다. */
  const patch = useCallback(async (id: number, body: Partial<StoreOps>) => {
    let snapshot: StoreRow[] = [];
    setRows((prev) => { snapshot = prev; return prev.map((r) => (r.restaurant_id === id ? { ...r, ops: { ...(r.ops ?? emptyStoreOps(id)), ...body } } : r)); });
    try {
      const res = await fetch(`/api/astro/stores/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, updated_by: actor }) });
      if (!res.ok) return setRows(snapshot);
      const d = await res.json();
      setRows((prev) => prev.map((r) => (r.restaurant_id === id ? { ...r, ops: d.ops } : r)));
    } catch { setRows(snapshot); }
  }, [actor]);

  const invById = useMemo(() => new Map(invoices.filter((i) => !["CANCELED", "REJECTED"].includes(i.status)).map((i) => [i.restaurant_id, i])), [invoices]);
  const pay = useCallback((r: StoreRow) => payOf(r, invById.get(r.restaurant_id)), [invById]);

  const affiliateAll = useMemo(() => rows.filter((r) => r.is_affiliate && !r.ops?.is_test), [rows]);
  const campuses = useMemo(() => allCampuses(affiliateAll.map((r) => r.ops?.campus)), [affiliateAll]);
  const countIn = (c: Campus) => affiliateAll.filter((r) => campusOf(r) === c).length;
  const inCampus = useMemo(() => affiliateAll.filter((r) => campus === "all" || campusOf(r) === campus), [affiliateAll, campus]);
  // 상권 구분은 뺐다(민열님 0911) — 캠퍼스 하나로 충분하다
  const affiliate = inCampus;
  const paid = useMemo(() => affiliate.filter((r) => isPaidTier(r.tier)), [affiliate]);
  const stuck = useMemo(() => ({
    unpaid: paid.filter((r) => pay(r).stuck),
    kit: paid.filter((r) => !r.ops?.kit_delivered),
    season: paid.filter((r) => !r.ops || (r.ops.semester_active === null && r.ops.vacation_active === null)),
  }), [paid, pay]);

  const visible = useMemo(() => {
    let list: StoreRow[] = filter === "all" ? affiliate : filter === "paid" ? paid : stuck[filter];
    const q = search.trim();
    if (q) list = list.filter((r) => r.name.includes(q) || String(r.restaurant_id) === q);
    const dir = sort.dir === "asc" ? 1 : -1;
    const tierRank = (t: string | null) => (t === "CONTENT" ? 3 : t === "BOOST" ? 2 : t === "FREE" ? 1 : 0);
    const payRank = (r: StoreRow) => { const k = pay(r).key; return k === "none" || k === "lump_open" ? 0 : k === "pending" ? 1 : k === "issued" ? 2 : k === "paid" || k === "lump_paid" ? 3 : 4; };
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "tier": return (tierRank(a.tier) - tierRank(b.tier)) * dir || a.name.localeCompare(b.name, "ko");
        case "billing": return (payRank(a) - payRank(b)) * dir || a.name.localeCompare(b.name, "ko");
        case "updated": return ((Date.parse(a.ops?.updated_at ?? "") || 0) - (Date.parse(b.ops?.updated_at ?? "") || 0)) * dir;
        default: return a.name.localeCompare(b.name, "ko") * dir;
      }
    });
  }, [affiliate, paid, stuck, filter, search, sort, pay]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "billing" ? "asc" : "desc" }));
  const open = rows.find((r) => r.restaurant_id === openId) ?? null;
  const monthLabel = `${Number(period.slice(5))}월`;

  return (
    <>
      <PageHeader
        title="파트너 매장"
        description="캠퍼스별 파트너 매장. 입금 열은 이번 달 청구 기준이고, 나머지는 사람이 확인해서 넣는 값입니다."
        actions={
          <>
            {draft.on && <DraftBadge note={draft.note} />}
            <a href="/api/astro/export?tab=계약" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-800 hover:bg-gray-50"><IconDownload size={16} aria-hidden="true" /> 시트 형식 CSV</a>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>매장 추가</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Campus | "all"> label="캠퍼스" value={campus} onChange={setCampus} options={[...campuses.map((c) => ({ key: c as Campus | "all", label: `${c} ${countIn(c)}`, icon: <CampusMark campus={c} size={15} /> })), { key: "all", label: "전체" }]} />
          <div className="relative flex-1 min-w-[10rem] max-w-xs ml-auto">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장명 또는 ID" aria-label="매장 검색" className="pl-8" />
          </div>
        </div>
      </PageHeader>

      {/* 총량이 아니라 '지금 막힌 것'. 누르면 표가 그것만 남는다. */}
      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="파트너 매장" value={loading ? "-" : affiliate.length} hint={`유료 ${paid.length}곳`} onClick={() => setFilter("all")} active={filter === "all"} />
        <Kpi label={`${monthLabel} 입금 미확인`} value={loading ? "-" : stuck.unpaid.length} tone="alert" hint="청구 안 됨 · 발행 후 대기 포함" onClick={() => setFilter("unpaid")} active={filter === "unpaid"} />
        <Kpi label="비치물 미전달" value={loading ? "-" : stuck.kit.length} hint="유료 매장 중" onClick={() => setFilter("kit")} active={filter === "kit"} />
        <Kpi label="학기/방학 미정" value={loading ? "-" : stuck.season.length} hint="방학 전 점주 확인 필요" onClick={() => setFilter("season")} active={filter === "season"} />
      </div>

      <Card flush title={`매장 ${visible.length}곳`}
        actions={<FilterPills label="매장 범위" value={filter === "paid" ? "paid" : filter === "all" ? "all" : "stuck"} onChange={(v) => setFilter(v === "stuck" ? "unpaid" : (v as Filter))} options={[{ key: "all", label: "전체", count: affiliate.length }, { key: "paid", label: "유료", count: paid.length }, { key: "stuck", label: "막힘", count: stuck.unpaid.length }]} />}>
        {loading ? <Skeleton rows={8} cols={6} /> : visible.length === 0 ? (
          <Empty title={affiliateAll.length === 0 ? "매장을 불러오지 못했습니다" : "이 조건에 해당하는 매장이 없습니다"} detail={affiliateAll.length === 0 ? "매장 목록은 실데이터(/api/dashboard/restaurants)에서 옵니다. 백엔드 연결을 확인하세요." : campus !== "all" && countIn(campus) === 0 ? `${campus} 매장은 아직 없습니다. 파트너 후보에서 계약이 되면 여기로 옵니다.` : "막힌 곳이 없다는 뜻입니다. 다른 지표를 눌러 보세요."} action={campus !== "all" && countIn(campus) === 0 ? <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>매장 추가</Button> : undefined} />
        ) : (
          <Table minWidth="52rem">
            <thead>
              <tr>
                <Th onClick={() => toggleSort("name")} sorted={sort.key === "name" ? sort.dir : null}>매장</Th>
                <Th width="6rem" onClick={() => toggleSort("tier")} sorted={sort.key === "tier" ? sort.dir : null}>플랜</Th>
                <Th width="7rem">운영 구분</Th>
                <Th width="8rem" onClick={() => toggleSort("billing")} sorted={sort.key === "billing" ? sort.dir : null}>{monthLabel} 입금</Th>
                <Th width="5rem" align="center">비치물</Th>
                <Th width="7rem" align="right" onClick={() => toggleSort("updated")} sorted={sort.key === "updated" ? sort.dir : null}>마지막 기록</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const o = r.ops; const s = season(o); const p = pay(r);
                return (
                  <tr key={r.restaurant_id} className={rowClickable} onClick={() => setOpenId(r.restaurant_id)}>
                    <Td>
                      {/* 캠퍼스를 '전체'로 볼 때는 어느 캠퍼스인지가 안 보인다 — 이름 앞에 표식을 둔다 */}
                      <span className="font-semibold text-gray-900 inline-flex items-center gap-1.5">{campus === "all" && <CampusMark campus={campusOf(r)} size={15} />}{r.name}</span>
                      <span className="block text-[11px] text-gray-400">{[o?.map_name && o.map_name !== r.name ? `지도: ${o.map_name}` : null, `ID ${r.restaurant_id}`].filter(Boolean).join(" · ")}</span>
                    </Td>
                    <Td>{r.tier ? <Chip tone={PLAN_TONE[r.tier] ?? "gray"}>{r.tier}</Chip> : <span className="text-gray-400">미지정</span>}</Td>
                    <Td>{isPaidTier(r.tier) ? <Chip tone={s.tone}>{s.text}</Chip> : <span className="text-gray-400">-</span>}</Td>
                    <Td>{p.key === "free" ? <span className="text-gray-400">무료</span> : <Chip tone={p.tone} dot={p.stuck}>{p.label}</Chip>}</Td>
                    <Td align="center">{o?.kit_delivered ? <span className="text-emerald-700 font-semibold">전달</span> : <span className="text-gray-300">-</span>}</Td>
                    <Td align="right" className="text-gray-500 text-[12px]">{agoLabel(o?.updated_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        플랜·사진·쿠폰은 <span className="font-semibold text-gray-700">식당 관리</span>가 원본입니다. 여기서는 영업이 손으로 확인하는 값과 이번 달 청구를 다룹니다.
        {onGo && <button type="button" onClick={() => onGo("astro-billing")} className="ml-1 text-navy font-medium hover:underline">월별 입금 현황 →</button>}
      </p>

      <StoreDetailPanel row={open} invoice={open ? invById.get(open.restaurant_id) ?? null : null} actor={actor} campusOptions={campuses} onClose={() => setOpenId(null)} onPatch={patch} onGo={onGo}
        onMarkPaid={async (inv) => {
          await fetch(`/api/astro/invoices/${inv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-paid", by: actor }) });
          load();
        }} />
      {adding && <NewStorePanel actor={actor} campus={campus === "all" ? (campuses[0] ?? "경북대") : campus} campusOptions={campuses} onClose={() => setAdding(false)} onCreated={load} />}
    </>
  );
}

/* ═══════════ 매장 추가 — 식당 관리와 같은 생성 경로 ═══════════ */

function NewStorePanel({ actor, campus, campusOptions, onClose, onCreated }: { actor: string; campus: Campus; campusOptions: string[]; onClose: () => void; onCreated: () => void }) {
  const thisP = periodLocal(), nextP = periodLocal(1);
  const [form, setForm] = useState({ name: "", campus, category: "", phone: "", url: "", map_url: "", map_name: "", address: "", tier: "FREE", memo: "", billing_start: thisP });
  /** 월 이용료 — 플랜·캠퍼스의 기본값으로 채우되, 한 번 손대면 그 값을 지킨다 (정든밤 22,000 같은 예외가 있다). */
  const [fee, setFee] = useState<string>("");
  const [feeTouched, setFeeTouched] = useState(false);
  const suggested = defaultMonthlyFee(form.tier, form.campus);
  useEffect(() => {
    if (feeTouched) return;
    setFee(suggested !== null && suggested > 0 ? String(suggested) : "");
  }, [suggested, feeTouched]);
  const [lookup, setLookup] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  /** 지도 링크에서 공식 상호를 읽어 매장명에 넣는다 — 팀원과 툴이 같은 이름을 쓴다. */
  async function fromMap() {
    if (!form.map_url.trim() || lookup.busy) return;
    setLookup({ busy: true, msg: null });
    try {
      const res = await fetch(`/api/astro/place?url=${encodeURIComponent(form.map_url.trim())}`);
      const d = await res.json();
      if (!res.ok || !d.name) { setLookup({ busy: false, msg: d.detail ?? "지도에서 이름을 못 읽었습니다. 직접 적어 주세요." }); return; }
      setForm((f) => ({ ...f, name: d.name, map_name: d.name, address: f.address || d.address || "" }));
      setLookup({ busy: false, msg: `${d.provider} 표기 "${d.name}" 를 매장명으로 넣었습니다.` });
    } catch { setLookup({ busy: false, msg: "지도 페이지를 읽지 못했습니다." }); }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      // 1) 매장 본체는 백엔드 원본(식당 관리와 같은 경로)
      const res = await fetch("/api/dashboard/admin/restaurants/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), address: form.address, phone_number: form.phone, category: form.category, url: form.url, main_menu: "", description: "", s3_image_urls: [], tier: form.tier || null }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(res.status === 502 || res.status === 501 ? "미리보기 모드라 매장을 만들 수 없습니다. 백엔드에 붙으면 식당 관리와 같은 경로로 생성됩니다." : d.detail ?? d.message ?? "매장을 만들지 못했습니다."); return; }
      const id = d.restaurant_id ?? d.id;
      // 2) 캠퍼스·상권·메모는 Astro 운영 필드
      const feeNum = Number(String(fee).replace(/[^\d]/g, ""));
      if (id) await fetch(`/api/astro/stores/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campus: form.campus, map_url: form.map_url || null, map_name: form.map_name || null, billing_start_period: form.billing_start, memo: form.memo || null, monthly_fee: feeNum > 0 ? feeNum : null, pay_cycle: feeNum > 0 ? "MONTHLY" : null, updated_by: actor }) });
      onCreated(); onClose();
    } catch { setError("서버에 연결하지 못했습니다."); } finally { setSaving(false); }
  }

  return (
    <SlideOver open onClose={onClose} title="매장 추가" subtitle="식당 관리와 같은 경로로 만들어집니다. 사진·쿠폰은 식당 관리에서 이어서 등록하세요."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.name.trim() || saving}>{saving ? "만드는 중…" : "매장 만들기"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <Field label="지도 링크 (네이버지도 · 카카오맵)" hint="지도상 공식 상호를 매장명으로 씁니다. 팀원이 부르는 이름과 툴 이름이 갈리지 않게.">
        <div className="flex gap-2"><Input value={form.map_url} onChange={set("map_url")} type="url" inputMode="url" placeholder="https://naver.me/… 또는 https://place.map.kakao.com/…" autoFocus /><Button onClick={fromMap} disabled={!form.map_url.trim() || lookup.busy}>{lookup.busy ? "읽는 중…" : "이름 가져오기"}</Button></div>
        {lookup.msg && <p className="text-[12px] text-gray-600 mt-1">{lookup.msg}</p>}
      </Field>
      <Field label="매장명" required hint={form.map_name ? `지도 표기: ${form.map_name}` : undefined}><Input value={form.name} onChange={set("name")} placeholder="예: 라라더" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="캠퍼스"><CampusPicker value={form.campus} options={campusOptions} onChange={(v) => setForm((f) => ({ ...f, campus: v }))} /></Field>
        <Field label="플랜"><Select value={form.tier} onChange={set("tier")}><option value="FREE">FREE</option><option value="BOOST">BOOST</option><option value="CONTENT">CONTENT</option></Select></Field>
        <Field label="월 이용료 (VAT 포함)" hint={feeHint(form.tier, form.campus) ?? "정해진 기본값이 없는 플랜입니다. 계약한 금액을 적으세요."}>
          <Input type="number" inputMode="numeric" value={fee} onChange={(e) => { setFee(e.target.value); setFeeTouched(true); }} placeholder={suggested ? String(suggested) : "예: 22000"} />
        </Field>
        <Field label="청구 시작" hint="월 중간에 들어오면 이번 달부터 받을지 다음 달부터 받을지"><Select value={form.billing_start} onChange={set("billing_start")}><option value={thisP}>이번 달부터 ({Number(thisP.slice(5))}월)</option><option value={nextP}>다음 달부터 ({Number(nextP.slice(5))}월)</option></Select></Field>
        <Field label="카테고리" hint="앱 목록 그대로입니다."><Select value={form.category} onChange={set("category")}><option value="">미정</option>{APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="매장 전화"><Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" /></Field>
        <Field label="링크"><Input value={form.url} onChange={set("url")} type="url" inputMode="url" placeholder="네이버 플레이스" /></Field>
      </div>
      <Field label="주소"><Input value={form.address} onChange={set("address")} /></Field>
      <Field label="메모"><Textarea rows={3} value={form.memo} onChange={set("memo")} placeholder="계약 특이사항 · 점주 요청" /></Field>
    </SlideOver>
  );
}
