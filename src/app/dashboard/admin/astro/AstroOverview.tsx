"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDownload, IconPlus, IconSearch } from "@tabler/icons-react";
import { APP_CATEGORIES, CAMPUSES, TAX_STATUS_LABEL, emptyStoreOps, isPaidTier, type Campus, type StoreOps, type StoreRow, type TaxInvoice } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Kpi, PageHeader, Segmented, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, agoLabel, periodLocal, rowClickable, type ChipTone } from "../_shared/ui";
import StoreDetailPanel from "./StoreDetailPanel";
import CampusPicker, { allCampuses } from "./CampusPicker";
import NewStorePanel from "./NewStorePanel";
import CampusMark from "./CampusMark";
import TestStoreDelete from "./TestStoreDelete";
import OnboardReconcile from "./OnboardReconcile";
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

type Filter = "all" | "paid" | "unpaid" | "kit" | "season" | "ended" | "test";
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
  /**
   * `fresh` 는 **값을 바꾼 직후**에 쓴다. 서버 캐시(6초)를 건너뛰고, 화면에 옛 값을 한 번
   * 깔아 놓는 것(cachedStores)도 건너뛴다. 둘 다 안 하면 바꾼 값이 잠깐 뒤 옛 값으로 덮인다.
   */
  const load = useCallback((fresh = false) => {
    if (!fresh && cachedStores.rows.length) { setRows(cachedStores.rows); setInvoices(cachedStores.invoices); setLoading(false); }
    else if (!cachedStores.rows.length) setLoading(true);

    fetch(`/api/astro/stores${fresh ? "?fresh=1" : ""}`).then((r) => r.json()).catch(() => ({}))
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
  /**
   * 테스트 매장 — 숫자·청구·캘린더에서는 빼지만 **목록에서 사라지게 두면 안 된다.**
   * 0921 에 실제로 밟았다: 체크를 켠 순간 매장이 목록에서 없어져 토글을 되돌릴 수도,
   * 온보딩 링크를 낼 수도 없었다. 켜면 되돌릴 수 없는 스위치는 스위치가 아니다.
   * 그래서 별도 칩으로 따로 세운다 — 평소엔 안 보이고, 찾을 때는 한 번에 찾힌다.
   */
  const testAll = useMemo(() => rows.filter((r) => Boolean(r.ops?.is_test)), [rows]);
  const test = useMemo(() => testAll.filter((r) => campus === "all" || campusOf(r) === campus), [testAll, campus]);
  /**
   * 계약 종료 — 제휴를 끈 매장. 지우지 않고 따로 세워 둔다(재계약할 수 있다).
   *
   * **비제휴라고 다 계약 종료가 아니다.** 앱 DB에는 제휴한 적 없는 일반 식당이 150곳 넘게 있다.
   * 그래서 '우리와 계약한 적이 있는가'로 가른다 — 계약 시작일·체결일·종료일·월 이용료 중
   * 하나라도 적혀 있으면 우리 매장이었던 것이다. 툴에서 '계약 종료'를 누르면 종료일이 남으므로
   * 앞으로 종료하는 곳은 전부 여기 걸린다.
   */
  const endedAll = useMemo(
    () => rows.filter((r) => {
      if (r.is_affiliate || r.ops?.is_test) return false;
      const o = r.ops;
      return Boolean(o && (o.contract_ends_on || o.contract_started_on || o.contract_signed_on || o.monthly_fee));
    }),
    [rows]
  );
  const ended = useMemo(() => endedAll.filter((r) => campus === "all" || campusOf(r) === campus), [endedAll, campus]);
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

  /**
   * 빈 목록의 이유를 정확히 말한다. "막힌 곳이 없다"는 검색어 때문에 비었을 때는 거짓말이다 —
   * 0921 에 테스트 매장을 찾다가 이 문장을 봤다. 어디에 있는지까지 짚어 준다.
   */
  const emptyWhy = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    const hit = rows.find((r) => r.name.includes(q) || String(r.restaurant_id) === q);
    if (!hit) return `'${q}'에 맞는 매장이 없습니다.`;
    const where = hit.ops?.is_test ? "테스트" : !hit.is_affiliate ? "계약 종료" : campusOf(hit) !== campus && campus !== "all" ? campusOf(hit) : "전체";
    return `'${q}'는 있지만 이 범위에 없습니다 — ${where}에서 찾아보세요.`;
  }, [search, rows, campus]);

  const visible = useMemo(() => {
    let list: StoreRow[] = filter === "all" ? affiliate : filter === "paid" ? paid : filter === "ended" ? ended : filter === "test" ? test : stuck[filter as "unpaid" | "kit" | "season"];
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
  }, [affiliate, paid, stuck, ended, filter, search, sort, pay]);

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

      <OnboardReconcile onDone={() => load(true)} />

      <Card flush title={`매장 ${visible.length}곳`}
        actions={<FilterPills label="매장 범위" value={filter === "paid" ? "paid" : filter === "all" ? "all" : filter === "ended" ? "ended" : filter === "test" ? "test" : "stuck"} onChange={(v) => setFilter(v === "stuck" ? "unpaid" : (v as Filter))} options={[{ key: "all", label: "전체", count: affiliate.length }, { key: "paid", label: "유료", count: paid.length }, { key: "stuck", label: "막힘", count: stuck.unpaid.length }, ...(endedAll.length ? [{ key: "ended", label: "계약 종료", count: ended.length }] : []), ...(testAll.length ? [{ key: "test", label: "테스트", count: test.length }] : [])]} />}>
        {loading ? <Skeleton rows={8} cols={6} /> : visible.length === 0 ? (
          <Empty title={affiliateAll.length === 0 ? "매장을 불러오지 못했습니다" : "이 조건에 해당하는 매장이 없습니다"} detail={affiliateAll.length === 0 ? "매장 목록은 실데이터(/api/dashboard/restaurants)에서 옵니다. 백엔드 연결을 확인하세요." : campus !== "all" && countIn(campus) === 0 ? `${campus} 매장은 아직 없습니다. 파트너 후보에서 계약이 되면 여기로 옵니다.` : emptyWhy ?? (filter === "test" ? "테스트 매장이 없습니다. 매장 상세의 '테스트 매장'을 켜면 여기로 옵니다." : "막힌 곳이 없다는 뜻입니다. 다른 지표를 눌러 보세요.")} action={campus !== "all" && countIn(campus) === 0 ? <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>매장 추가</Button> : undefined} />
        ) : (
          <Table minWidth="52rem">
            <thead>
              <tr>
                <Th onClick={() => toggleSort("name")} sorted={sort.key === "name" ? sort.dir : null}>매장</Th>
                <Th width="8.5rem" onClick={() => toggleSort("tier")} sorted={sort.key === "tier" ? sort.dir : null}>플랜</Th>
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
                      <span className="font-semibold text-gray-900 inline-flex items-center gap-1.5">
                        {campus === "all" && <CampusMark campus={campusOf(r)} size={15} />}
                        <span className={r.is_affiliate ? "" : "text-gray-500"}>{r.name}</span>
                      </span>
                      <span className="block text-[11px] text-gray-400">{[!r.is_affiliate && o?.contract_ends_on ? `종료 ${o.contract_ends_on}` : null, o?.map_name && o.map_name !== r.name ? `지도: ${o.map_name}` : null, `ID ${r.restaurant_id}`].filter(Boolean).join(" · ")}</span>
                    </Td>
                    {/* 플랜은 **읽기만** (민열님 0914). 바꾸는 곳은 매장을 열었을 때 한 곳 —
                        표에서 실수로 스크롤하다 값이 바뀌는 게 더 위험하고, 플랜을 바꾸면
                        월 이용료·청구가 따라 움직여서 그 맥락이 보이는 자리에서 바꾸는 게 맞다. */}
                    <Td>
                      <span className={`text-[12px] font-semibold ${r.tier === "BOOST" ? "text-navy" : r.tier === "CONTENT" ? "text-amber-700" : r.tier ? "text-gray-700" : "text-gray-400"}`}>
                        {r.tier === "CONTENT" ? "Premium" : r.tier === "BOOST" ? "Boost" : r.tier === "FREE" ? "무료" : "미지정"}
                      </span>
                    </Td>
                    {/* 운영 구분 — 계약이 끝난 곳은 학기/방학이 의미가 없다. 종료를 먼저 말한다 (민열님 0914). */}
                    <Td>{r.ops?.is_test ? <Chip tone="gray">테스트</Chip> : !r.is_affiliate ? <Chip tone="red" dot>계약 종료</Chip> : isPaidTier(r.tier) ? <Chip tone={s.tone}>{s.text}</Chip> : <span className="text-gray-400">-</span>}</Td>
                    <Td>{p.key === "free" ? <span className="text-gray-400">무료</span> : <Chip tone={p.tone} dot={p.stuck}>{p.label}</Chip>}</Td>
                    <Td align="center">{o?.kit_delivered ? <span className="text-emerald-700 font-semibold">전달</span> : <span className="text-gray-300">-</span>}</Td>
                    <Td align="right" className="text-gray-500 text-[12px]">
                      {agoLabel(o?.updated_at)}
                      {/* 테스트로 표시된 매장만 여기서 지운다 (0923 인계 ②). 삭제 화면이 원래 어느 제품에도
                          안 묶인 고아 탭에 있어 갈 수가 없었다. 진짜 매장에는 뜨지 않는다. */}
                      {o?.is_test && (
                        <span className="block mt-1" onClick={(e) => e.stopPropagation()}>
                          <TestStoreDelete rid={r.restaurant_id} name={r.name} onDeleted={() => load(true)} />
                        </span>
                      )}
                    </Td>
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

      <StoreDetailPanel row={open} invoice={open ? invById.get(open.restaurant_id) ?? null : null} actor={actor} campusOptions={campuses} onClose={() => setOpenId(null)} onPatch={patch} onReload={() => load(true)} onGo={onGo}
        onMarkPaid={async (inv) => {
          await fetch(`/api/astro/invoices/${inv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-paid", by: actor }) });
          load();
        }} />
      {adding && <NewStorePanel actor={actor} campus={campus === "all" ? (campuses[0] ?? "경북대") : campus} campusOptions={campuses} onClose={() => setAdding(false)} onCreated={() => load(true)} />}
    </>
  );
}

