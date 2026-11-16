"use client";

import { useEffect, useMemo, useState } from "react";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import type { StoreActivity, StoreMetric } from "@/lib/draft/types";
import { campusOfMetric, failReasonLabel, isFailing, isSilent, previousPeriod, summarizeActivity, summarizeStoreMetrics } from "@/lib/draft/storeMetrics";
import { allCampuses } from "../astro/CampusPicker";
import { Button, Card, Chip, Empty, FilterPills, Notice, PageHeader, Skeleton, SlideOver, Table, Td, Th, periodLocal, rowClickable } from "../_shared/ui";
import { AsOf, BAR_INK, BAR_NOW, BAR_PAST, Fold, FlowCard, MetricBox, PanelSection, PlanTag, Pending, TagChip, Unknown, takeParam } from "./kit";
import { flowOf } from "@/lib/bigquery/liveShape";
import { fetchJson } from "../_shared/fetchJson";
import type { StoreMonth } from "@/app/api/probe/store-history/route";

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
 * 1022 목업: 행을 누르면 그 매장 하나의 기록(매장 패널)이 열린다. 사장님 월간 보고서 링크는 표에서 빼 「매장 리포트 → 매장 월간 보고서」 탭으로 옮겼고
 * (표에 두면 이름 옆 링크가 22줄 늘어서 영업용 캡처가 된다), 누적 단골 열은 패널로 갔다. 「식사권 사용」 열을 더했다(앱 마일리지 기록).
 * 마일리지 적립한 사람 · 혜택 수 · 쓴 사람은 백엔드 집계가 아직 없다(개발 중) — 칸을 지어내지 않는다.
 *
 * 지난달(1014) — 쿠폰 사용·스탬프 숫자 밑에 작은 줄로 「9월 N」. 백엔드 월별 스냅샷(한 달 전체)이다.
 * 이번 달 누계만 있으면 월초에 모든 매장이 「조용함」으로 뜨는데, 옆에 지난달이 있으면 달이 막 시작해서인지 바로 보인다.
 * 이번 달은 아직 다 안 흘렀으니 둘을 빼거나 나누지 않는다 — 나란히 놓기만 한다.
 *
 * 1116 민찬: 직관적으로 · 지금의 흐름을 숫자 + 그래프로 · 간단하게(실시간 지표 #389 와 같은 결).
 *   ① 매장 상태 한 줄 — 제휴 매장이 「쓰임 · 보고 안 씀 · 안 보임 · 앱에서 숨김」으로 어떻게 나뉘는지 띠 하나. 조각을 누르면 그 범위로 좁힌다
 *   ② 이번 달 흐름 두 칸 — 쿠폰 사용 · 스탬프 적립. 숫자 + 「지난달 이맘때」와 견준 말 + 매장별 몫(이름 없이, 1116 점검 C1)
 *   ③ 표는 다섯 열(매장 · 쿠폰 · 스탬프 · 상세 열람 · 사용 실패). 식사권 · 마일리지 · 혜택 수 · 재방문은 행을 눌러 여는 매장 패널에 있다
 * 「지난달 이맘때」 = 지난달 1일부터 오늘과 같은 날짜까지(같은 길이라 견줘도 된다). 차이가 ±2√(합) 안이면 「비슷」(flowOf).
 * 읽는 법 · 출처 줄은 표 아래에 접어 둔다.
 */

type SortKey = "name" | "coupon" | "stamp" | "detail" | "failed";

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

/** 식사권은 쿠폰 사용에 섞여 있다 — 알면 뺀 「쿠폰 사용(식사권 제외)」, 모르면(옛 백엔드) 그대로. 정산은 「마일리지 추첨」에서 본다 */
const couponNet = (s: StoreMetric) => s.coupon_redeemed_this_month - (s.voucher_redeemed ?? 0);
const prevCouponNet = (s: StoreMetric) => (s.prev_same ? s.prev_same.coupon_redeemed - s.prev_same.voucher_redeemed : null);

/** 지난달 줄의 출처 — `/api/probe/overview` 의 previous */
interface PreviousState {
  period: string;
  state: "ok" | "missing" | "unreadable";
  complete?: boolean;
  counted_at?: string | null;
}

/** `/api/probe/overview` 응답 — 화면이 읽는 칸만 */
interface OverviewPayload {
  stores?: StoreMetric[];
  generated_at?: string;
  source?: string;
  stores_unreadable?: boolean;
  test_excluded?: number;
  stores_truncated?: boolean;
  previous?: PreviousState | null;
}
type VoucherRow = { coupon_code: string | null; user_id: number; expires_at: string | null; status: string | null; redeemed_at: string | null; restaurant_id: number | null };

export default function ProbeOverview({ onGo }: { onGo?: (tab: string) => void }) {
  const [stores, setStores] = useState<StoreMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "coupon", dir: "desc" });
  type Scope = "all" | "paid" | "free" | "silent" | "failing" | "hidden";
  const [scope, setScope] = useState<Scope>(() => { const v = takeParam("scope"); return v === "paid" || v === "free" || v === "silent" || v === "failing" || v === "hidden" ? v : "all"; });
  /** 홈 「캠페인 편입」 같은 곳에서 `?store=<id>` 로 그 매장 패널을 바로 연다 */
  const [openId, setOpenId] = useState<number | null>(() => { const v = takeParam("store"); return v && /^\d+$/.test(v) ? Number(v) : null; });
  /** 이번 달 식사권 사용(장) — 앱 마일리지 기록. null 은 못 읽음(0 이 아니라 모름) */
  const [vouchers, setVouchers] = useState<Record<string, number> | null>(null);
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

  /**
   * 처음 열 때는 fetchJson 으로 — 런처(Polaris) · Probe 홈이 방금 읽었거나 읽는 중인 같은 주소와 합친다(1027).
   * 전에는 그냥 fetch 라 홈에서 아직 만들고 있는 것을 처음부터 한 벌 더 만들게 했다. 「다시 불러오기」는 새로 읽는다.
   * fetchJson 은 못 읽으면 null 을 준다 — 0 이 아니라 모름으로 그린다.
   */
  const load = (fresh = false) => {
    setLoading(true);
    setActivity(null);
    fetchJson<{ ok?: boolean; window?: ActivityState["window"]; stores?: ActivityState["stores"]; error?: string; detail?: string }>("/api/probe/store-activity", { fresh })
      .then((d) => setActivity(d ? { ok: Boolean(d.ok), window: d.window ?? null, stores: d.stores ?? {}, error: d.error ?? d.detail } : { ok: false, window: null, stores: {}, error: "GA4 를 읽지 못했습니다" }));
    setVouchers(null);
    fetchJson<{ progress?: Record<string, { vouchers: VoucherRow[] }> | null }>("/api/probe/mileage", { fresh })
      .then((d) => {
        if (!d?.progress) { setVouchers(null); return; }
        const month = periodLocal();
        const seen = new Set<string>(); const by: Record<string, number> = {};
        for (const day of Object.values(d.progress)) for (const x of day.vouchers) {
          const key = x.coupon_code ?? `u${x.user_id}-${x.expires_at}`;
          if (seen.has(key) || x.status !== "REDEEMED" || !x.redeemed_at?.startsWith(month) || x.restaurant_id == null) continue;
          seen.add(key); by[String(x.restaurant_id)] = (by[String(x.restaurant_id)] ?? 0) + 1;
        }
        setVouchers(by);
      });
    fetchJson<OverviewPayload>("/api/probe/overview", { fresh })
      .then((d) => {
        if (!d) { setStores([]); setStoresUnreadable(true); return; }
        setStores(d.stores ?? []);
        setGeneratedAt(d.generated_at ?? "");
        setSource(d.source ?? "");
        setStoresUnreadable(Boolean(d.stores_unreadable));
        setTestExcluded(Number(d.test_excluded) || 0);
        setTruncated(Boolean(d.stores_truncated));
        setPrevious(d.previous ?? null);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

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
      sort.key === "coupon" ? couponNet(s)
      : sort.key === "stamp" ? s.stamp_earned_this_month
      : sort.key === "detail" ? a(s).detail_devices
      : a(s).failed_devices;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "ko") * dir;
      // 못 읽은 매장은 정렬 방향과 상관없이 맨 아래
      if (a.unavailable !== b.unavailable) return a.unavailable ? 1 : -1;
      return (num(a) - num(b)) * dir || a.name.localeCompare(b.name, "ko");
    });
  }, [inCampus, scope, sort, act]);

  const max = useMemo(
    () => ({
      coupon: Math.max(1, ...rows.map((r) => couponNet(r))),
      stamp: Math.max(1, ...rows.map((r) => r.stamp_earned_this_month)),
    }),
    [rows]
  );
  /** 사장님 보고서는 다 끝난 달만 — 지난달(KST) */
  const reportPeriod = previousPeriod();
  const live = inCampus.filter((s) => !s.unavailable);
  const netCoupon = live.reduce((a, s) => a + couponNet(s), 0);
  /** 지난달 같은 날짜까지의 합 — 한 곳이라도 못 읽었으면 null(일부만 더하면 틀린 합) */
  const sameOk = inCampus.length > 0 && inCampus.every((s) => s.prev_same);
  const prevNet = sameOk ? inCampus.reduce((a, s) => a + (prevCouponNet(s) ?? 0), 0) : null;
  const prevStamp = sameOk ? inCampus.reduce((a, s) => a + (s.prev_same?.stamp_earned ?? 0), 0) : null;
  const silentPaid = inCampus.filter((s) => isSilent(s) && (s.tier === "BOOST" || s.tier === "CONTENT")).length;
  // 매장 상태 띠 — 제휴 매장을 겹치지 않게 넷(+ 못 읽음)으로 나눈다
  const aff = inCampus.filter((s) => s.is_affiliate);
  const nHidden = aff.filter((s) => s.hidden_from_app).length;
  const nSilent = aff.filter(isSilent).length;
  const nUsed = aff.filter((s) => !s.unavailable && !s.hidden_from_app && !isSilent(s)).length;
  const nUnknown = aff.length - nHidden - nSilent - nUsed;
  const segments: { key: string; label: string; n: number; color: string; scope?: Scope; why: string }[] = [
    { key: "used", label: "쓰임", n: nUsed, color: BAR_NOW, why: "이번 달 쿠폰이나 스탬프가 한 번이라도 쓰인 매장" },
    ...(ga.unseen === null || ga.seen_unused === null
      ? [{ key: "silent", label: "조용함", n: nSilent, color: "#FBBF24", scope: "silent" as Scope, why: "이번 달 쿠폰 · 스탬프 0" }]
      : [
          { key: "seen", label: "보고 안 씀", n: ga.seen_unused, color: "#FBBF24", scope: "silent" as Scope, why: "상세는 열어 봤지만 쿠폰 · 스탬프 0 — 혜택 · 안내를 볼 곳" },
          { key: "unseen", label: "안 보임", n: ga.unseen, color: "#F87171", scope: "silent" as Scope, why: "상세를 연 기기도 0 — 노출을 볼 곳" },
        ]),
    { key: "hidden", label: "앱에서 숨김", n: nHidden, color: "#D1D5DB", scope: "hidden", why: "학생에게 안 보이는 매장" },
    ...(nUnknown > 0 ? [{ key: "unknown", label: "미확인", n: nUnknown, color: "#E5E7EB", why: "지표를 읽지 못한 매장 — 0 이 아니라 모름" }] : []),
  ];
  const stampNow = totals?.stamp_earned ?? 0;
  /**
   * 매장별 몫 — 이름 없이 건수만, 많은 순(1116 점검 C1). 매장 이름과 순서가 화면 맨 위에 크게 나오면 캡처 한 장이 동종 매장 순위가 된다
   * (월간 보고서 탭 · 매장 패널이 비교를 일부러 뺀 까닭). 쏠림만 보이면 된다 — 어느 매장인지는 아래 표에서 본다.
   */
  const shares = (value: (s: StoreMetric) => number) => aff.filter((s) => !s.unavailable && value(s) > 0).map(value).sort((a, b) => b - a);
  const prevMonth = previous?.state === "ok" ? monthLabel(previous.period) : null;
  const openStore = stores.find((s) => s.restaurant_id === openId) ?? null;

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const allUnavailable = !loading && stores.length > 0 && stores.every((s) => s.unavailable);
  const th = (key: SortKey, label: string, width: string) => <Th width={width} align="right" onClick={() => toggle(key)} sorted={sort.key === key ? sort.dir : null}>{label}</Th>;

  return (
    <>
      <PageHeader
        title="매장 지표"
        description="이번 달 앱에서 쿠폰 · 스탬프가 어느 매장에서 쓰였는지 봅니다. 행을 누르면 그 매장의 기록이 열립니다."
        actions={<><AsOf at={generatedAt} /><Button icon={<IconRefresh />} onClick={() => load(true)} disabled={loading}>다시 읽기</Button></>}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <FilterPills
            soft
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
            soft
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
              : "백엔드의 매장 지표 집계(/api/dashboard/stats/bulk/)가 응답하지 않습니다. 아래 표의 「미확인」은 0 이 아니라 '모름'입니다."}
          </Notice>
        </div>
      )}

      {/* 못 읽은 출처는 화면마다 같은 자리 — 머리 바로 아래에서 먼저 말한다(1022 목업). 「지표 못 읽음」 칸은 1014 에 뺐다 — bulk 집계는 전부 읽거나 전부 못 읽어서(#309) */}
      {!loading && activity && !activity.ok && (
        <div className="mb-4">
          <Notice tone="amber" title="GA4(BigQuery)를 읽지 못했습니다">
            상세 열람 · 사용 실패 칸은 0 이 아니라 모름입니다. 쿠폰 사용 · 스탬프(DB)는 그대로 읽었습니다.{activity.error ? ` (${activity.error})` : ""}
          </Notice>
        </div>
      )}
      <div className="mb-4">
        <Card>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-center">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">이번 달 쓰인 매장</p>
              <p className="text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums text-gray-900 mt-2">
                {loading ? "-" : storesUnreadable ? "미확인" : nUsed}{!storesUnreadable && <span className="text-[15px] font-semibold text-gray-400 ml-1">/ {loading ? "-" : aff.length}곳</span>}
              </p>
              <p className="text-[12px] text-gray-500 mt-1.5">{campus === "all" ? "제휴 매장" : `${campus} 제휴 매장`} · 유료 {totals?.paid ?? 0} · 무료 {totals?.free ?? 0}</p>
            </div>
            <div className="min-w-0">
              {loading ? <div className="h-16 rounded-lg bg-black/[0.03] animate-pulse" /> : aff.length === 0 ? <p className="text-[13px] text-gray-500">{storesUnreadable ? "읽지 못했습니다 — 0 이 아니라 모름입니다." : "이 조건에 제휴 매장이 없습니다."}</p> : (
                <>
                  <div className="flex h-7 w-full overflow-hidden rounded-md" role="img" aria-label={segments.map((g) => `${g.label} ${g.n}곳`).join(", ")}>
                    {segments.filter((g) => g.n > 0).map((g) => (
                      <span key={g.key} title={`${g.label} ${g.n}곳 — ${g.why}`} className="h-full border-r-2 border-white last:border-r-0" style={{ width: `${(g.n / aff.length) * 100}%`, background: g.color }} />
                    ))}
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
                    {segments.map((g) => {
                      const body = <><span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: g.color }} /><span className="text-gray-700">{g.label}</span><b className="tabular-nums text-gray-900">{g.n}</b></>;
                      return (
                        <li key={g.key} title={g.why}>
                          {g.scope ? <button type="button" onClick={() => setScope(g.scope!)} className="inline-flex items-center gap-1.5 text-[13px] hover:underline">{body}</button>
                            : <span className="inline-flex items-center gap-1.5 text-[13px]">{body}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[12px] text-gray-500 mt-2">
                    {silentPaid > 0 && <>조용한 매장 중 <b className="font-semibold text-gray-800">유료 {silentPaid}곳</b>. </>}
                    {ga.failing === null ? (activity ? "사용 실패는 읽지 못했습니다(미확인)." : "사용 실패를 읽는 중입니다.")
                      : ga.failing === 0 ? "쿠폰 사용 · 스탬프 적립 실패는 없습니다."
                      : <button type="button" onClick={() => setScope("failing")} className="font-semibold text-red-600 hover:underline">사용 실패 {ga.failing}곳{ga.coupon_unresolved ? ` · 아직 못 쓴 쿠폰 ${ga.coupon_unresolved}장` : ""} →</button>}
                  </p>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      <p className="text-[13px] font-semibold text-gray-900 mb-2">이번 달 흐름</p>
      <div className="grid gap-4 lg:grid-cols-2 items-start mb-5">
        <MonthCard title="쿠폰 사용" value={loading || storesUnreadable ? null : netCoupon} unit="건" prev={prevNet} prevMonth={prevMonth} note="식사권 제외" shares={shares(couponNet)} loading={loading} />
        <MonthCard title="스탬프 적립" value={loading || storesUnreadable ? null : stampNow} unit="건" prev={prevStamp} prevMonth={prevMonth} shares={shares((s) => s.stamp_earned_this_month)} loading={loading} />
      </div>

      <Card flush title={`${campus === "all" ? "" : `${campus} `}매장 ${rows.length}곳`} description="행을 누르면 식사권 · 혜택 수 · 재방문 · 월별 기록까지 열립니다.">
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
          <>
          {/* 폰 — 매장 한 곳이 두 줄(1116 점검 B10). 표를 쌓으면 한 곳이 다섯 줄이라 45곳이면 화면 열 장이 넘는다 */}
          <ul className="sm:hidden divide-y divide-black/[0.05]">
            {rows.map((s) => {
              const a = act ? act[String(s.restaurant_id)] ?? NO_ACTIVITY : null;
              const n = (v: number) => <b className={`font-semibold ${v ? "text-gray-900" : "text-gray-500"}`}>{v.toLocaleString()}</b>;
              return (
                <li key={s.restaurant_id}>
                  <button type="button" onClick={() => setOpenId(s.restaurant_id)} className="w-full text-left px-4 py-2.5">
                    <span className="flex items-center gap-1.5 flex-wrap"><span className="font-semibold text-gray-900 text-[14px]">{s.name}</span><StoreTags s={s} /></span>
                    <span className="block text-[12.5px] text-gray-600 tabular-nums mt-0.5">
                      {s.unavailable ? <>지표 <Unknown /></> : <>쿠폰 {n(couponNet(s))} · 스탬프 {n(s.stamp_earned_this_month)}</>}
                      {" · "}열람 {a ? n(a.detail_devices) : <Unknown />}
                      {" · "}실패 {a ? <b className={`font-semibold ${a.failed_devices ? (a.coupon_unresolved ? "text-amber-800" : "text-gray-900") : "text-gray-500"}`}>{a.failed_devices}</b> : <Unknown />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block">
          <Table minWidth="44rem">
            <thead>
              <tr>
                <Th onClick={() => toggle("name")} sorted={sort.key === "name" ? sort.dir : null}>매장</Th>
                {th("coupon", "쿠폰 사용(식사권 제외)", "8.5rem")}
                {th("stamp", "스탬프", "7.5rem")}
                {th("detail", "상세 열람", "6rem")}
                {th("failed", "사용 실패", "8rem")}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const a = act ? act[String(s.restaurant_id)] ?? NO_ACTIVITY : null;
                return (
                  <tr key={s.restaurant_id} className={rowClickable} onClick={() => setOpenId(s.restaurant_id)}>
                    <Td>
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{s.name}</span>
                        <StoreTags s={s} />
                      </span>
                    </Td>
                    <Td align="right">
                      <Bar value={couponNet(s)} max={max.coupon} unavailable={s.unavailable} />
                      {(couponNet(s) > 0 || (prevCouponNet(s) ?? s.prev?.coupon_redeemed ?? 0) > 0) && <span className="block text-[11px] tabular-nums mt-0.5 text-gray-500">{[s.coupon_users != null ? `${s.coupon_users.toLocaleString()}명` : "", prevNote(prevCouponNet(s), s.prev?.coupon_redeemed, previous)].filter(Boolean).join(" · ")}</span>}
                    </Td>
                    <Td align="right">
                      <Bar value={s.stamp_earned_this_month} max={max.stamp} unavailable={s.unavailable} />
                      {(s.stamp_earned_this_month > 0 || (s.prev_same?.stamp_earned ?? s.prev?.stamp_earned ?? 0) > 0) && <span className="block text-[11px] tabular-nums mt-0.5 text-gray-500">{prevNote(s.prev_same?.stamp_earned ?? null, s.prev?.stamp_earned, previous)}</span>}
                    </Td>
                    <Td align="right" numeric className={!a || !a.detail_devices ? "text-gray-500" : "text-gray-800"}>{a ? a.detail_devices : <Unknown why="GA4 를 읽지 못했습니다" />}</Td>
                    <Td align="right"><Failed a={a} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </div>
          </>
        )}
      </Card>

      <Fold label="숫자 읽는 법 · 출처">
        <p className="text-[12px] text-gray-500 mt-1">
          「쓰임」은 이번 달 쿠폰이나 스탬프가 한 번이라도 쓰인 매장, 「보고 안 씀」은 상세를 연 기기는 있는데 둘 다 0, 「안 보임」은 상세를 연 기기도 0 인 매장입니다. 앱에서 숨긴 매장은 조용한 매장에서 뺍니다.
          「지난달 이맘때」는 지난달 1일부터 오늘과 같은 날짜까지이고, 차이가 크지 않으면 「비슷」으로 봅니다. 합계는 지표를 읽은 매장만으로 계산합니다.{testExcluded ? ` 테스트 매장 ${testExcluded}곳은 뺐습니다(Astro 와 같은 기준).` : ""}
        </p>
      {generatedAt && (
        <p className="text-[12px] text-gray-500 mt-1">
          {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt))} 기준 · 60초 캐시
        </p>
      )}
      {previous && !loading && (
        <p className="text-[12px] text-gray-500 mt-1">
          {previous.state === "ok"
            ? stores.some((s) => s.prev_same)
              ? `숫자 밑 「${monthLabel(previous.period)} 같은 날까지 N」은 지난달 1일부터 오늘과 같은 날짜까지입니다 — 달 중순에 지난달 한 달 전체와 견주면 늘 줄어 보입니다. 쿠폰 사용 밑 「N명」은 쓴 사람(계정)이고, 스탬프 보상 쿠폰은 매장이 건 혜택이라 쿠폰 사용에 남기고 식사권만 뺐습니다(식사권 정산은 「마일리지 추첨」).`
              : `숫자 밑 「${monthLabel(previous.period)} N」은 지난달 한 달 전체(월별 스냅샷${previous.counted_at ? ` · ${md(previous.counted_at)} 기준` : ""}${previous.complete ? "" : " · 아직 굳기 전"})입니다.`
            : previous.state === "missing"
              ? `${monthLabel(previous.period)} 월별 스냅샷이 아직 없어 지난달 줄을 비웠습니다.`
              : "월별 스냅샷을 읽지 못해 지난달 줄을 비웠습니다 — 0 이 아니라 모름입니다."}
        </p>
      )}
      <p className="text-[12px] text-gray-500 mt-1">이름 옆 표지는 유료 플랜입니다 — <PlanTag tier="CONTENT" /> (최고 등급) · <PlanTag tier="BOOST" />. 무료 매장은 표지가 없고, 위 「무료」 범위로 따로 볼 수 있습니다. 식사권은 앱 마일리지 기록의 이번 달 사용 장 수입니다.</p>
      <p className="text-[12px] text-gray-500 mt-1">
        {!activity
          ? "상세 열람·사용 실패(GA4)를 읽는 중입니다."
          : !activity.ok
            ? `상세 열람·사용 실패(GA4)를 읽지 못했습니다 — 「미확인」은 0 이 아니라 모름입니다.${activity.error ? ` (${activity.error})` : ""}`
            : !activity.window
              ? "이번 달 GA4 확정 테이블이 아직 없어 상세 열람·사용 실패가 비어 있습니다(매달 1일)."
              : `상세 열람·사용 실패: GA4 ${md(activity.window.from)}~${md(activity.window.to)} · 기기 단위 · 확정 테이블이라 오늘은 빠집니다. 쿠폰 사용·스탬프는 DB 이번 달(지금까지).`}
      </p>

      </Fold>

      {openStore && <StorePanel s={openStore} a={act ? act[String(openStore.restaurant_id)] ?? NO_ACTIVITY : null} vouchers={vouchers ? vouchers[String(openStore.restaurant_id)] ?? 0 : null} previous={previous} reportPeriod={reportPeriod} onClose={() => setOpenId(null)} onGo={onGo} />}
    </>
  );
}

/**
 * 매장 패널 — 그 매장 하나의 기록. 순위 · 평균 대비는 넣지 않는다: 리포트나 영업 자료로 나가면 두 계약 모두 금지한 동종 매장 비교가 된다.
 * 계약 판 · 계약 기간 누적은 넣지 않는다 — Probe 는 앱 안 기록만 본다(민찬 1023). 계약은 Astro 매장 상세에서 본다(1116 점검 C3).
 */
function StorePanel({ s, a, vouchers, previous, reportPeriod, onClose, onGo }: { s: StoreMetric; a: StoreActivity | null; vouchers: number | null; previous: PreviousState | null; reportPeriod: string; onClose: () => void; onGo?: (tab: string) => void }) {
  const prevOk = previous?.state === "ok" && s.prev;
  const [hist, setHist] = useState<StoreMonth[] | null | false>(null);
  useEffect(() => {
    setHist(null);
    fetch(`/api/probe/store-history?rid=${s.restaurant_id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("history")))).then((d: { months: StoreMonth[] }) => setHist(d.months)).catch(() => setHist(false));
  }, [s.restaurant_id]);
  // 굳은 달 + 이번 달(지금까지, 라이브). 이번 달이 굳은 달에 이미 있으면 라이브 값으로 덮는다
  const thisPeriod = periodLocal();
  const months = hist ? [...hist.filter((m) => m.period !== thisPeriod).map((m) => ({ period: m.period, c: m.coupon_redeemed - (m.voucher_redeemed ?? 0), cu: m.coupon_users, s: m.stamp_earned, v: m.voucher_redeemed, me: m.mileage_earners, partial: false })),
    { period: thisPeriod, c: couponNet(s), cu: s.coupon_users ?? null, s: s.stamp_earned_this_month, v: s.voucher_redeemed ?? null, me: s.mileage_earners ?? null, partial: true }] : null;
  const sumOf = (k: "c" | "s" | "v" | "cu" | "me") => (months ? months.reduce((a, m) => a + (m[k] ?? 0), 0) : 0);
  /** 칸이 한 달이라도 NULL(굳기 전·옛 달)이면 합은 일부만 더한 값이다 — 그렇다고 적는다 */
  const partialSum = (k: "v" | "cu" | "me") => (months ? months.some((m) => m[k] === null) : false);
  return (
    <SlideOver open onClose={onClose} title={s.name} subtitle={`${campusOfMetric(s)}${s.tier ? "" : " · 플랜 미지정"}`} width="lg"
      badge={<span className="inline-flex items-center gap-1.5"><PlanTag tier={s.tier} />{isSilent(s) && <TagChip>조용함</TagChip>}{s.hidden_from_app && <TagChip>앱에서 숨김</TagChip>}</span>}
      footer={<>
        <a href={`/r/store/${s.restaurant_id}?month=${reportPeriod}`} target="_blank" rel="noreferrer" title="사장님께 보낼 지난달 앱 기록 — 미리보기 위 띠에서 PNG · HTML"><Button variant="primary" icon={<IconExternalLink />}>{monthLabel(reportPeriod)} 보고서</Button></a>
        <a href={`/dashboard/owner/coupons?rid=${s.restaurant_id}`} target="_blank" rel="noreferrer"><Button icon={<IconExternalLink />}>쿠폰 &amp; 스탬프 편집</Button></a>
        {onGo && <Button variant="ghost" onClick={() => onGo(`astro-ops?open=${s.restaurant_id}`)}>Astro 매장 상세</Button>}
      </>}>
      <PanelSection title="이번 달 (지금까지)">
        <div className="grid grid-cols-3 gap-2">
          <MetricBox label="쿠폰 사용" value={s.unavailable ? <Unknown /> : couponNet(s)} sub={[s.voucher_redeemed != null ? "식사권 제외" : "", prevNote(prevCouponNet(s), prevOk ? s.prev!.coupon_redeemed : undefined, previous)].filter(Boolean).join(" · ") || undefined} />
          <MetricBox label="쿠폰 쓴 사람" value={s.coupon_users != null ? `${s.coupon_users}명` : <Pending />} sub="계정" />
          <MetricBox label="스탬프 적립" value={s.unavailable ? <Unknown /> : s.stamp_earned_this_month} sub={prevNote(s.prev_same?.stamp_earned ?? null, prevOk ? s.prev!.stamp_earned : undefined, previous) || undefined} />
          <MetricBox label="쓴 사람(쿠폰 · 스탬프)" value={s.active_users != null ? `${s.active_users}명` : <Pending />} sub="계정 · 여러 번 써도 1명" />
          <MetricBox label="식사권 사용" value={s.voucher_redeemed != null ? `${s.voucher_redeemed}장` : vouchers === null ? <Unknown /> : `${vouchers}장`} />
          <MetricBox label="마일리지 적립한 사람" value={s.mileage_earners != null ? `${s.mileage_earners}명` : <Pending />} sub="스탬프 · 쿠폰 · QR 방문" />
        </div>
      </PanelSection>
      <PanelSection title="지금">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricBox label="스탬프 재방문" value={s.unavailable ? <Unknown /> : `${s.revisit_this_month}명`} sub="이번 달" />
          <MetricBox label="누적 단골" value={s.unavailable ? <Unknown /> : `${s.loyal_total}명`} sub="스탬프 3번 이상" />
          <MetricBox label="혜택 수" value={s.benefit_count == null ? <Unknown /> : s.benefit_count === 0 ? <span className="text-amber-800">0</span> : s.benefit_count} sub={s.has_stamp_benefit === false ? "스탬프 혜택 없음" : "쿠폰 · 스탬프"} />
          <MetricBox label="상세 열람" value={a ? `${a.detail_devices}대` : <Unknown />} sub="GA4 기기" />
        </div>
        {a && a.failed_devices > 0 && <p className="text-[12px] text-amber-800 mt-2">사용 실패 {a.failed_devices}대{a.coupon_unresolved ? ` · 아직 못 쓴 쿠폰 ${a.coupon_unresolved}장` : ""} — {a.reasons.map(failReasonLabel).join(" · ")}</p>}
        <p className="text-[12px] text-gray-600 mt-3 leading-relaxed">이 매장 숫자만 보여 줍니다. 다른 매장과의 순위 · 평균 대비는 넣지 않습니다 — 리포트나 영업 자료로 나가면 두 계약 모두 금지한 동종 매장 비교가 됩니다.</p>
      </PanelSection>
      <PanelSection title="월별 기록">
        {hist === null ? <p className="text-[13px] text-gray-500">월별 기록을 읽는 중입니다…</p> : hist === false || !months ? <p className="text-[13px] text-gray-600">월별 기록을 읽지 못했습니다 — <Unknown /> 0 이 아니라 모름입니다.</p> : (
          <>
            <MonthBars months={months} />
            <p className="text-[12px] text-gray-600 mt-2 leading-relaxed">매일 밤 매장별 월간 기록표에 굳힌 값입니다 — 회원이 탈퇴해 적립 · 쿠폰 기록이 지워져도 지난달 숫자는 줄지 않습니다. 굳은 달이 없는 달은 막대가 없습니다(0 이 아니라 굳기 전).</p>
          </>
        )}
      </PanelSection>
      {months && months.length > 0 && (
        <PanelSection title={`누적 (${+months[0].period.slice(5)}월부터 · 이번 달 지금까지)`}>
          <div className="grid grid-cols-3 gap-2">
            <MetricBox label="쿠폰 사용" value={sumOf("c").toLocaleString()} sub="식사권 제외" />
            <MetricBox label="쿠폰 쓴 사람" value={months.every((m) => m.cu === null) ? <Pending /> : `${sumOf("cu").toLocaleString()}명`} sub={partialSum("cu") ? "굳은 달만 · 달마다 센 합" : "달마다 센 합"} />
            <MetricBox label="스탬프 적립" value={sumOf("s").toLocaleString()} />
            <MetricBox label="마일리지 적립한 사람" value={months.every((m) => m.me === null) ? <Pending /> : `${sumOf("me").toLocaleString()}명`} sub={partialSum("me") ? "굳은 달만 · 달마다 센 합" : "달마다 센 합"} />
            <MetricBox label="식사권 사용" value={months.every((m) => m.v === null) ? <Pending /> : `${sumOf("v")}장`} sub={partialSum("v") ? "굳은 달만" : undefined} />
            <MetricBox label="누적 단골" value={s.unavailable ? <Unknown /> : `${s.loyal_total}명`} sub="스탬프 3번 이상" />
          </div>
          <p className="text-[12px] text-gray-600 mt-2 leading-relaxed">「쓴 사람」 합은 달마다 센 계정을 더한 것이라 같은 사람이 여러 달에 나오면 그만큼 겹칩니다.</p>
        </PanelSection>
      )}
    </SlideOver>
  );
}

/**
 * 이번 달 흐름 한 칸 — 숫자 하나 · 「지난달 이맘때」와 견준 말 · 매장별 몫(이름 없는 막대, 많은 순).
 * 지난달 같은 날짜까지의 합을 모르면 말을 달지 않는다. 윗자리 두 곳이 전체에서 얼마를 차지하는지를 한 줄로.
 */
const MONTH_FLOW = { up: "지난달 이맘때보다 많음", same: "지난달 이맘때와 비슷", down: "지난달 이맘때보다 적음" } as const;
function MonthCard({ title, value, unit, prev, prevMonth, note, shares, loading }: {
  title: string; value: number | null; unit: string; prev: number | null; prevMonth: string | null; note?: string;
  shares: number[]; loading: boolean;
}) {
  const flow = flowOf(value, prev);
  const max = Math.max(1, ...shares);
  const total = shares.reduce((a, n) => a + n, 0);
  const top2 = shares.slice(0, 2).reduce((a, n) => a + n, 0);
  const sub = [prev !== null && prevMonth ? `${prevMonth} 같은 날까지 ${prev.toLocaleString()}${unit}` : "지난달 이맘때 미확인", note].filter(Boolean).join(" · ");
  return (
    <FlowCard title={title} value={value} unit={unit} loading={loading} tag={flow ? { flow, text: MONTH_FLOW[flow] } : null} sub={sub}>
      {loading ? <div className="h-24 mt-3 rounded-lg bg-black/[0.03] animate-pulse" /> : (
        <div className="mt-3 border-t border-black/[0.06] pt-2.5">
          <p className="text-[12.5px] text-gray-700 mb-2">
            {shares.length === 0 ? (value === null ? "읽지 못했습니다 — 0 이 아니라 모름입니다." : "이번 달 아직 없습니다.")
              : <>쓰인 매장 <b className="text-gray-900">{shares.length}곳</b>{shares.length > 2 && total > 0 && <> · 윗자리 2곳이 전체의 <b className="text-gray-900">{Math.round((top2 / total) * 100)}%</b></>}</>}
          </p>
          {shares.length > 0 && (
            <div className="flex items-end gap-[3px] h-16" role="img" aria-label={`매장별 ${unit} 수, 많은 순: ${shares.join(", ")}`}>
              {shares.map((n, i) => (
                <span key={i} className="flex-1 max-w-[28px] rounded-t-[3px]" title={`${n.toLocaleString()}${unit}`}
                  style={{ height: `${Math.max(6, (n / max) * 100)}%`, background: i < 2 && shares.length > 2 ? BAR_NOW : BAR_PAST }} />
              ))}
            </div>
          )}
          {shares.length > 0 && <p className="text-[11.5px] text-gray-500 mt-1.5">막대 하나가 매장 한 곳(많은 순) · 매장 이름은 아래 표에서</p>}
        </div>
      )}
    </FlowCard>
  );
}

/** 매장 이름 옆 표지 — 플랜(Premium 남색 · Boost 페리윙클 · 무료는 없음) · 조용함 · 앱에서 숨김 · 혜택 없음. 표와 폰 목록이 같이 쓴다 */
function StoreTags({ s }: { s: StoreMetric }) {
  return (
    <>
      <PlanTag tier={s.tier} />
      {isSilent(s) && <TagChip>조용함</TagChip>}
      {s.hidden_from_app && <TagChip>앱에서 숨김</TagChip>}
      {s.benefit_count === 0 && <span className="inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-medium whitespace-nowrap" style={{ background: "var(--flow-down-bg)", color: "var(--flow-down-fg)" }}>혜택 없음</span>}
    </>
  );
}

/** 숫자 밑 작은 글 — 「9월 같은 날까지 12」(받았을 때) 또는 「9월 12」(지난달 한 달 전체, 옛 백엔드). 못 읽었으면 비운다 */
function prevNote(same: number | null, full: number | undefined, previous: PreviousState | null): string {
  if (previous?.state !== "ok") return "";
  if (same !== null) return `${monthLabel(previous.period)} 같은 날까지 ${same.toLocaleString()}`;
  return full === undefined ? "" : `${monthLabel(previous.period)} ${full.toLocaleString()}`;
}

/**
 * 사용 실패 칸 — 실패를 겪은 기기 수와 이유. 실패한 뒤 아직 못 쓴 쿠폰이 있으면 빨갛다(아직 해결 안 된 학생이 있다).
 * 이유는 작은 글씨로 늘 보인다 — 서버 오류·네트워크는 매장 탓이 아니라 연락하기 전에 봐야 한다.
 */
function Failed({ a }: { a: StoreActivity | null }) {
  if (!a) return <Unknown why="GA4 를 읽지 못했습니다" />;
  if (!a.failed_devices) return <span className="tabular-nums text-gray-500">0</span>;
  const detail = [
    a.coupon_failed ? `쿠폰 사용 실패 ${a.coupon_failed}건` : "",
    a.coupon_unresolved ? `그중 아직 못 쓴 쿠폰 ${a.coupon_unresolved}장` : "",
    a.stamp_failed ? `스탬프 적립 실패 ${a.stamp_failed}건` : "",
  ].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={detail}>
      <span className={`tabular-nums font-semibold ${a.coupon_unresolved ? "text-amber-800" : "text-gray-800"}`}>{a.failed_devices}</span>
      <span className="text-[11px] text-gray-500 break-keep">{a.reasons.map(failReasonLabel).join(" · ")}</span>
    </span>
  );
}

/** 월별 막대 — 쿠폰(남색) 위에 스탬프(보라) 쌓기. 이번 달은 옅게 */
function MonthBars({ months }: { months: { period: string; c: number; s: number; partial: boolean }[] }) {
  const H = 96;
  const top = Math.max(1, ...months.map((x) => x.c + x.s));
  return (
    <>
      <div className="flex items-end gap-2" style={{ height: H + 20 }}>
        {months.map((x) => {
          const tip = `${+x.period.slice(5)}월 쿠폰 ${x.c} · 스탬프 ${x.s}${x.partial ? " (지금까지)" : ""}`;
          return (
            <div key={x.period} className="flex-1 flex flex-col items-center gap-1" title={tip} aria-label={tip}>
              <div className="w-full max-w-[28px] flex flex-col justify-end" style={{ height: H, opacity: x.partial ? 0.5 : 1 }}>
                <i className="block rounded-t-[3px]" style={{ height: (x.s / top) * H, background: "var(--chart-carousel)" }} />
                <i className="block" style={{ height: (x.c / top) * H, background: BAR_INK, borderRadius: x.s ? 0 : "3px 3px 0 0" }} />
              </div>
              <span className="text-[11px] text-gray-500">{+x.period.slice(5)}월</span>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12px] text-gray-600">
        <li className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: BAR_INK }} />쿠폰 사용(식사권 제외)</li>
        <li className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: "var(--chart-carousel)" }} />스탬프</li>
        <li>이번 달은 지금까지라 옅게</li>
      </ul>
    </>
  );
}

/** 숫자 + 얇은 막대. 표만 있으면 어디가 큰지 안 보이고, 차트만 있으면 정확한 값을 못 읽는다. */
function Bar({ value, max, unavailable }: { value: number; max: number; unavailable?: boolean }) {
  if (unavailable) return <Unknown why="지표를 읽지 못했습니다" />;
  return (
    <span className="inline-flex items-center gap-2 justify-end w-full">
      <span className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[5rem]">
        <span className="block h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: BAR_INK }} />
      </span>
      <span className={`tabular-nums w-8 text-right ${value === 0 ? "text-gray-500" : "text-gray-800 font-medium"}`}>{value.toLocaleString()}</span>
    </span>
  );
}
