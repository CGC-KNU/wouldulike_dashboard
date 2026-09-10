"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BILLING_LABEL,
  INVOICE_LABEL,
  emptyStoreOps,
  isPaidTier,
  type BillingState,
  type InvoiceState,
  type StoreOps,
  type StoreRow,
} from "@/lib/draft/types";
import { Card, Chip, DraftBadge, Empty, Kpi, Spinner, agoLabel, inputCls } from "../_shared/ui";
import ActivityLog from "./ActivityLog";

/**
 * Astro · 영업 현황 — "매장 한 장"의 목록판.
 *
 * 2026-08-07 주준영님이 올린 영업툴 요구 3가지가 그대로 이 화면의 열이다:
 *   ① 학기 중점 매장 vs 방학에도 활성화하고 싶어하는 매장 구분
 *   ② 매장별 입금 상태를 수동 체크하되 한눈에 보이는 대시보드
 *   ③ 매장별 콘텐츠 정리 (→ Papillon 연동이 필요해 P2. 여기서는 자리만 잡는다)
 *
 * 설계 원칙 하나만 지킨다 — **자동 판정하지 않는다.** 학기/방학도 입금도 사람이 확인해서
 * 넣고 툴은 보여주기만 한다(2026-08-12 합의). 자동 추론을 넣으면 틀렸을 때 영업이 그
 * 값을 못 믿게 되고, 결국 다시 시트로 돌아간다.
 */

type Filter = "all" | "unpaid" | "invoice" | "kit" | "season";

const PLAN_TONE = { BOOST: "amber", CONTENT: "indigo", FREE: "gray" } as const;

function seasonLabel(o: StoreOps | null): { text: string; tone: "gray" | "blue" | "amber" } {
  if (!o || (o.semester_active === null && o.vacation_active === null))
    return { text: "미정", tone: "amber" };
  if (o.semester_active && o.vacation_active) return { text: "학기+방학", tone: "blue" };
  if (o.semester_active) return { text: "학기만", tone: "gray" };
  if (o.vacation_active) return { text: "방학만", tone: "gray" };
  return { text: "둘 다 쉼", tone: "gray" };
}

export default function AstroOverview({ actor }: { actor: string }) {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
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

  /** 한 매장의 운영 필드를 고친다. 낙관적 갱신 — 실패하면 다시 읽어 되돌린다. */
  const patch = useCallback(
    async (id: number, body: Partial<StoreOps>) => {
      let snapshot: StoreRow[] = [];
      setRows((prev) => {
        snapshot = prev;
        return prev.map((r) =>
          r.restaurant_id === id ? { ...r, ops: { ...(r.ops ?? emptyStoreOps(id)), ...body } } : r
        );
      });
      try {
        const res = await fetch(`/api/astro/stores/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, updated_by: actor }),
        });
        if (!res.ok) {
          setRows(snapshot);
          return;
        }
        const d = await res.json();
        setRows((prev) => prev.map((r) => (r.restaurant_id === id ? { ...r, ops: d.ops } : r)));
      } catch {
        // 오프라인·서버 재시작 — 화면을 바꾸기 전으로 되돌린다
        setRows(snapshot);
      }
    },
    [actor]
  );

  const affiliate = useMemo(() => rows.filter((r) => r.is_affiliate && !r.ops?.is_test), [rows]);
  const paid = useMemo(() => affiliate.filter((r) => isPaidTier(r.tier)), [affiliate]);

  const stuck = useMemo(
    () => ({
      unpaid: paid.filter((r) => r.ops?.billing !== "PAID" && r.ops?.billing !== "EXEMPT"),
      invoice: paid.filter((r) => r.ops?.invoice === "NO_REPLY"),
      kit: paid.filter((r) => r.ops?.billing === "PAID" && !r.ops?.kit_delivered),
      season: paid.filter(
        (r) => !r.ops || (r.ops.semester_active === null && r.ops.vacation_active === null)
      ),
    }),
    [paid]
  );

  const visible = useMemo(() => {
    let list =
      filter === "all"
        ? affiliate
        : filter === "unpaid"
          ? stuck.unpaid
          : filter === "invoice"
            ? stuck.invoice
            : filter === "kit"
              ? stuck.kit
              : stuck.season;
    if (search.trim()) list = list.filter((r) => r.name.includes(search.trim()));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [affiliate, filter, search, stuck]);

  return (
    <div className="space-y-4">
      {/* KPI — 총합이 아니라 "지금 막힌 것". 누르면 목록이 그것만 남는다. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Kpi
          label="제휴 매장"
          value={loading ? "—" : affiliate.length}
          hint={`유료 ${paid.length}`}
          onClick={() => setFilter("all")}
          active={filter === "all"}
        />
        <Kpi
          label="입금 미확인"
          value={loading ? "—" : stuck.unpaid.length}
          tone="alert"
          hint="유료 매장 기준"
          onClick={() => setFilter("unpaid")}
          active={filter === "unpaid"}
        />
        <Kpi
          label="계산서 미회신"
          value={loading ? "—" : stuck.invoice.length}
          tone="alert"
          hint="보냈는데 답이 없음"
          onClick={() => setFilter("invoice")}
          active={filter === "invoice"}
        />
        <Kpi
          label="비치물 미전달"
          value={loading ? "—" : stuck.kit.length}
          hint="입금은 끝난 곳"
          onClick={() => setFilter("kit")}
          active={filter === "kit"}
        />
        <Kpi
          label="학기/방학 미정"
          value={loading ? "—" : stuck.season.length}
          hint="방학 전 확인 필요"
          onClick={() => setFilter("season")}
          active={filter === "season"}
        />
      </div>

      <Card
        padded={false}
        title="매장 운영 현황"
        desc="행을 누르면 그 자리에서 고칠 수 있습니다. 값은 전부 사람이 확인해서 넣는 값입니다."
        right={
          <div className="flex items-center gap-2">
            {draft.on && <DraftBadge note={draft.note} />}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="매장명 검색…"
              aria-label="매장명 검색"
              autoComplete="off"
              className={`${inputCls} w-28`}
            />
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <Empty
            title={filter === "all" ? "매장을 불러오지 못했습니다" : "이 칸은 비었습니다"}
            detail={
              filter === "all"
                ? "백엔드 연결을 확인하세요. 매장 목록은 실데이터(/api/dashboard/restaurants)에서 옵니다."
                : "막힌 게 없다는 뜻입니다. 다른 KPI 를 눌러보세요."
            }
          />
        ) : (
          <>
            <div className="hidden md:flex items-center gap-x-2 px-4 py-2 bg-gray-50 border-y border-gray-100 text-[10px] font-semibold text-gray-500">
              <span className="flex-1">매장</span>
              <span className="w-20">플랜</span>
              <span className="w-24">학기/방학</span>
              <span className="w-24">입금</span>
              <span className="w-24">계산서</span>
              <span className="w-16 text-center">비치물</span>
              <span className="w-20 text-right">마지막 기록</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {visible.map((r) => {
                const o = r.ops;
                const season = seasonLabel(o);
                const open = openId === r.restaurant_id;
                return (
                  <li key={r.restaurant_id}>
                    <button
                      onClick={() => setOpenId(open ? null : r.restaurant_id)}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      {/* 폰에서는 매장명이 한 줄을 다 쓰고 상태 칩이 그 아래로 흐른다.
                          데스크톱에서만 표 형태(고정 폭 열)가 된다 — 아윤님이 폰으로 쓰는 걸 전제로 요청했다. */}
                      <span className="w-full md:flex-1 md:w-auto min-w-0 text-sm font-medium text-gray-800 truncate">
                        {r.name}
                        <span className="ml-1.5 text-[10px] text-gray-300">{r.restaurant_id}</span>
                      </span>
                      <span className="md:w-20 shrink-0">
                        {r.tier ? (
                          <Chip tone={PLAN_TONE[r.tier as keyof typeof PLAN_TONE] ?? "gray"}>{r.tier}</Chip>
                        ) : (
                          <span className="text-[10px] text-gray-300">미등록</span>
                        )}
                      </span>
                      <span className="md:w-24 shrink-0">
                        <Chip tone={season.tone}>{season.text}</Chip>
                      </span>
                      <span className="md:w-24 shrink-0">
                        <Chip
                          tone={
                            o?.billing === "PAID"
                              ? "green"
                              : o?.billing === "PENDING"
                                ? "red"
                                : "gray"
                          }
                        >
                          {BILLING_LABEL[(o?.billing ?? "UNKNOWN") as BillingState]}
                        </Chip>
                      </span>
                      <span className="md:w-24 shrink-0">
                        <Chip
                          tone={
                            o?.invoice === "ISSUED"
                              ? "green"
                              : o?.invoice === "NO_REPLY"
                                ? "red"
                                : "gray"
                          }
                        >
                          {INVOICE_LABEL[(o?.invoice ?? "NONE") as InvoiceState]}
                        </Chip>
                      </span>
                      <span className="md:w-16 md:text-center text-xs shrink-0" title="비치물 전달">
                        {o?.kit_delivered ? (
                          "✅"
                        ) : (
                          <span className="text-gray-300">
                            <span className="md:hidden">비치물 </span>—
                          </span>
                        )}
                      </span>
                      <span className="ml-auto md:ml-0 md:w-20 md:text-right text-[10px] text-gray-400 shrink-0">
                        {agoLabel(o?.updated_at)}
                      </span>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 bg-gray-50/60 border-t border-gray-100">
                        <OpsEditor row={r} onPatch={(b) => patch(r.restaurant_id, b)} />
                        <ActivityLog
                          targetType="store"
                          targetId={String(r.restaurant_id)}
                          actor={actor}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <p className="text-[10px] text-gray-400 leading-relaxed px-1">
        플랜·사진·쿠폰 설정은 <span className="font-semibold text-gray-500">식당 관리</span> 탭이 원본입니다.
        여기서는 <span className="font-semibold text-gray-500">영업이 손으로 확인하는 값</span>만 다룹니다 —
        같은 값을 두 곳에서 고치게 만들지 않기 위해서입니다.
      </p>
    </div>
  );
}

/* ═══════════ 행 안의 편집기 ═══════════ */

function OpsEditor({ row, onPatch }: { row: StoreRow; onPatch: (b: Partial<StoreOps>) => void }) {
  const o = row.ops;
  const [memo, setMemo] = useState(o?.memo ?? "");

  const toggle = (key: "semester_active" | "vacation_active", next: boolean | null) =>
    onPatch({ [key]: next } as Partial<StoreOps>);

  return (
    <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 운영 — 학기/방학 */}
      <div className="bg-white rounded-xl p-3">
        <p className="text-[10px] font-semibold text-gray-400 mb-2">운영</p>
        <div className="space-y-2">
          {(
            [
              ["semester_active", "학기 중 이용"],
              ["vacation_active", "방학 중 이용"],
            ] as const
          ).map(([key, label]) => {
            const v = o?.[key] ?? null;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[11px] text-gray-600">{label}</span>
                <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
                  {(
                    [
                      [true, "예"],
                      [false, "아니오"],
                      [null, "미정"],
                    ] as const
                  ).map(([val, txt]) => (
                    <button
                      key={String(val)}
                      onClick={() => toggle(key, val)}
                      className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-md ${
                        v === val ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {txt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <label className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-gray-600">비치물 전달</span>
            <input
              type="checkbox"
              checked={o?.kit_delivered ?? false}
              onChange={(e) => onPatch({ kit_delivered: e.target.checked })}
              className="w-4 h-4 accent-[#6366E0]"
            />
          </label>
        </div>
      </div>

      {/* 이행 — 입금·계산서 */}
      <div className="bg-white rounded-xl p-3">
        <p className="text-[10px] font-semibold text-gray-400 mb-2">이행</p>
        <div className="space-y-2">
          <div>
            <span className="text-[11px] text-gray-600">입금</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {(["UNKNOWN", "PENDING", "PAID", "EXEMPT"] as BillingState[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onPatch({ billing: s })}
                  className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-lg border ${
                    (o?.billing ?? "UNKNOWN") === s
                      ? "bg-navy text-white border-navy"
                      : "bg-white text-gray-500 border-gray-200 hover:border-periwinkle"
                  }`}
                >
                  {BILLING_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[11px] text-gray-600">세금계산서</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {(["NONE", "SENT", "NO_REPLY", "ISSUED"] as InvoiceState[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onPatch({ invoice: s })}
                  className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-lg border ${
                    (o?.invoice ?? "NONE") === s
                      ? "bg-navy text-white border-navy"
                      : "bg-white text-gray-500 border-gray-200 hover:border-periwinkle"
                  }`}
                >
                  {INVOICE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          {o?.billing_checked_at && (
            <p className="text-[10px] text-gray-400 pt-0.5">
              입금 확인 {o.billing_checked_at}
              {o.billing_checked_by ? ` · ${o.billing_checked_by}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* 메모 */}
      <div className="bg-white rounded-xl p-3">
        <p className="text-[10px] font-semibold text-gray-400 mb-2">메모</p>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => memo !== (o?.memo ?? "") && onPatch({ memo })}
          rows={4}
          placeholder="계약 조건 특이사항, 점주 요청 등"
          aria-label="메모"
          className={`${inputCls} resize-none`}
        />
        {o?.biz_no && <p className="text-[10px] text-gray-400 mt-1.5">사업자 {o.biz_no}</p>}
      </div>
    </div>
  );
}
