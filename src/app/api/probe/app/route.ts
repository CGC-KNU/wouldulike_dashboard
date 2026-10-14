import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { credentialsFromEnv, readGa4AppMetrics, readWau, type Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { readStoreToCoupon, type StoreToCoupon } from "@/lib/bigquery/couponFunnel";
import { readOnboardingFunnel, type OnboardingFunnel } from "@/lib/bigquery/onboarding";
import { appPeriods, type AppPeriodKey } from "@/lib/draft/appPeriods";

/**
 * Probe · 앱 지표.
 *
 * 매장 지표만으로는 반쪽이다(민열님 0910: "앱 지표도 포괄적으로, 추후 GA 등 연동"). 값이 없는 칸은 지어내지 않고
 * null 로 내린다 — 0 이 아니라 모름이다. 칸마다 출처(DB·푸시·GA4·Firebase)를 붙인다.
 *
 * 1013: 출처를 하나씩 붙이던 시기의 「연결 상태」(sources·connected·연결 방법 안내)는 걷어냈다. 넷 다 붙어 있고,
 * 안내 문구가 실제와 어긋나기 시작했다. 대신 무엇을 못 읽었는지만 `backend_ok`·`ga4_ok`·`ga4_error` 로 내린다.
 *
 * DB 칸은 백엔드 `/api/dashboard/admin/app-stats/`(앱 전체 이번 달 합계, KST 기준)에서 읽는다. `stats/` 는 매장 하나
 * 단위라 매장 없이 부르면 400 이 나서 이 칸들이 늘 비어 있었다. 백엔드가 칸 하나를 못 세면 그 키만 null 로 온다.
 *
 * GA4/Firebase 4칸은 BigQuery 에서 읽는다(`GCP_SA_KEY` 가 있을 때만). 확정 테이블이 하루 한 번 늘어나므로
 * 6시간 캐시한다. 키가 없거나 조회가 실패하면 캐시하지 않고 칸을 비운다.
 *
 * 1014: 칸마다 센 구간이 다르다(이번 달 · 7일 · 30일 · 14일 · 코호트 · 4주 · 지금). 날짜를 설명 문장 앞에 따로 붙이던 것을
 * 걷고, 칸은 `period` 이름만 단다. 이름 → 날짜는 `periods`(appPeriods.ts 한 곳)로 내려 화면 위 기간 줄에 한 번 적는다.
 */

export type Source = "backend" | "push" | "ga4" | "firebase";
/** 칸 단위 상태 — app_fix = 앱 이벤트 릴리스가 먼저인 칸 · pending = 아직 못 읽음 */
export type SourceStatus = "connected" | "app_fix" | "pending";

export interface AppMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  source: Source;
  /** 이 칸을 센 구간 — 날짜는 응답의 `periods` 에 */
  period: AppPeriodKey;
  note?: string;
  status?: SourceStatus; // 칸 단위 예외 — 출처와 별개로 앱 수정이 먼저인 칸
}

export interface AppMetricGroup {
  key: string;
  title: string;
  description: string;
  metrics: AppMetric[];
}

/**
 * 쿠폰 발급 경로 — issue_key 로 가른 경로의 이름. 캠페인으로 가른 경로는 백엔드가 캠페인 이름을 같이 주므로
 * 여기 적을 필요가 없다(새 이벤트가 생겨도 손댈 곳이 없게).
 */
const SOURCE_KO: Record<string, string> = {
  SIGNUP_WELCOME: "가입 환영", STAMP_REWARD: "스탬프 보상", BULK_EVENT: "일괄 지급", REFERRAL: "친구 초대",
  EVENT_REWARD_SIGNUP: "이벤트 가입 보상", FLASH_8PM: "밤 8시 플래시", FINAL_EXAM_EVENT: "시험기간 이벤트",
  LIMITED_BONUS: "한정 보너스", LIMITED_CAMPAIGN: "한정 쿠폰 받기", KNUSCSEPT_EVENT: "학생회 추천코드",
  unknown: "발급 경로 기록 없음", other: "기타",
};

// 성공만 캐시된다 — 실패는 throw 로 빠져나가 캐시에 남지 않는다
const cachedGa4 = unstable_cache(
  async (): Promise<Ga4AppMetrics> => {
    const r = await readGa4AppMetrics();
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-app-ga4-v4"],
  { revalidate: 6 * 60 * 60 }
);

/**
 * 「매장 상세 → 쿠폰 발급」 — GA4 안에서 이어진다(DB 불필요). 창은 GA4 칸과 같은 7일로 맞춘다.
 * 성공만 캐시되는 것은 위와 같다.
 */
const cachedS2C = unstable_cache(
  async (start: string, end: string): Promise<StoreToCoupon> => {
    const r = await readStoreToCoupon(process.env, { start, end });
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-app-store-to-coupon-v1"],
  { revalidate: 6 * 60 * 60 }
);

/** 온보딩 완료율 — GA4 한 곳에서 이어진다. 창은 GA4 칸과 같은 7일. 성공만 캐시. */
const cachedOnboarding = unstable_cache(
  async (start: string, end: string): Promise<OnboardingFunnel> => {
    const r = await readOnboardingFunnel(process.env, { start, end });
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-app-onboarding-v1"],
  { revalidate: 6 * 60 * 60 }
);

async function onboarding(g: Ga4AppMetrics | null): Promise<OnboardingFunnel | null> {
  if (!g || !credentialsFromEnv()) return null;
  try {
    return await cachedOnboarding(g.week.from.replace(/-/g, ""), g.week.to.replace(/-/g, ""));
  } catch (e) {
    console.error("[probe/app] 온보딩 조회 실패", e);
    return null;
  }
}

async function storeToCoupon(g: Ga4AppMetrics | null): Promise<StoreToCoupon | null> {
  if (!g || !credentialsFromEnv()) return null;
  try {
    return await cachedS2C(g.week.from.replace(/-/g, ""), g.week.to.replace(/-/g, ""));
  } catch (e) {
    console.error("[probe/app] 매장상세→쿠폰 조회 실패", e);
    return null;
  }
}

/**
 * 4주 전 같은 7일의 WAU — 메인 Polaris 성장률의 비교 기준(「4주 전 / 전월」). 지난 창은 바뀌지 않아 하루 캐시한다.
 * Probe 앱 지표 화면은 이 값을 그리지 않는다.
 */
const cachedWau = unstable_cache(
  async (end: string) => {
    const r = await readWau(end);
    if (!r) throw new Error("no_key");
    return r;
  },
  ["probe-app-wau-v1"],
  { revalidate: 24 * 60 * 60 }
);

async function wauAgo(g: Ga4AppMetrics | null): Promise<{ from: string; to: string; wau: number } | null> {
  if (!g) return null;
  try {
    return await cachedWau(new Date(Date.parse(g.week.to) - 28 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""));
  } catch (e) {
    console.error("[probe/app] 4주 전 WAU 조회 실패", e);
    return null;
  }
}

async function ga4(): Promise<{ data: Ga4AppMetrics | null; error: string | null }> {
  try {
    if (!credentialsFromEnv()) return { data: null, error: null };
    return { data: await cachedGa4(), error: null };
  } catch (e) {
    console.error("[probe/app] BigQuery 조회 실패", e);
    return { data: null, error: e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류" };
  }
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  // 백엔드 집계가 없거나 칸 하나가 실패하면 null 로 둔다 — 0 이 아니다.
  // 백엔드와 BigQuery 는 서로 기다리지 않는다 — 줄 세우면 잠든 백엔드를 깨우는 시간에 GA4 조회(로컬 약 10초)가 더해져
  // 메인 Polaris 의 25초 제한을 넘긴다.
  const [stats, { data: g, error: gErr }] = await Promise.all([
    fetchBackendJson<{ stats?: Record<string, number | null>; since?: string; generated_at?: string; coupon_by_source?: Record<string, { issued: number; redeemed: number; expiring?: number; label?: string }> | null }>("/api/dashboard/admin/app-stats/"),
    ga4(),
  ]);
  const s = stats?.stats ?? null;
  const n = (k: string) => (s && typeof s[k] === "number" ? (s[k] as number) : null);
  // 한쪽이라도 모르면 합도 모른다 — 교환을 못 셌는데 당첨만 더하면 그 합이 사실처럼 보인다 (#283)
  const sum = (...ks: string[]) => {
    const nums = ks.map((k) => n(k)).filter((v): v is number => v !== null);
    return nums.length === ks.length ? nums.reduce((a, v) => a + v, 0) : null;
  };
  // 쿠폰 발급 경로 — 「발급 → 사용」이 자동 지급 쿠폰에 묻히지 않게 상위 경로를 설명에 적는다
  const bySource: [string, { issued: number; redeemed: number; expiring?: number; label?: string }][] = Object.entries(stats?.coupon_by_source ?? {}).sort((a, b) => b[1].issued - a[1].issued);
  const issuedTotal = bySource.reduce((a, [, v]) => a + v.issued, 0);
  const top = bySource[0];
  // 캠페인 이름(백엔드) → 우리가 아는 이름 → 코드. 모르는 코드를 숨기지는 않는다.
  const ko = (k: string) => bySource.find(([c]) => c === k)?.[1].label ?? SOURCE_KO[k] ?? k;
  const issuedList = bySource.filter(([, v]) => v.issued > 0).slice(0, 3).map(([k, v]) => `${ko(k)} ${v.issued.toLocaleString()}건`).join(" · ");
  // 경로별 사용률은 표본이 얕으면 뜻이 없다 — 발급 10건 이상만
  const expiringList = [...bySource].sort((a, b) => (b[1].expiring ?? 0) - (a[1].expiring ?? 0)).filter(([, v]) => v.expiring).slice(0, 3).map(([k, v]) => `${ko(k)} ${v.expiring!.toLocaleString()}장`).join(" · ");
  const rateList = bySource.filter(([, v]) => v.issued >= 10).slice(0, 4).map(([k, v]) => `${ko(k)} ${Math.round((v.redeemed / v.issued) * 1000) / 10}%`).join(" · ");
  // 코드 입력(추천코드·학생회 코드)으로 받은 쿠폰의 비중 — 「발급」이 자동·코드 경로에 얼마나 기대는지.
  // 9월엔 발급 780건 중 489건이 추천코드 자동 지급이었고 그중 쓰인 건 1장이었다.
  const CODE_SOURCES = ["REFERRAL", "KNUSCSEPT_EVENT"];
  const codeParts = bySource.filter(([k, v]) => CODE_SOURCES.includes(k) && v.issued > 0);
  const codeIssued = codeParts.reduce((a, [, v]) => a + v.issued, 0);
  const codeRedeemed = codeParts.reduce((a, [, v]) => a + v.redeemed, 0);
  const signupsTotal = n("signups_total");
  const [s2c, ob, ago] = await Promise.all([storeToCoupon(g), onboarding(g), wauAgo(g)]);

  const groups: AppMetricGroup[] = [
    {
      key: "usage",
      title: "앱 이용",
      description: "얼마나 많은 학생이 앱을 켜고, 돌아오는가.",
      metrics: [
        { key: "signups_month", label: "이번 달 가입", value: n("signups_this_month"), unit: "명", source: "backend", period: "month", note: s ? "새로 만든 계정" : undefined },
        { key: "signups_total", label: "누적 가입자", value: n("signups_total"), unit: "명", source: "backend", period: "now", note: s ? "지금 남아 있는 계정 수(탈퇴 제외). 위 「이번 달 가입」과 WAU 의 분모" : undefined },
        { key: "wau", label: "주간 활성(WAU)", value: g?.wau ?? null, unit: "명", source: "ga4", period: "week", note: g ? "앱을 켠 기기 수. 재설치하면 새로 센다" : "BigQuery 원본 — 최근 7일 고유 사용자. 쿼리 연결 전" },
        { key: "dau", label: "일간 활성(DAU)", value: g?.dau ?? null, unit: "명", source: "ga4", period: "week", note: g ? "하루 평균 앱을 켠 기기 수. 개발 회의(9/20) 목표는 평균 150명" : "BigQuery 원본 — 7일 하루 평균. 쿼리 연결 전" },
        { key: "dau_wau", label: "DAU/WAU", value: g?.dau_wau ?? null, unit: "%", source: "ga4", period: "week", note: "끈적함. 20% 넘으면 습관이 붙은 것" },
        // 분자는 기기, 분모는 계정이라 비율은 근사다 — 한 사람이 기기 둘이면 높게, 재설치해도 높게 나온다. 100% 를 넘을 수 있다.
        { key: "wau_per_signup", label: "가입자 중 이번 주 활성", value: g?.wau != null && signupsTotal ? Math.round((g.wau / signupsTotal) * 1000) / 10 : null, unit: "%", source: "ga4", period: "week",
          note: g?.wau != null && signupsTotal ? `WAU ${g.wau.toLocaleString()}기기(7일) ÷ 누적 가입자 ${signupsTotal.toLocaleString()}명(지금). 기기와 계정을 나눈 근사값 — 재설치·기기 여러 대면 높게 나온다` : "WAU(GA4)와 누적 가입자(DB)가 둘 다 들어와야 나온다" },
        { key: "mau", label: "월간 활성(MAU)", value: g?.mau ?? null, unit: "명", source: "ga4", period: "mau", note: g ? "30일간 앱을 켠 기기 수. 재설치하면 새로 센다" : "BigQuery 원본 — 최근 30일 고유 사용자. 쿼리 연결 전" },
        { key: "wau_mau", label: "WAU/MAU", value: g?.wau != null && g.mau ? Math.round((g.wau / g.mau) * 1000) / 10 : null, unit: "%", source: "ga4", period: "mau", note: "30일 안에 온 기기 중 같은 날 끝나는 7일에도 온 비율. 높을수록 단골이 쌓이는 중이고, 낮으면 한 번 쓰고 떠나는 사람이 많다" },
        { key: "onboarding", label: "온보딩 완료율", value: ob?.rate ?? null, unit: "%", source: "ga4", period: "week",
          ...(ob ? {} : { status: "pending" as const }),
          note: ob
            ? `인삿말을 본 ${ob.started.toLocaleString()}대 중 마친 ${ob.completed.toLocaleString()}대(건너뛰기 포함). 첫 쿠폰까지 본 건 ${ob.revealed.toLocaleString()}대${ob.started < 30 ? " · 표본이 얕다" : ""}`
            : "인삿말을 본 기기 중 온보딩을 마친 비율 — BigQuery 조회 전" },
        { key: "invite_share", label: "친구 초대 공유", value: null, unit: "건", source: "ga4", period: "week", status: "app_fix",
          note: "공유 결과 이벤트(invite_share)를 앱에 심었고 스토어 릴리스를 기다리는 중 — 카카오 공유·코드 복사. 릴리스 2주 뒤에 읽는다" },
        { key: "retention_w1", label: "가입 1주 후 복귀", value: g?.retention_w1 ?? null, unit: "%", source: "firebase", period: "cohort", note: g ? `첫 실행 ${g.cohort.users.toLocaleString()}대 중 7~13일째 다시 켠 비율` : "first_open 코호트의 7일 뒤 재방문. BigQuery 쿼리 연결 전" },
      ],
    },
    {
      key: "funnel",
      title: "전환 퍼널",
      description: "앱을 켠 사람이 실제로 매장에서 쓰기까지.",
      metrics: [
        { key: "open_to_store", label: "앱 열기 → 매장 상세", value: g?.open_to_store ?? null, unit: "%", source: "ga4", period: "week", note: g ? `세션 ${g.sessions.toLocaleString()}개 중 매장 상세를 연 비율` : "같은 세션 안 매장 상세 이벤트 유무. BigQuery 쿼리 연결 전" },
        // 예전 주석은 "DB 와 BigQuery 를 합쳐야 한다" 였는데 틀린 전제였다 —
        // restaurant_detail_open 과 coupon_issued 가 둘 다 restaurant_id 를 실어서 GA4 안에서 이어진다.
        // 캠페인 자동 지급은 분자에서 뺀다. 그걸 넣으면 "상세를 보면 10%가 받는다"로 읽히는데 사실이 아니다.
        { key: "store_to_coupon", label: "매장 상세 → 쿠폰 발급", value: s2c?.rate ?? null, unit: "%", source: "ga4", period: "week",
          ...(s2c ? {} : { status: "pending" as const }),
          note: s2c
            ? `매장 상세 ${s2c.views.toLocaleString()}번 중 같은 자리에서 그 매장 쿠폰을 받은 ${s2c.claimed.toLocaleString()}번.`
              + ` 기획전 자동 지급은 뺐습니다 — 넣으면 ${s2c.claimed_including_campaign.toLocaleString()}번이지만 상세를 본 것과 무관합니다`
              + (s2c.claimed < 10 ? " · 표본이 얕어 비율보다 건수를 보십시오" : "")
            : "매장 상세와 쿠폰 발급을 (기기·세션·매장)으로 잇는다 — BigQuery 조회 전" },
        { key: "coupon_issued", label: "쿠폰 발급", value: n("coupon_issued_this_month"), unit: "건", source: "backend", period: "month", note: issuedList ? `경로: ${issuedList}${bySource.length > 3 ? ` 외 ${bySource.length - 3}개 경로` : ""}` : undefined },
        { key: "coupon_code_share", label: "코드 입력으로 받은 비중", value: s && issuedTotal > 0 ? Math.round((codeIssued / issuedTotal) * 1000) / 10 : null, unit: "%", source: "backend", period: "month",
          note: s && issuedTotal > 0 ? `발급 ${issuedTotal.toLocaleString()}건 중 ${codeIssued.toLocaleString()}건(${codeParts.map(([k, v]) => `${ko(k)} ${v.issued.toLocaleString()}`).join(" · ") || "없음"}). 그중 쓰인 건 ${codeRedeemed.toLocaleString()}장 — 높을수록 「발급 → 사용」이 이 경로 얘기다` : undefined },
        { key: "coupon_used", label: "쿠폰 사용", value: n("coupon_redeemed_this_month"), unit: "건", source: "backend", period: "month", note: s ? "지난달 발급분을 이번 달에 쓴 것도 센다" : undefined },
        // 0920: 학생회 쿠폰 513장이 한 장도 안 쓰인 채 만료를 이틀 앞두고 있던 것을 늦게 알았다. "안 쓴다"와 "아직 안 썼다"는 다르다.
        { key: "coupon_expiring", label: "7일 안에 만료", value: n("coupon_expiring_7d"), unit: "장", source: "backend", period: "now", note: expiringList ? `지금부터 7일 안에 사라질 미사용 쿠폰 · ${expiringList} — 만료 전에 알리면 살릴 수 있다` : s ? "곧 사라질 미사용 쿠폰이 없다" : undefined },
        { key: "coupon_rate", label: "발급 → 사용", value: n("coupon_redeem_rate"), unit: "%", source: "backend", period: "month", note: s ? [
          "이번 달 발급분 중 이미 쓴 비율. 달 초엔 낮게 나온다",
          top && issuedTotal > 0 && top[1].issued / issuedTotal >= 0.3 ? `발급의 ${Math.round((top[1].issued / issuedTotal) * 100)}%가 「${ko(top[0])}」 한 경로 — 이 숫자는 사실상 그 경로 얘기다` : null,
          rateList ? `경로별: ${rateList}` : null,
          "배너 A/B 주요 지표 (Castor)",
        ].filter(Boolean).join(" · ") : "이 숫자가 배너 A/B 의 주요 지표다 (Castor)" },
      ],
    },
    {
      key: "loyalty",
      title: "스탬프 · 마일리지",
      description: "재방문 장치가 실제로 도는가.",
      metrics: [
        { key: "stamp_earned", label: "스탬프 적립", value: n("stamp_earned_this_month"), unit: "건", source: "backend", period: "month" },
        { key: "stamp_earners", label: "스탬프 적립한 사람", value: n("stamp_earners_this_month"), unit: "명", source: "backend", period: "month",
          note: n("stamp_earners_this_month") && n("stamp_earned_this_month") !== null ? `적립 ${n("stamp_earned_this_month")!.toLocaleString()}건 ÷ ${n("stamp_earners_this_month")!.toLocaleString()}명 = 1인당 ${(Math.round((n("stamp_earned_this_month")! / n("stamp_earners_this_month")!) * 10) / 10).toLocaleString()}번` : undefined },
        { key: "stamp_reward", label: "스탬프 보상 수령", value: n("stamp_reward_this_month"), unit: "건", source: "backend", period: "month", note: s ? "스탬프를 채워 발급된 보상 쿠폰" : undefined },
        // 응모(쓰는 쪽)만 있고 풀린 양(주는 쪽)이 없었다. 활동 적립만 센다 — 미션 보상·관리자 지급·교환은 뺀다.
        { key: "mileage_earned", label: "마일리지 적립", value: n("mileage_earned_this_month"), unit: "P", source: "backend", period: "month",
          note: s ? `스탬프 방문·쿠폰 사용·QR 방문 적립만. 미션 보상·관리자 지급은 뺐다${n("mileage_earners_this_month") !== null ? ` · ${n("mileage_earners_this_month")!.toLocaleString()}명이 적립` : ""}` : undefined },
        { key: "mileage_earners", label: "마일리지 적립한 사람", value: n("mileage_earners_this_month"), unit: "명", source: "backend", period: "month",
          note: n("mileage_earned_this_month") && n("mileage_earners_this_month") ? `1인당 평균 ${Math.round(n("mileage_earned_this_month")! / n("mileage_earners_this_month")!).toLocaleString()}P` : undefined },
        { key: "mileage_entries", label: "마일리지 응모", value: n("mileage_entries_this_month"), unit: "건", source: "backend", period: "month" },
        // 식사권은 당첨되면 쿠폰함의 일반 쿠폰(RAFFLE_WIN:)이 되어 PIN 으로 쓴다 — 별도 승인 화면이 없다
        { key: "voucher_redeemed", label: "식사권 사용", value: n("voucher_redeemed_this_month"), unit: "장", source: "backend", period: "month",
          note: n("voucher_issued_this_month") !== null ? `이번 달 당첨으로 발급된 식사권 ${n("voucher_issued_this_month")!.toLocaleString()}장 · 사용은 지난달 발급분 포함` : undefined },
        { key: "mileage_winners", label: "당첨 · 교환", value: sum("mileage_winners_this_month", "mileage_exchanges_this_month"), unit: "건", source: "backend", period: "month", note: s ? `당첨 ${n("mileage_winners_this_month") ?? "-"} · 마일리지로 쿠폰 교환 ${n("mileage_exchanges_this_month") ?? "-"}. 월 발급 한도 대비 (재무 캡)` : "월 발급 한도 대비 (재무 캡)" },
      ],
    },
    {
      key: "push",
      title: "푸시 · 배너",
      description: "보낸 알림이 사람을 앱으로 데려오는가. 09-09 '알림 보내도 접속률이 낮다'의 답이 여기 있어야 한다.",
      metrics: [
        { key: "push_sent", label: "푸시 발송", value: n("push_sent_this_month"), unit: "건", source: "push", period: "month", note: s ? "전체 알림 + 매장 예약 알림. 개발자 테스트 발송은 뺐다" : undefined },
        { key: "push_open", label: "푸시 → 앱 열기", value: g?.push_open ?? null, unit: "%", source: "firebase", period: "push", note: g ? `안드로이드 수신 ${g.push.received.toLocaleString()}건 중 ${g.push.opened_android}건 열림 (iOS 는 수신을 못 세 열기 ${g.push.opened_ios}건만)` : "Firebase 자동 이벤트(notification_receive/open) — BigQuery 쿼리 연결 전" },
        // 노출 이벤트는 앱 2.5.8 부터 나간다. 노출을 보낸 기기가 없으면 분모가 없는 칸으로 둔다.
        g && (g.banner_view?.seen ?? 0) > 0
          ? { key: "banner_ctr", label: "배너 노출 → 클릭", value: g.banner_ctr ?? null, unit: "%", source: "ga4", period: "week",
              note: `배너 노출을 보낸 기기 ${g.banner_view!.seen.toLocaleString()}대 중 ${g.banner_view!.clicked.toLocaleString()}대가 눌렀다. 노출 이벤트가 없는 구버전 기기는 제외` }
          : { key: "banner_ctr", label: "배너 노출 → 클릭", value: null, unit: "%", source: "ga4", period: "week", status: "app_fix",
              note: g ? "앱에 노출 이벤트를 심었고 스토어 릴리스를 기다리는 중 — 이 창에는 아직 노출 0건" : "배너 노출 이벤트 — BigQuery 를 읽지 못했다" },
        { key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", value: g?.banner_to_coupon ?? null, unit: "%", source: "ga4", period: "banner", note: g ? `배너를 누른 기기 ${g.banner.clicked}대 중 7일 안에 쿠폰을 쓴 ${g.banner.redeemed}대. 표본이 작다` : "배너 클릭 기기의 7일 내 coupon_redeemed — BigQuery 쿼리 연결 전" },
      ],
    },
  ];

  return NextResponse.json({
    groups,
    generated_at: new Date().toISOString(),
    // 무엇을 못 읽었나 — 화면이 「0 이 아니라 모름」을 그 출처에 대해서만 말한다
    backend_ok: s !== null,
    ga4_ok: g !== null,
    ga4_error: gErr,
    /** GA4 확정 테이블이 어디까지 왔나(YYYY-MM-DD) */
    ga4_through: g?.through ?? null,
    /** 칸의 `period` → 실제로 센 구간. 화면 위 기간 줄 */
    periods: appPeriods({ since: stats?.since, countedAt: s ? (stats?.generated_at ?? new Date().toISOString()) : null, ga4: g }),
    // 메인 Polaris 성장률의 「4주 전」 — groups 의 wau 와 같은 정의로 28일 앞선 7일. 이 화면은 그리지 않는다
    wau_4w_ago: ago,
  });
}
