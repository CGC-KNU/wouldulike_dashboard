"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import {
  BILLING_LABEL,
  INVOICE_LABEL,
  emptyStoreOps,
  isPaidTier,
  type StoreOps,
  type StoreRow,
} from "@/lib/draft/types";
import {
  Card,
  Chip,
  DraftBadge,
  Empty,
  FilterPills,
  Input,
  Kpi,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  agoLabel,
  rowClickable,
  type ChipTone,
} from "../_shared/ui";
import StoreDetailPanel from "./StoreDetailPanel";

/**
 * Astro · 매장 현황.
 *
 * 2026-08-07 주준영님이 올린 영업툴 요구 3가지가 그대로 이 표의 열이다:
 *   ① 학기 중점 매장 vs 방학에도 활성화하고 싶은 매장 구분
 *   ② 매장별 입금 상태를 수동 체크하되 한눈에 보이는 대시보드
 *   ③ 매장별 콘텐츠 정리 (Papillon 연동이 필요해 P2. 열 자리만 잡아둔다)
 *
 * 설계 원칙 하나 — 자동 판정하지 않는다. 학기/방학도 입금도 사람이 확인해서 넣고 툴은 보여준다(2026-08-12 합의).
 * 표는 Pitchr 리드 목록, 상세는 Console 캠페인 상세(슬라이드 패널)를 따랐다.
 */

type Filter = "all" | "paid" | "unpaid" | "invoice" | "kit" | "season";
type SortKey = "name" | "tier" | "billing" | "updated";

const PLAN_TONE: Record<string, ChipTone> = { BOOST: "amber", CONTENT: "navy", FREE: "gray" };

function season(o: StoreOps | null): { text: string; tone: ChipTone } {
  if (!o || (o.semester_active === null && o.vacation_active === null)) return { text: "미정", tone: "amber" };
  if (o.semester_active && o.vacation_active) return { text: "학기+방학", tone: "blue" };
  if (o.semester_active) return { text: "학기만", tone: "gray" };
  if (o.vacation_active) return { text: "방학만", tone: "gray" };
  return { text: "둘 다 쉼", tone: "gray" };
}

function billingTone(o: StoreOps | null): ChipTone {
  if (!o) return "gray";
  if (o.billing === "PAID") return "green";
  if (o.billing === "PENDING") return "red";
  if (o.billing === "EXEMPT") return "gray";
  return "gray";
}
function invoiceTone(o: StoreOps | null): ChipTone {
  if (!o) return "gray";
  if (o.invoice === "ISSUED") return "green";
  if (o.invoice === "NO_REPLY") return "red";
  if (o.invoice === "SENT") return "amber";
  return "gray";
}

export default function AstroOverview({ actor, onGo }: { actor: string; onGo?: (tab: string) => void }) {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/astro/stores")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.stores ?? []);
        setDraft({ on: Boolean(d.draft), note: d.draft_note });
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  /** 낙관적 갱신. 실패하면 화면을 바꾸기 전으로 되돌린다. */
  const patch = useCallback(
    async (id: number, body: Partial<StoreOps>) => {
      let snapshot: StoreRow[] = [];
      setRows((prev) => {
        snapshot = prev;
        return prev.map((r) => (r.restaurant_id === id ? { ...r, ops: { ...(r.ops ?? emptyStoreOps(id)), ...body } } : r));
      });
      try {
        const res = await fetch(`/api/astro/stores/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, updated_by: actor }),
        });
        if (!res.ok) return setRows(snapshot);
        const d = await res.json();
        setRows((prev) => prev.map((r) => (r.restaurant_id === id ? { ...r, ops: d.ops } : r)));
      } catch {
        setRows(snapshot);
      }
    },
    [actor]
  );

  const districts = useMemo(() => [...new Set(rows.map((r) => r.ops?.district).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ko")), [rows]);
  const affiliate = useMemo(() => rows.filter((r) => r.is_affiliate && !r.ops?.is_test && (district === "all" || r.ops?.district === district)), [rows, district]);
  const paid = useMemo(() => affiliate.filter((r) => isPaidTier(r.tier)), [affiliate]);
  const stuck = useMemo(
    () => ({
      unpaid: paid.filter((r) => r.ops?.billing !== "PAID" && r.ops?.billing !== "EXEMPT"),
      invoice: paid.filter((r) => r.ops?.invoice === "NO_REPLY"),
      kit: paid.filter((r) => r.ops?.billing === "PAID" && !r.ops?.kit_delivered),
      season: paid.filter((r) => !r.ops || (r.ops.semester_active === null && r.ops.vacation_active === null)),
    }),
    [paid]
  );

  const visible = useMemo(() => {
    let list: StoreRow[] =
      filter === "all" ? affiliate : filter === "paid" ? paid : stuck[filter];
    const q = search.trim();
    if (q) list = list.filter((r) => r.name.includes(q) || String(r.restaurant_id) === q);
    const dir = sort.dir === "asc" ? 1 : -1;
    const tierRank = (t: string | null) => (t === "CONTENT" ? 3 : t === "BOOST" ? 2 : t === "FREE" ? 1 : 0);
    const billRank = (o: StoreOps | null) => (o?.billing === "PAID" ? 3 : o?.billing === "PENDING" ? 1 : o?.billing === "EXEMPT" ? 2 : 0);
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "tier":
          return (tierRank(a.tier) - tierRank(b.tier)) * dir || a.name.localeCompare(b.name, "ko");
        case "billing":
          return (billRank(a.ops) - billRank(b.ops)) * dir || a.name.localeCompare(b.name, "ko");
        case "updated":
          return ((Date.parse(a.ops?.updated_at ?? "") || 0) - (Date.parse(b.ops?.updated_at ?? "") || 0)) * dir;
        default:
          return a.name.localeCompare(b.name, "ko") * dir;
      }
    });
  }, [affiliate, paid, stuck, filter, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const open = rows.find((r) => r.restaurant_id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="매장 현황"
        description="제휴 매장의 입금·계산서·운영 구분을 한 표에서 봅니다. 값은 전부 사람이 확인해서 넣는 값입니다."
        actions={
          <>
            {draft.on && <DraftBadge note={draft.note} />}
            <a href={`/api/astro/export?tab=계약${district !== "all" ? `&district=${encodeURIComponent(district)}` : ""}`} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-800 hover:bg-gray-50">
              <IconDownload size={16} aria-hidden="true" /> 시트 형식 CSV
            </a>
          </>
        }
      >
        {districts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-gray-400 mr-1">상권</span>
            <FilterPills label="상권" value={district} onChange={setDistrict} options={[{ key: "all", label: "전체" }, ...districts.map((d) => ({ key: d, label: d, count: rows.filter((r) => r.is_affiliate && r.ops?.district === d).length }))]} />
            <span className="text-[12px] text-gray-400">상권이 비어 있는 매장 {rows.filter((r) => r.is_affiliate && !r.ops?.district).length}곳 · 매장 상세에서 적을 수 있습니다</span>
          </div>
        )}
      </PageHeader>

      {/* 총량이 아니라 '지금 막힌 것'. 누르면 표가 그것만 남는다. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-5">
        <Kpi label="제휴 매장" value={loading ? "-" : affiliate.length} hint={`유료 ${paid.length}곳`} onClick={() => setFilter("all")} active={filter === "all"} />
        <Kpi label="입금 미확인" value={loading ? "-" : stuck.unpaid.length} tone="alert" hint="유료 매장 중" onClick={() => setFilter("unpaid")} active={filter === "unpaid"} />
        <Kpi label="계산서 미회신" value={loading ? "-" : stuck.invoice.length} tone="alert" hint="보냈는데 답이 없음" onClick={() => setFilter("invoice")} active={filter === "invoice"} />
        <Kpi label="비치물 미전달" value={loading ? "-" : stuck.kit.length} hint="입금은 끝난 곳" onClick={() => setFilter("kit")} active={filter === "kit"} />
        <Kpi label="학기/방학 미정" value={loading ? "-" : stuck.season.length} hint="방학 전 점주 확인 필요" onClick={() => setFilter("season")} active={filter === "season"} />
      </div>

      <Card
        flush
        title={`매장 ${visible.length}곳`}
        actions={
          <>
            <FilterPills
              label="매장 범위"
              value={filter === "paid" ? "paid" : filter === "all" ? "all" : "stuck"}
              onChange={(v) => setFilter(v === "stuck" ? "unpaid" : (v as Filter))}
              options={[
                { key: "all", label: "전체", count: affiliate.length },
                { key: "paid", label: "유료", count: paid.length },
                { key: "stuck", label: "막힘", count: stuck.unpaid.length },
              ]}
            />
            <div className="relative">
              <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장명 또는 ID" aria-label="매장 검색" className="pl-8 w-44" />
            </div>
          </>
        }
      >
        {loading ? (
          <Skeleton rows={8} cols={6} />
        ) : visible.length === 0 ? (
          <Empty
            title={filter === "all" ? "매장을 불러오지 못했습니다" : "이 조건에 해당하는 매장이 없습니다"}
            detail={
              filter === "all"
                ? "매장 목록은 실데이터(/api/dashboard/restaurants)에서 옵니다. 백엔드 연결을 확인하세요."
                : "막힌 곳이 없다는 뜻입니다. 다른 지표를 눌러 보세요."
            }
          />
        ) : (
          <Table minWidth="52rem">
            <thead>
              <tr>
                <Th onClick={() => toggleSort("name")} sorted={sort.key === "name" ? sort.dir : null}>매장</Th>
                <Th width="6rem" onClick={() => toggleSort("tier")} sorted={sort.key === "tier" ? sort.dir : null}>플랜</Th>
                <Th width="7rem">운영 구분</Th>
                <Th width="7rem" onClick={() => toggleSort("billing")} sorted={sort.key === "billing" ? sort.dir : null}>입금</Th>
                <Th width="7rem">계산서</Th>
                <Th width="5rem" align="center">비치물</Th>
                <Th width="7rem" align="right" onClick={() => toggleSort("updated")} sorted={sort.key === "updated" ? sort.dir : null}>마지막 기록</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const o = r.ops;
                const s = season(o);
                return (
                  <tr
                    key={r.restaurant_id}
                    className={rowClickable}
                    onClick={() => setOpenId(r.restaurant_id)}
                  >
                    <Td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(r.restaurant_id);
                        }}
                        className="text-left font-semibold text-gray-900 hover:text-navy focus-visible:outline-none focus-visible:underline"
                      >
                        {r.name}
                      </button>
                      <span className="block text-[11px] text-gray-400">ID {r.restaurant_id}</span>
                    </Td>
                    <Td>{r.tier ? <Chip tone={PLAN_TONE[r.tier] ?? "gray"}>{r.tier}</Chip> : <span className="text-gray-400">미지정</span>}</Td>
                    <Td>
                      {/* 무료·미지정 매장은 학기/방학을 정할 이유가 없다. 노란 '미정' 34개는 소음이다. */}
                      {isPaidTier(r.tier) ? <Chip tone={s.tone}>{s.text}</Chip> : <span className="text-gray-400">-</span>}
                    </Td>
                    <Td>
                      {isPaidTier(r.tier) ? (
                        <Chip tone={billingTone(o)} dot={o?.billing === "PENDING"}>{BILLING_LABEL[o?.billing ?? "UNKNOWN"]}</Chip>
                      ) : (
                        <span className="text-gray-400">무료</span>
                      )}
                    </Td>
                    <Td>
                      {isPaidTier(r.tier) ? (
                        <Chip tone={invoiceTone(o)} dot={o?.invoice === "NO_REPLY"}>{INVOICE_LABEL[o?.invoice ?? "NONE"]}</Chip>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </Td>
                    <Td align="center">
                      {o?.kit_delivered ? <span className="text-emerald-700 font-semibold">전달</span> : <span className="text-gray-300">-</span>}
                    </Td>
                    <Td align="right" className="text-gray-500 text-[12px]">{agoLabel(o?.updated_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        플랜·사진·쿠폰은 <span className="font-semibold text-gray-700">식당 관리</span>가 원본입니다. 여기서는 영업이 손으로 확인하는 값만 다룹니다.
        같은 값을 두 곳에서 고치게 만들지 않기 위해서입니다.
      </p>

      <StoreDetailPanel row={open} actor={actor} onClose={() => setOpenId(null)} onPatch={patch} onGoDocs={onGo ? () => onGo("astro-docs") : undefined} />
    </>
  );
}
