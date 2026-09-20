import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { credentialsFromEnv, readGa4AppMetrics, type Ga4AppMetrics } from "@/lib/bigquery/appMetrics";

/**
 * Probe · 앱 지표.
 *
 * 매장 지표만으로는 반쪽이다(민열님 0910: "앱 지표도 포괄적으로, 추후 GA 등 연동"). 이 라우트는
 * **지표의 자리와 출처를 먼저 못 박는다.** 값이 없는 칸은 지어내지 않고 `source.connected=false` 로 내려서
 * 화면이 "어디에 붙이면 채워지는가"를 그대로 보여준다.
 *
 * 연결되는 순서(권장): ① 백엔드 이벤트(가입·쿠폰 발급/사용·스탬프 — 이미 DB 에 있다)
 * ② 푸시 발송/도달(백엔드 notifications) ③ GA4/Firebase(세션·화면 흐름·리텐션).
 *
 * DB 칸은 백엔드 `/api/dashboard/admin/app-stats/`(앱 전체 이번 달 합계, KST 기준)에서 읽는다. `stats/` 는 매장 하나
 * 단위라 매장 없이 부르면 400 이 나서 이 칸들이 늘 비어 있었다. 백엔드가 칸 하나를 못 세면 그 키만 null 로 온다.
 *
 * GA4/Firebase 4칸은 BigQuery 에서 읽는다(`GCP_SA_KEY` 가 있을 때만). 확정 테이블이 하루 한 번 늘어나므로
 * 6시간 캐시한다. 키가 없거나 조회가 실패하면 캐시하지 않고 칸을 비운 채 "연결 전"으로 둔다.
 */

export type Source = "backend" | "push" | "ga4" | "firebase";
/**
 * 연결 상태 3단계. connected = 값이 들어온다 · app_fix = 앱 이벤트 수정·배포가 먼저 · pending = 연결 전.
 * "연결됨/연결 전" 둘로는 "BigQuery 에는 있는데 쿼리가 안 붙음"과 "앱에 이벤트가 없음"을 가를 수 없다.
 * 배지는 값과 같은 배포에서만 connected 로 올린다 — 값이 비었는데 배지만 초록이면 "채워진 지표 0 / 17" 과 다른 말을 한다.
 */
export type SourceStatus = "connected" | "app_fix" | "pending";

export interface AppMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  source: Source;
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

const SOURCE_LABEL: Record<Source, string> = {
  backend: "백엔드 DB",
  push: "푸시 발송 기록",
  ga4: "GA4",
  firebase: "Firebase",
};

// 성공만 캐시된다 — 실패는 throw 로 빠져나가 캐시에 남지 않는다
const cachedGa4 = unstable_cache(
  async (): Promise<Ga4AppMetrics> => {
    const r = await readGa4AppMetrics();
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-app-ga4-v2"],
  { revalidate: 6 * 60 * 60 }
);

async function ga4(): Promise<{ data: Ga4AppMetrics | null; error: string | null }> {
  try {
    if (!credentialsFromEnv()) return { data: null, error: null };
    return { data: await cachedGa4(), error: null };
  } catch (e) {
    console.error("[probe/app] BigQuery 조회 실패", e);
    return { data: null, error: e instanceof Error ? e.message.slice(0, 120) : "알 수 없는 오류" };
  }
}

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  // 백엔드 집계가 없거나 칸 하나가 실패하면 null 로 둔다 — 0 이 아니다.
  const stats = await fetchBackendJson<{ stats?: Record<string, number | null>; since?: string; coupon_by_source?: Record<string, { issued: number; redeemed: number; label?: string }> | null }>("/api/dashboard/admin/app-stats/");
  const s = stats?.stats ?? null;
  const n = (k: string) => (s && typeof s[k] === "number" ? (s[k] as number) : null);
  const sum = (...ks: string[]) => (ks.every((k) => n(k) === null) ? null : ks.reduce((a, k) => a + (n(k) ?? 0), 0));
  const month = stats?.since ? `${md(stats.since)}~ 이번 달` : "이번 달";
  // 쿠폰 발급 경로 — 「발급 → 사용」이 자동 지급 쿠폰에 묻히지 않게 상위 경로를 설명에 적는다
  const bySource: [string, { issued: number; redeemed: number; label?: string }][] = Object.entries(stats?.coupon_by_source ?? {}).sort((a, b) => b[1].issued - a[1].issued);
  const issuedTotal = bySource.reduce((a, [, v]) => a + v.issued, 0);
  const top = bySource[0];
  // 캠페인 이름(백엔드) → 우리가 아는 이름 → 코드. 모르는 코드를 숨기지는 않는다.
  const ko = (k: string) => bySource.find(([c]) => c === k)?.[1].label ?? SOURCE_KO[k] ?? k;
  const issuedList = bySource.filter(([, v]) => v.issued > 0).slice(0, 3).map(([k, v]) => `${ko(k)} ${v.issued.toLocaleString()}건`).join(" · ");
  // 경로별 사용률은 표본이 얕으면 뜻이 없다 — 발급 10건 이상만
  const rateList = bySource.filter(([, v]) => v.issued >= 10).slice(0, 4).map(([k, v]) => `${ko(k)} ${Math.round((v.redeemed / v.issued) * 1000) / 10}%`).join(" · ");
  const { data: g, error: gErr } = await ga4();
  const week = g ? `${md(g.week.from)}~${md(g.week.to)}` : "";

  const groups: AppMetricGroup[] = [
    {
      key: "usage",
      title: "앱 이용",
      description: "얼마나 많은 학생이 앱을 켜고, 돌아오는가.",
      metrics: [
        { key: "signups_month", label: "이번 달 가입", value: n("signups_this_month"), unit: "명", source: "backend", note: s ? `${month} 새로 만든 계정` : undefined },
        { key: "wau", label: "주간 활성(WAU)", value: g?.wau ?? null, unit: "명", source: "ga4", note: g ? `${week} 앱을 켠 기기 수. 재설치하면 새로 센다` : "BigQuery 원본 — 최근 7일 고유 사용자. 쿼리 연결 전" },
        { key: "dau_wau", label: "DAU/WAU", value: g?.dau_wau ?? null, unit: "%", source: "ga4", note: "끈적함. 20% 넘으면 습관이 붙은 것" },
        { key: "retention_w1", label: "가입 1주 후 복귀", value: g?.retention_w1 ?? null, unit: "%", source: "firebase", note: g ? `${md(g.cohort.from)}~${md(g.cohort.to)} 첫 실행 ${g.cohort.users.toLocaleString()}대 중 7~13일째 다시 켠 비율` : "first_open 코호트의 7일 뒤 재방문. BigQuery 쿼리 연결 전" },
      ],
    },
    {
      key: "funnel",
      title: "전환 퍼널",
      description: "앱을 켠 사람이 실제로 매장에서 쓰기까지.",
      metrics: [
        { key: "open_to_store", label: "앱 열기 → 매장 상세", value: g?.open_to_store ?? null, unit: "%", source: "ga4", note: g ? `${week} 세션 ${g.sessions.toLocaleString()}개 중 매장 상세를 연 비율` : "같은 세션 안 매장 상세 이벤트 유무. BigQuery 쿼리 연결 전" },
        { key: "store_to_coupon", label: "매장 상세 → 쿠폰 발급", value: null, unit: "%", source: "backend", note: "분모(매장 상세 열람)는 앱 이벤트 숫자 — DB 와 BigQuery 를 합쳐야 한다" },
        { key: "coupon_issued", label: "쿠폰 발급", value: n("coupon_issued_this_month"), unit: "건", source: "backend", note: issuedList ? `경로: ${issuedList}${bySource.length > 3 ? ` 외 ${bySource.length - 3}개 경로` : ""}` : undefined },
        { key: "coupon_used", label: "쿠폰 사용", value: n("coupon_redeemed_this_month"), unit: "건", source: "backend" },
        { key: "coupon_rate", label: "발급 → 사용", value: n("coupon_redeem_rate"), unit: "%", source: "backend", note: s ? [
          `${month} 발급분 중 이미 쓴 비율. 달 초엔 낮게 나온다`,
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
        { key: "stamp_earned", label: "스탬프 적립", value: n("stamp_earned_this_month"), unit: "건", source: "backend" },
        { key: "stamp_reward", label: "스탬프 보상 수령", value: n("stamp_reward_this_month"), unit: "건", source: "backend", note: s ? "스탬프를 채워 발급된 보상 쿠폰" : undefined },
        { key: "mileage_entries", label: "마일리지 응모", value: n("mileage_entries_this_month"), unit: "건", source: "backend" },
        { key: "mileage_winners", label: "당첨 · 교환", value: sum("mileage_winners_this_month", "mileage_exchanges_this_month"), unit: "건", source: "backend", note: s ? `당첨 ${n("mileage_winners_this_month") ?? "-"} · 마일리지로 쿠폰 교환 ${n("mileage_exchanges_this_month") ?? "-"}. 월 발급 한도 대비 (재무 캡)` : "월 발급 한도 대비 (재무 캡)" },
      ],
    },
    {
      key: "push",
      title: "푸시 · 배너",
      description: "보낸 알림이 사람을 앱으로 데려오는가. 09-09 '알림 보내도 접속률이 낮다'의 답이 여기 있어야 한다.",
      metrics: [
        { key: "push_sent", label: "푸시 발송", value: n("push_sent_this_month"), unit: "건", source: "push", note: s ? "전체 알림 + 매장 예약 알림. 개발자 테스트 발송은 뺐다" : undefined },
        { key: "push_open", label: "푸시 → 앱 열기", value: g?.push_open ?? null, unit: "%", source: "firebase", note: g ? `${md(g.push.from)}~${md(g.push.to)} 안드로이드 수신 ${g.push.received.toLocaleString()}건 중 ${g.push.opened_android}건 열림 (iOS 는 수신을 못 세 열기 ${g.push.opened_ios}건만)` : "Firebase 자동 이벤트(notification_receive/open) — BigQuery 쿼리 연결 전" },
        { key: "banner_ctr", label: "배너 노출 → 클릭", value: null, unit: "%", source: "ga4", status: "app_fix", note: "배너 노출 이벤트가 없다(0건). 노출 이벤트 배포가 먼저" },
        { key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", value: g?.banner_to_coupon ?? null, unit: "%", source: "ga4", note: g ? `${md(g.banner.from)}~${md(g.banner.to)} 배너를 누른 기기 ${g.banner.clicked}대 중 7일 안에 쿠폰을 쓴 ${g.banner.redeemed}대. 표본이 작다` : "배너 클릭 기기의 7일 내 coupon_redeemed — BigQuery 쿼리 연결 전" },
      ],
    },
  ];

  const SOURCE_HINT: Record<Source, string> = {
    backend: s
      ? "백엔드 app-stats 에서 이번 달(KST) 합계를 읽는다. 「매장 상세 → 쿠폰 발급」은 정의를 다시 정하는 중이라 비워 둔다 — 앱의 coupon_issued 는 자동 지급 쿠폰이 보일 때도 찍혀 매장을 보고 받은 쿠폰과 섞인다."
      : "쿠폰·스탬프·가입은 이미 DB 에 있다. 백엔드 /api/dashboard/admin/app-stats/ 가 배포되면 채워진다.",
    push: s
      ? "발송 건수는 notifications 테이블에서 센다. 열기는 Firebase 자동 이벤트로 — 위 「푸시 → 앱 열기」 칸."
      : "발송 건수는 notifications 테이블 집계로 나온다. 열기는 Firebase 자동 이벤트로 — 위 「푸시 → 앱 열기」 칸.",
    ga4: g
      ? `BigQuery 확정 테이블(${md(g.through)}까지)에서 6시간마다 읽는다. 기기 단위라 재설치하면 새 사용자로 센다. 배너 노출은 앱에 이벤트가 없어 앱 수정이 먼저.`
      : "앱은 3월부터 GA4 로 이벤트를 보내고 BigQuery 에 쌓인다. WAU · DAU/WAU · 앱 열기 → 매장 상세는 쿼리만 붙이면 된다. 배너 노출은 앱에 이벤트가 없어 앱 수정이 먼저. 값과 배지는 같은 배포에.",
    firebase: g
      ? "GA4 와 같은 스트림이라 같은 BigQuery 에서 읽는다. 가입 1주 후 복귀 = first_open 코호트의 7~13일째 재방문. 푸시 열기 = FCM 자동 이벤트, 수신은 안드로이드만 남아 비율도 안드로이드 기준."
      : "GA4 와 같은 스트림이라 같은 BigQuery 에 있다. 가입 1주 후 복귀는 first_open 코호트 쿼리로 읽는다.",
  };
  // 배지는 값이 실제로 들어온 칸이 있을 때만 올린다
  const live: Record<Source, boolean> = { backend: n("coupon_issued_this_month") !== null || n("signups_this_month") !== null, push: n("push_sent_this_month") !== null, ga4: g?.wau != null, firebase: g?.retention_w1 != null };
  const sources = (Object.keys(SOURCE_LABEL) as Source[]).map((k) => {
    const connected = live[k];
    const status: SourceStatus = connected ? "connected" : "pending";
    const failed = gErr && (k === "ga4" || k === "firebase") ? ` (BigQuery 조회 실패: ${gErr})` : "";
    return { key: k, label: SOURCE_LABEL[k], connected, status, hint: SOURCE_HINT[k] + failed };
  });

  return NextResponse.json({
    groups,
    sources,
    generated_at: new Date().toISOString(),
    draft: !live.backend,
    draft_note: "값이 비어 있는 칸은 데이터 소스가 아직 연결되지 않은 것입니다. 0 이 아닙니다.",
  });
}
