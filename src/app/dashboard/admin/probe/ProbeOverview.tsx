"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import type { StoreMetric } from "@/lib/draft/types";
import { Button, Card, Chip, Empty, FilterPills, Kpi, Notice, PageHeader, Skeleton, Table, Td, Th } from "../_shared/ui";

/**
 * Probe · 매장 지표.
 *
 * 지금 이 숫자들은 Astro 매장 상세를 열어야만 한 곳씩 보인다. "이번 달 어느 매장이 죽어 있나"를 알려면 34번 클릭해야 한다.
 * 이 화면은 그 34번을 한 표로 바꾼다.
 *
 * 두 가지를 지킨다.
 *   · 0 과 '모름'을 섞지 않는다. 못 읽은 매장은 '-' 이고 합계에서도 뺀다. 0 으로 채우면 "이 매장 망했네" 같은 오판이 난다.
 *   · 총합보다 '조용한 매장'이 먼저다. 쿠폰도 스탬프도 0 인 제휴 매장. 영업이 다음 주에 전화 돌릴 목록이다.
 */

type SortKey = "name" | "coupon" | "stamp" | "loyal" | "revisit";

interface Totals {
  stores: number; affiliate: number; paid: number; free: number;
  coupon_redeemed: number; stamp_earned: number; loyal_total: number; revisit_this_month: number;
  unavailable: number; silent: number;
}

export default function ProbeOverview() {
  const [stores, setStores] = useState<StoreMetric[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "coupon", dir: "desc" });
  const [scope, setScope] = useState<"all" | "paid" | "free" | "silent">("all");
  const [generatedAt, setGeneratedAt] = useState("");
  const [source, setSource] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/probe/overview")
      .then((r) => r.json())
      .then((d) => {
        setStores(d.stores ?? []);
        setTotals(d.totals ?? null);
        setGeneratedAt(d.generated_at ?? "");
        setSource(d.source ?? "");
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    let list = stores.filter((s) => s.is_affiliate);
    const paid = (s: StoreMetric) => s.tier === "BOOST" || s.tier === "CONTENT";
    if (scope === "paid") list = list.filter(paid);
    if (scope === "free") list = list.filter((s) => !paid(s));
    if (scope === "silent") list = list.filter((s) => !s.unavailable && s.coupon_redeemed_this_month === 0 && s.stamp_earned_this_month === 0);
    const dir = sort.dir === "asc" ? 1 : -1;
    const num = (s: StoreMetric) =>
      sort.key === "coupon" ? s.coupon_redeemed_this_month : sort.key === "stamp" ? s.stamp_earned_this_month : sort.key === "loyal" ? s.loyal_total : s.revisit_this_month;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "ko") * dir;
      // 못 읽은 매장은 정렬 방향과 상관없이 맨 아래
      if (a.unavailable !== b.unavailable) return a.unavailable ? 1 : -1;
      return (num(a) - num(b)) * dir || a.name.localeCompare(b.name, "ko");
    });
  }, [stores, scope, sort]);

  const max = useMemo(
    () => ({
      coupon: Math.max(1, ...rows.map((r) => r.coupon_redeemed_this_month)),
      stamp: Math.max(1, ...rows.map((r) => r.stamp_earned_this_month)),
    }),
    [rows]
  );

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const allUnavailable = !loading && stores.length > 0 && totals?.unavailable === stores.length;

  return (
    <>
      <PageHeader
        title="매장 지표"
        description="앱 안에서 일어난 일(쿠폰·스탬프·단골)을 매장별로 봅니다. 인스타 성과는 Papillon 이 원본입니다."
        actions={<Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>}
      >
        <FilterPills
          label="범위"
          value={scope}
          onChange={setScope}
          options={[
            { key: "all", label: "제휴 전체", count: totals?.affiliate },
            { key: "paid", label: "유료", count: totals?.paid },
            { key: "free", label: "무료", count: totals?.free },
            { key: "silent", label: "조용한 매장", count: totals?.silent },
          ]}
        />
      </PageHeader>

      {allUnavailable && (
        <div className="mb-4">
          <Notice tone="amber" title="지표를 한 곳도 읽지 못했습니다">
            {source === "preview-snapshot"
              ? "미리보기 모드는 매장 목록만 갖고 있고 지표는 지어내지 않습니다. 백엔드에 붙이면 채워집니다."
              : "백엔드의 /api/dashboard/stats 가 응답하지 않습니다. 아래 표의 '-' 는 0 이 아니라 '모름'입니다."}
          </Notice>
        </div>
      )}

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-5">
        <Kpi label="제휴 매장" value={loading ? "-" : totals?.affiliate ?? 0} hint={`유료 ${totals?.paid ?? 0} · 무료 ${totals?.free ?? 0}곳`} />
        <Kpi label="조용한 매장" value={loading ? "-" : totals?.silent ?? 0} tone="alert" hint="이번 달 쿠폰·스탬프 0" onClick={() => setScope("silent")} active={scope === "silent"} />
        <Kpi label="쿠폰 사용" value={loading ? "-" : (totals?.coupon_redeemed ?? 0).toLocaleString()} suffix="건" hint="이번 달, 읽은 매장만" />
        <Kpi label="스탬프 적립" value={loading ? "-" : (totals?.stamp_earned ?? 0).toLocaleString()} suffix="건" hint="이번 달, 읽은 매장만" />
        <Kpi label="지표 못 읽음" value={loading ? "-" : totals?.unavailable ?? 0} suffix="곳" hint="0 이 아니라 모름" />
      </div>

      <Card flush title={`매장 ${rows.length}곳`} description="합계는 지표를 읽은 매장만으로 계산합니다.">
        {loading ? (
          <Skeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <Empty title={scope === "silent" ? "조용한 매장이 없습니다" : "지표를 불러오지 못했습니다"} detail={scope === "silent" ? "모든 제휴 매장에 이번 달 활동이 있습니다." : "백엔드 연결을 확인하세요."} />
        ) : (
          <Table minWidth="44rem">
            <thead>
              <tr>
                <Th onClick={() => toggle("name")} sorted={sort.key === "name" ? sort.dir : null}>매장</Th>
                <Th width="10rem" align="right" onClick={() => toggle("coupon")} sorted={sort.key === "coupon" ? sort.dir : null}>쿠폰 사용</Th>
                <Th width="10rem" align="right" onClick={() => toggle("stamp")} sorted={sort.key === "stamp" ? sort.dir : null}>스탬프</Th>
                <Th width="6rem" align="right" onClick={() => toggle("revisit")} sorted={sort.key === "revisit" ? sort.dir : null}>재방문</Th>
                <Th width="6rem" align="right" onClick={() => toggle("loyal")} sorted={sort.key === "loyal" ? sort.dir : null}>누적 단골</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const silent = !s.unavailable && s.coupon_redeemed_this_month === 0 && s.stamp_earned_this_month === 0;
                return (
                  <tr key={s.restaurant_id}>
                    <Td>
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{s.name}</span>
                        {s.tier && <Chip tone={s.tier === "BOOST" ? "amber" : s.tier === "CONTENT" ? "navy" : "gray"}>{s.tier}</Chip>}
                        {silent && <Chip tone="red">조용함</Chip>}
                      </span>
                    </Td>
                    <Td align="right"><Bar value={s.coupon_redeemed_this_month} max={max.coupon} unavailable={s.unavailable} /></Td>
                    <Td align="right"><Bar value={s.stamp_earned_this_month} max={max.stamp} unavailable={s.unavailable} /></Td>
                    <Td align="right" numeric className={s.unavailable ? "text-gray-300" : "text-gray-800"}>{s.unavailable ? "-" : s.revisit_this_month}</Td>
                    <Td align="right" numeric className={s.unavailable ? "text-gray-300" : "text-gray-800"}>{s.unavailable ? "-" : s.loyal_total}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {generatedAt && (
        <p className="text-[12px] text-gray-400 mt-3">
          {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt))} 기준 · 60초 캐시
        </p>
      )}
    </>
  );
}

/** 숫자 + 얇은 막대. 표만 있으면 어디가 큰지 안 보이고, 차트만 있으면 정확한 값을 못 읽는다. */
function Bar({ value, max, unavailable }: { value: number; max: number; unavailable?: boolean }) {
  if (unavailable) return <span className="text-gray-300" title="지표를 읽지 못했습니다">-</span>;
  return (
    <span className="inline-flex items-center gap-2 justify-end w-full">
      <span className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[5rem]">
        <span className="block h-full bg-navy/70 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className={`tabular-nums w-8 text-right ${value === 0 ? "text-gray-300" : "text-gray-800 font-medium"}`}>{value.toLocaleString()}</span>
    </span>
  );
}
