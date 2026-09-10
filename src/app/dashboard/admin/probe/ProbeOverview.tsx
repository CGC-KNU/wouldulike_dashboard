"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoreMetric } from "@/lib/draft/types";
import { Card, Chip, Empty, Kpi, Segmented, Spinner } from "../_shared/ui";

/**
 * Probe · 매장 지표.
 *
 * 지금 이 숫자들은 Astro 매장 상세를 열어야만 한 곳씩 보인다. "이번 달에 어느 매장이
 * 죽어 있나"를 알려면 34번 클릭해야 한다는 뜻이다. 이 화면은 그 34번을 한 장으로 바꾼다.
 *
 * 설계에서 신경 쓴 것 두 가지.
 *
 * 1) **0 과 '모름'을 절대 섞지 않는다.** 지표를 못 읽은 매장은 회색 '—' 로 두고 합계에서도 뺀다.
 *    0 으로 채우면 "이 매장 망했네" 같은 오판이 난다.
 *
 * 2) **총합보다 '조용한 매장' 이 먼저다.** 쿠폰도 스탬프도 0인 제휴 매장 수 —
 *    이게 영업이 다음 주에 전화 돌릴 목록이다.
 */

type SortKey = "name" | "coupon" | "stamp" | "loyal" | "revisit";

interface Totals {
  stores: number;
  affiliate: number;
  paid: number;
  coupon_redeemed: number;
  stamp_earned: number;
  loyal_total: number;
  revisit_this_month: number;
  unavailable: number;
  silent: number;
}

export default function ProbeOverview() {
  const [stores, setStores] = useState<StoreMetric[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("coupon");
  const [scope, setScope] = useState<"all" | "paid" | "silent">("all");
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/probe/overview")
      .then((r) => r.json())
      .then((d) => {
        setStores(d.stores ?? []);
        setTotals(d.totals ?? null);
        setGeneratedAt(d.generated_at ?? "");
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    let list = stores.filter((s) => s.is_affiliate);
    if (scope === "paid") list = list.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT");
    if (scope === "silent")
      list = list.filter(
        (s) => !s.unavailable && s.coupon_redeemed_this_month === 0 && s.stamp_earned_this_month === 0
      );
    const by: Record<SortKey, (s: StoreMetric) => number | string> = {
      name: (s) => s.name,
      coupon: (s) => -s.coupon_redeemed_this_month,
      stamp: (s) => -s.stamp_earned_this_month,
      loyal: (s) => -s.loyal_total,
      revisit: (s) => -s.revisit_this_month,
    };
    return [...list].sort((a, b) => {
      const va = by[sort](a);
      const vb = by[sort](b);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "ko");
      return (va as number) - (vb as number);
    });
  }, [stores, scope, sort]);

  const max = useMemo(
    () => ({
      coupon: Math.max(1, ...rows.map((r) => r.coupon_redeemed_this_month)),
      stamp: Math.max(1, ...rows.map((r) => r.stamp_earned_this_month)),
    }),
    [rows]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Kpi label="제휴 매장" value={loading ? "—" : totals?.affiliate ?? 0} hint={`유료 ${totals?.paid ?? 0}`} />
        <Kpi
          label="조용한 매장"
          value={loading ? "—" : totals?.silent ?? 0}
          tone="alert"
          hint="이번 달 쿠폰·스탬프 0"
          onClick={() => setScope("silent")}
          active={scope === "silent"}
        />
        <Kpi label="쿠폰 사용" value={loading ? "—" : (totals?.coupon_redeemed ?? 0).toLocaleString()} suffix="건" hint="이번 달" />
        <Kpi label="스탬프 적립" value={loading ? "—" : (totals?.stamp_earned ?? 0).toLocaleString()} suffix="건" hint="이번 달" />
        <Kpi
          label="지표 못 읽음"
          value={loading ? "—" : totals?.unavailable ?? 0}
          hint="0 이 아니라 '모름'"
        />
      </div>

      <Card
        padded={false}
        title="매장별 지표"
        desc="합계는 지표를 읽은 매장만으로 계산합니다. 못 읽은 매장은 '—' 로 두고 뺍니다."
        right={
          <div className="flex items-center gap-2">
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { key: "all", label: "전체" },
                { key: "paid", label: "유료" },
                { key: "silent", label: "조용함" },
              ]}
            />
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty
            title={scope === "silent" ? "조용한 매장이 없습니다" : "지표를 불러오지 못했습니다"}
            detail={
              scope === "silent"
                ? "모든 제휴 매장에 이번 달 활동이 있습니다."
                : "백엔드 연결을 확인하세요. 지표는 /api/dashboard/stats 를 매장마다 호출해 모읍니다."
            }
          />
        ) : (
          /* 지표 표는 열끼리 비교하는 게 전부라 폰에서도 접지 않고 가로 스크롤로 둔다. */
          <div className="overflow-x-auto">
            <div className="min-w-[36rem]">
            <div className="flex items-center px-4 py-2 bg-gray-50 border-y border-gray-100 text-[10px] font-semibold text-gray-500">
              <button onClick={() => setSort("name")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation flex-1 text-left hover:text-navy">
                매장 {sort === "name" && "↓"}
              </button>
              <button onClick={() => setSort("coupon")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-24 text-right hover:text-navy">
                쿠폰 사용 {sort === "coupon" && "↓"}
              </button>
              <button onClick={() => setSort("stamp")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-24 text-right hover:text-navy">
                스탬프 {sort === "stamp" && "↓"}
              </button>
              <button onClick={() => setSort("revisit")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-20 text-right hover:text-navy">
                재방문 {sort === "revisit" && "↓"}
              </button>
              <button onClick={() => setSort("loyal")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-20 text-right hover:text-navy">
                누적 단골 {sort === "loyal" && "↓"}
              </button>
            </div>
            <ul className="divide-y divide-gray-50">
              {rows.map((s) => {
                const silent =
                  !s.unavailable && s.coupon_redeemed_this_month === 0 && s.stamp_earned_this_month === 0;
                return (
                  <li key={s.restaurant_id} className="px-4 py-2.5 flex items-center">
                    <span className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 truncate">{s.name}</span>
                      {s.tier && <Chip tone={s.tier === "BOOST" ? "amber" : s.tier === "CONTENT" ? "indigo" : "gray"}>{s.tier}</Chip>}
                      {silent && <Chip tone="red">조용함</Chip>}
                    </span>
                    <MetricCell value={s.coupon_redeemed_this_month} max={max.coupon} unavailable={s.unavailable} />
                    <MetricCell value={s.stamp_earned_this_month} max={max.stamp} unavailable={s.unavailable} />
                    <span className="w-20 text-right text-xs text-gray-600 tabular-nums">
                      {s.unavailable ? <span className="text-gray-300">—</span> : s.revisit_this_month}
                    </span>
                    <span className="w-20 text-right text-xs text-gray-600 tabular-nums">
                      {s.unavailable ? <span className="text-gray-300">—</span> : s.loyal_total}
                    </span>
                  </li>
                );
              })}
            </ul>
            </div>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-gray-400 px-1">
        {generatedAt && `조회 시각 ${new Date(generatedAt).toLocaleString("ko-KR")} · `}
        인스타 성과는 Papillon 이 원본입니다. Probe 는 앱 안에서 일어난 일(쿠폰·스탬프·단골)만 봅니다 —
        같은 숫자를 두 곳에서 계산하면 반드시 달라집니다.
      </p>
    </div>
  );
}

/** 숫자 + 얇은 막대. 표만 있으면 어디가 큰지 안 보이고, 차트만 있으면 정확한 값을 못 읽는다. */
function MetricCell({ value, max, unavailable }: { value: number; max: number; unavailable?: boolean }) {
  if (unavailable)
    return (
      <span className="w-24 text-right text-xs text-gray-300" title="지표를 읽지 못했습니다">
        —
      </span>
    );
  return (
    <span className="w-24 text-right">
      <span className={`text-xs tabular-nums ${value === 0 ? "text-gray-300" : "text-gray-800 font-medium"}`}>
        {value.toLocaleString()}
      </span>
      <span className="block h-0.5 mt-1 ml-auto rounded-full bg-periwinkle/30" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </span>
  );
}
