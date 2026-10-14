"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { planLabel, planTextClass, type StoreActivity, type StoreMetric } from "@/lib/draft/types";
import { campusOfMetric, failReasonLabel, isFailing, isSilent, summarizeActivity, summarizeStoreMetrics } from "@/lib/draft/storeMetrics";
import { allCampuses } from "../astro/CampusPicker";
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
 *     앱에서 숨긴 매장은 학생이 못 보니 0 이 당연하다 — 조용한 매장에서 빼고 「앱에서 숨김」으로 따로 모은다.
 *
 * 캠퍼스를 고르면 범위 숫자·KPI·표가 전부 그 캠퍼스 매장만으로 다시 센다 — "영남대 조용한 매장" 처럼 겹쳐 본다.
 *
 * GA4 칸 둘(1014) — DB 만으로는 0 인 매장이 왜 0 인지 모른다.
 *   · 상세 열람: 조용한 매장을 「안 보임」(열어 본 기기 0)과 「보고 안 씀」으로 가른다. 할 일이 다르다.
 *   · 사용 실패: 쿠폰 사용·스탬프 적립에 실패한 학생. DB 에는 흔적이 없다. 영업이 연락할 이유가 가장 분명한 숫자다.
 * GA4 는 `/api/probe/store-activity` 에서 따로 읽는다 — 늦거나 실패해도 DB 칸은 먼저 뜬다. 못 읽으면 '-'(모름).
 *
 * 지난달(1014) — 쿠폰 사용·스탬프 숫자 밑에 작은 줄로 「9월 N」. 백엔드 월별 스냅샷(한 달 전체)이다.
 * 이번 달 누계만 있으면 월초에 모든 매장이 「조용함」으로 뜨는데, 옆에 지난달이 있으면 달이 막 시작해서인지 바로 보인다.
 * 이번 달은 아직 다 안 흘렀으니 둘을 빼거나 나누지 않는다 — 나란히 놓기만 한다.
 */

type SortKey = "name" | "coupon" | "stamp" | "detail" | "failed" | "loyal" | "revisit";

/** GA4 칸 응답. window 가 null 이면 이번 달 확정 테이블이 아직 없다(매달 1일). */
interface ActivityState {
  ok: boolean;
  window: { from: string; to: string } | null;
  stores: Record<string, StoreActivity>;
  error?: string;
}

const NO_ACTIVITY: StoreActivity = { detail_devices: 0, failed_devices: 0, coupon_failed: 0, coupon_unresolved: 0, stamp_failed: 0, reasons: [] };
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
/** "2026-09" → "9월" */
const monthLabel = (period: string) => `${Number(period.slice(5, 7))}월`;

/** 지난달 줄의 출처 — `/api/probe/overview` 의 previous */
interface PreviousState {
  period: string;
  state: "ok" | "missing" | "unreadable";
  complete?: boolean;
  counted_at?: string | null;
}

export default function ProbeOverview() {
  const [stores, setStores] = useState<StoreMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "coupon", dir: "desc" });
  const [scope, setScope] = useState<"all" | "paid" | "free" | "silent" | "failing" | "hidden">("all");
  const [campus, setCampus] = useState<string>("all");
  const [generatedAt, setGeneratedAt] = useState("");
  const [source, setSource] = useState("");
  /** 매장 목록 자체를 못 읽었는가 — 그러면 모든 합계가 0 이지만 그건 모름이다 (0925) */
  const [storesUnreadable, setStoresUnreadable] = useState(false);
  const [testExcluded, setTestExcluded] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [previous, setPrevious] = useState<PreviousState | null>(null);
  /** GA4 칸 — null 은 부르는 중. DB 표와 따로 채운다 */
  const [activity, setActivity] = useState<ActivityState | null>(null);

  const load = () => {
    setLoading(true);
    setActivity(null);
    fetch("/api/probe/store-activity")
      .then((r) => r.json())
      .then((d) => setActivity({ ok: Boolean(d.ok), window: d.window ?? null, stores: d.stores ?? {}, error: d.error ?? d.detail }))
      .catch(() => setActivity({ ok: false, window: null, stores: {}, error: "GA4 를 읽지 못했습니다" }));
    fetch("/api/probe/overview")
      .then((r) => r.json())
      .then((d) => {
        setStores(d.stores ?? []);
        setGeneratedAt(d.generated_at ?? "");
        setSource(d.source ?? "");
        setStoresUnreadable(Boolean(d.stores_unreadable));
        setTestExcluded(Number(d.test_excluded) || 0);
        setTruncated(Boolean(d.stores_truncated));
        setPrevious(d.previous ?? null);
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  /** 기본 3곳 + 데이터에 있는 캠퍼스. 숫자는 제휴 매장 수 — '제휴 전체' 와 같은 기준이다. 목록을 못 읽었으면 0 이 아니라 비운다. */
  const campusOptions = useMemo(() => {
    const affiliate = stores.filter((s) => s.is_affiliate);
    const count = (c?: string) => (stores.length ? affiliate.filter((s) => !c || campusOfMetric(s) === c).length : undefined);
    return [{ key: "all", label: "캠퍼스 전체", count: count() }, ...allCampuses(affiliate.map((s) => s.campus)).map((c) => ({ key: c, label: c, count: count(c) }))];
  }, [stores]);
  const inCampus = useMemo(() => (campus === "all" ? stores : stores.filter((s) => campusOfMetric(s) === campus)), [stores, campus]);
  const totals = useMemo(() => (loading && !stores.length ? null : summarizeStoreMetrics(inCampus)), [inCampus, loading, stores.length]);
  /** 매장별 GA4 칸. 못 읽었거나 이번 달 테이블이 아직 없으면 null — 0 으로 채우면 전부 「안 보임」이 된다 */
  const act = activity?.ok && activity.window ? activity.stores : null;
  const ga = useMemo(() => summarizeActivity(inCampus, act), [inCampus, act]);

  const rows = useMemo(() => {
    let list = inCampus.filter((s) => s.is_affiliate);
    const paid = (s: StoreMetric) => s.tier === "BOOST" || s.tier === "CONTENT";
    if (scope === "paid") list = list.filter(paid);
    if (scope === "free") list = list.filter((s) => !paid(s));
    if (scope === "silent") list = list.filter(isSilent);
    if (scope === "failing") list = list.filter((s) => isFailing(s, act?.[String(s.restaurant_id)]));
    if (scope === "hidden") list = list.filter((s) => s.hidden_from_app);
    const dir = sort.dir === "asc" ? 1 : -1;
    const a = (s: StoreMetric) => act?.[String(s.restaurant_id)] ?? NO_ACTIVITY;
    const num = (s: StoreMetric) =>
      sort.key === "coupon" ? s.coupon_redeemed_this_month
      : sort.key === "stamp" ? s.stamp_earned_this_month
      : sort.key === "detail" ? a(s).detail_devices
      : sort.key === "failed" ? a(s).failed_devices
      : sort.key === "loyal" ? s.loyal_total
      : s.revisit_this_month;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "ko") * dir;
      // 못 읽은 매장은 정렬 방향과 상관없이 맨 아래
      if (a.unavailable !== b.unavailable) return a.unavailable ? 1 : -1;
      return (num(a) - num(b)) * dir || a.name.localeCompare(b.name, "ko");
    });
  }, [inCampus, scope, sort, act]);

  const max = useMemo(
    () => ({
      coupon: Math.max(1, ...rows.map((r) => r.coupon_redeemed_this_month)),
      stamp: Math.max(1, ...rows.map((r) => r.stamp_earned_this_month)),
    }),
    [rows]
  );

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const allUnavailable = !loading && stores.length > 0 && stores.every((s) => s.unavailable);

  return (
    <>
      <PageHeader
        title="매장 지표"
        description="앱 안에서 일어난 일(쿠폰·스탬프·단골)을 매장별로 봅니다. 인스타 성과는 Papillon 이 원본입니다."
        actions={<Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <FilterPills
            label="범위"
            value={scope}
            onChange={setScope}
            options={[
              { key: "all", label: "제휴 전체", count: totals?.affiliate },
              { key: "paid", label: "유료", count: totals?.paid },
              { key: "free", label: "무료", count: totals?.free },
              { key: "silent", label: "조용한 매장", count: totals?.silent },
              { key: "failing", label: "사용 실패", count: loading ? undefined : ga.failing ?? undefined },
              { key: "hidden", label: "앱에서 숨김", count: totals?.hidden },
            ]}
          />
          <span className="hidden sm:block w-px h-5 bg-gray-200" aria-hidden />
          <FilterPills
            label="캠퍼스"
            value={campus}
            onChange={setCampus}
            options={campusOptions}
          />
        </div>
      </PageHeader>

      {!loading && truncated && (
        <div className="mb-4">
          <Notice tone="amber" title="매장 목록이 잘렸습니다">
            백엔드가 안전 상한에서 목록을 잘랐습니다 — 이름순으로 뒤쪽 매장은 이 화면에 없습니다.
          </Notice>
        </div>
      )}

      {!loading && storesUnreadable && (
        <div className="mb-4">
          <Notice tone="red" title="매장 목록을 읽지 못했습니다">
            아래 숫자는 전부 비어 있습니다 — <b>0 이 아니라 모름</b>입니다. 새로고침해 주세요.
          </Notice>
        </div>
      )}

      {allUnavailable && (
        <div className="mb-4">
          <Notice tone="amber" title="지표를 한 곳도 읽지 못했습니다">
            {source === "preview-snapshot"
              ? "미리보기 모드는 매장 목록만 갖고 있고 지표는 지어내지 않습니다. 백엔드에 붙이면 채워집니다."
              : "백엔드의 매장 지표 집계(/api/dashboard/stats/bulk/)가 응답하지 않습니다. 아래 표의 '-' 는 0 이 아니라 '모름'입니다."}
          </Notice>
        </div>
      )}

      {/* 「지표 못 읽음」 칸은 1014 에 뺐다 — bulk 집계는 전부 읽거나 전부 못 읽어서(#309) 늘 0 이거나 전체였고, 전체일 때는 위 안내가 뜬다 */}
      <div className="sat-stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5">
        <Kpi label="제휴 매장" value={loading ? "-" : totals?.affiliate ?? 0} hint={`유료 ${totals?.paid ?? 0} · 무료 ${totals?.free ?? 0}곳`} />
        <Kpi
          label="조용한 매장"
          value={loading ? "-" : totals?.silent ?? 0}
          tone="alert"
          hint={ga.unseen === null ? "이번 달 쿠폰·스탬프 0" : `안 보임 ${ga.unseen} · 보고 안 씀 ${ga.seen_unused}`}
          onClick={() => setScope("silent")}
          active={scope === "silent"}
        />
        <Kpi
          label="사용 실패"
          value={loading || ga.failing === null ? "-" : ga.failing}
          suffix={loading || ga.failing === null ? undefined : "곳"}
          tone="alert"
          hint={ga.failing === null ? (activity ? "GA4 를 못 읽음" : "GA4 읽는 중") : ga.coupon_unresolved ? `아직 못 쓴 쿠폰 ${ga.coupon_unresolved}장` : "쿠폰 사용·스탬프 적립 실패"}
          onClick={() => setScope("failing")}
          active={scope === "failing"}
        />
        <Kpi label="이번 달 쿠폰 사용" value={loading ? "-" : (totals?.coupon_redeemed ?? 0).toLocaleString()} suffix="건" hint={prevHint(totals?.prev_coupon_redeemed, previous)} />
        <Kpi label="이번 달 스탬프 적립" value={loading ? "-" : (totals?.stamp_earned ?? 0).toLocaleString()} suffix="건" hint={prevHint(totals?.prev_stamp_earned, previous)} />
      </div>

      <Card flush title={`${campus === "all" ? "" : `${campus} `}매장 ${rows.length}곳`} description={`합계는 지표를 읽은 매장만으로 계산합니다. 앱에서 숨긴 매장은 조용한 매장에서 뺍니다. 상세 열람·사용 실패는 GA4 기기 수입니다.${testExcluded ? ` 테스트 매장 ${testExcluded}곳은 뺐습니다(Astro 와 같은 기준).` : ""}`}>
        {loading ? (
          <Skeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          // 매장이 아예 없을 때만 '못 불러옴'이다. 캠퍼스·범위를 좁혀서 빈 건 그 조건에 매장이 없는 것
          stores.length === 0 ? (
            <Empty title="지표를 불러오지 못했습니다" detail="백엔드 연결을 확인하세요." />
          ) : scope === "silent" ? (
            <Empty title="조용한 매장이 없습니다" detail={`${campus === "all" ? "모든" : campus} 제휴 매장에 이번 달 활동이 있습니다.`} />
          ) : scope === "failing" ? (
            act ? (
              <Empty title="사용 실패가 없습니다" detail={`${campus === "all" ? "모든" : campus} 제휴 매장에서 이번 달 쿠폰 사용·스탬프 적립 실패가 없습니다.`} />
            ) : (
              <Empty title="GA4 를 읽지 못했습니다" detail="사용 실패는 GA4 에만 있습니다. 아래 기간 줄을 확인하세요." />
            )
          ) : scope === "hidden" ? (
            <Empty title="앱에서 숨긴 매장이 없습니다" detail={`${campus === "all" ? "모든" : campus} 제휴 매장이 앱에 보입니다.`} />
          ) : (
            <Empty title="이 조건에 해당하는 매장이 없습니다" detail={campus === "all" ? "다른 범위를 눌러 보세요." : `${campus} 에는 아직 이 범위의 제휴 매장이 없습니다.`} />
          )
        ) : (
          <Table minWidth="52rem">
            <thead>
              <tr>
                <Th onClick={() => toggle("name")} sorted={sort.key === "name" ? sort.dir : null}>매장</Th>
                <Th width="8rem" align="right" onClick={() => toggle("coupon")} sorted={sort.key === "coupon" ? sort.dir : null}>쿠폰 사용</Th>
                <Th width="8rem" align="right" onClick={() => toggle("stamp")} sorted={sort.key === "stamp" ? sort.dir : null}>스탬프</Th>
                <Th width="6rem" align="right" onClick={() => toggle("detail")} sorted={sort.key === "detail" ? sort.dir : null}>상세 열람</Th>
                <Th width="8rem" align="right" onClick={() => toggle("failed")} sorted={sort.key === "failed" ? sort.dir : null}>사용 실패</Th>
                <Th width="6rem" align="right" onClick={() => toggle("revisit")} sorted={sort.key === "revisit" ? sort.dir : null}>재방문</Th>
                <Th width="6rem" align="right" onClick={() => toggle("loyal")} sorted={sort.key === "loyal" ? sort.dir : null}>누적 단골</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const silent = isSilent(s);
                const a = act ? act[String(s.restaurant_id)] ?? NO_ACTIVITY : null;
                return (
                  <tr key={s.restaurant_id}>
                    <Td>
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{s.name}</span>
                        {/* Astro 매장 목록과 같은 이름 · 색 — Boost 남색 · Premium 주황 (types.ts planLabel) */}
                        {s.tier && <span className={`text-[12px] font-semibold ${planTextClass(s.tier)}`}>{planLabel(s.tier)}</span>}
                        {silent && <Chip tone="red">조용함</Chip>}
                        {/* Astro 매장 목록과 같은 이름 · 색 */}
                        {s.hidden_from_app && <Chip tone="amber">앱에서 숨김</Chip>}
                      </span>
                    </Td>
                    <Td align="right">
                      <Bar value={s.coupon_redeemed_this_month} max={max.coupon} unavailable={s.unavailable} />
                      <PrevLine n={s.prev?.coupon_redeemed} previous={previous} />
                    </Td>
                    <Td align="right">
                      <Bar value={s.stamp_earned_this_month} max={max.stamp} unavailable={s.unavailable} />
                      <PrevLine n={s.prev?.stamp_earned} previous={previous} />
                    </Td>
                    <Td align="right" numeric className={!a || !a.detail_devices ? "text-gray-300" : "text-gray-800"}>{a ? a.detail_devices : "-"}</Td>
                    <Td align="right"><Failed a={a} /></Td>
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
      {previous && !loading && (
        <p className="text-[12px] text-gray-400 mt-1">
          {previous.state === "ok"
            ? `숫자 밑 「${monthLabel(previous.period)} N」은 지난달 한 달 전체(월별 스냅샷${previous.counted_at ? ` · ${md(previous.counted_at)} 기준` : ""}${previous.complete ? "" : " · 아직 굳기 전"})입니다.`
            : previous.state === "missing"
              ? `${monthLabel(previous.period)} 월별 스냅샷이 아직 없어 지난달 줄을 비웠습니다.`
              : "월별 스냅샷을 읽지 못해 지난달 줄을 비웠습니다 — 0 이 아니라 모름입니다."}
        </p>
      )}
      <p className="text-[12px] text-gray-400 mt-1">
        {!activity
          ? "상세 열람·사용 실패(GA4)를 읽는 중입니다."
          : !activity.ok
            ? `상세 열람·사용 실패(GA4)를 읽지 못했습니다 — '-' 는 0 이 아니라 모름입니다.${activity.error ? ` (${activity.error})` : ""}`
            : !activity.window
              ? "이번 달 GA4 확정 테이블이 아직 없어 상세 열람·사용 실패가 비어 있습니다(매달 1일)."
              : `상세 열람·사용 실패: GA4 ${md(activity.window.from)}~${md(activity.window.to)} · 기기 단위 · 확정 테이블이라 오늘은 빠집니다. 쿠폰 사용·스탬프는 DB 이번 달(지금까지).`}
      </p>
    </>
  );
}

/** KPI 밑 「9월 전체 N건」. 지난달을 못 읽었으면 그렇다고만 — 0 으로 적지 않는다. */
function prevHint(n: number | null | undefined, previous: PreviousState | null): string {
  if (!previous) return "";
  if (previous.state !== "ok" || n == null) return "지난달 모름";
  return `${monthLabel(previous.period)} 전체 ${n.toLocaleString()}건`;
}

/** 숫자 밑 작은 줄 「9월 12」 — 지난달 한 달 전체. 못 읽었으면 안 그린다(아래 기간 줄이 이유를 말한다). */
function PrevLine({ n, previous }: { n: number | undefined; previous: PreviousState | null }) {
  if (previous?.state !== "ok" || n === undefined) return null;
  return <span className={`block text-[11px] tabular-nums mt-0.5 ${n ? "text-gray-500" : "text-gray-300"}`}>{monthLabel(previous.period)} {n.toLocaleString()}</span>;
}

/**
 * 사용 실패 칸 — 실패를 겪은 기기 수와 이유. 실패한 뒤 아직 못 쓴 쿠폰이 있으면 빨갛다(아직 해결 안 된 학생이 있다).
 * 이유는 작은 글씨로 늘 보인다 — 서버 오류·네트워크는 매장 탓이 아니라 연락하기 전에 봐야 한다.
 */
function Failed({ a }: { a: StoreActivity | null }) {
  if (!a) return <span className="text-gray-300" title="GA4 를 읽지 못했습니다">-</span>;
  if (!a.failed_devices) return <span className="tabular-nums text-gray-300">0</span>;
  const detail = [
    a.coupon_failed ? `쿠폰 사용 실패 ${a.coupon_failed}건` : "",
    a.coupon_unresolved ? `그중 아직 못 쓴 쿠폰 ${a.coupon_unresolved}장` : "",
    a.stamp_failed ? `스탬프 적립 실패 ${a.stamp_failed}건` : "",
  ].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={detail}>
      <span className={`tabular-nums font-semibold ${a.coupon_unresolved ? "text-red-600" : "text-gray-800"}`}>{a.failed_devices}</span>
      <span className="text-[11px] text-gray-500 break-keep">{a.reasons.map(failReasonLabel).join(" · ")}</span>
    </span>
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
