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
  ["probe-app-ga4-v1"],
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

  // 백엔드가 이미 갖고 있는 집계가 있으면 쓴다. 없으면 null 로 둔다 — 0 이 아니다.
  const stats = await fetchBackendJson<{ stats?: Record<string, number> }>("/api/dashboard/stats/");
  const s = stats?.stats ?? null;
  const n = (k: string) => (s && typeof s[k] === "number" ? s[k] : null);
  const { data: g, error: gErr } = await ga4();
  const week = g ? `${md(g.week.from)}~${md(g.week.to)}` : "";

  const groups: AppMetricGroup[] = [
    {
      key: "usage",
      title: "앱 이용",
      description: "얼마나 많은 학생이 앱을 켜고, 돌아오는가.",
      metrics: [
        { key: "signups_month", label: "이번 달 가입", value: n("signups_this_month"), unit: "명", source: "backend" },
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
        { key: "coupon_issued", label: "쿠폰 발급", value: n("coupon_issued_this_month"), unit: "건", source: "backend" },
        { key: "coupon_used", label: "쿠폰 사용", value: n("coupon_redeemed_this_month"), unit: "건", source: "backend" },
        { key: "coupon_rate", label: "발급 → 사용", value: null, unit: "%", source: "backend", note: "이 숫자가 배너 A/B 의 주요 지표다 (Castor)" },
      ],
    },
    {
      key: "loyalty",
      title: "스탬프 · 마일리지",
      description: "재방문 장치가 실제로 도는가.",
      metrics: [
        { key: "stamp_earned", label: "스탬프 적립", value: n("stamp_earned_this_month"), unit: "건", source: "backend" },
        { key: "stamp_reward", label: "스탬프 보상 수령", value: null, unit: "건", source: "backend" },
        { key: "mileage_entries", label: "마일리지 응모", value: null, unit: "건", source: "backend" },
        { key: "mileage_winners", label: "당첨 · 교환", value: null, unit: "건", source: "backend", note: "월 발급 한도 대비 (재무 캡)" },
      ],
    },
    {
      key: "push",
      title: "푸시 · 배너",
      description: "보낸 알림이 사람을 앱으로 데려오는가. 09-09 '알림 보내도 접속률이 낮다'의 답이 여기 있어야 한다.",
      metrics: [
        { key: "push_sent", label: "푸시 발송", value: null, unit: "건", source: "push" },
        { key: "push_open", label: "푸시 → 앱 열기", value: null, unit: "%", source: "push", status: "app_fix", note: "notification_open 은 Firebase 예약어라 0건. 앱에서 push_open 으로 바꾼 배포 이후부터" },
        { key: "banner_ctr", label: "배너 노출 → 클릭", value: null, unit: "%", source: "ga4", status: "app_fix", note: "배너 노출 이벤트가 없다(0건). 노출 이벤트 배포가 먼저" },
        { key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", value: null, unit: "%", source: "backend", note: "클릭은 앱 이벤트, 사용은 DB — 둘을 합쳐야 한다" },
      ],
    },
  ];

  const SOURCE_HINT: Record<Source, string> = {
    backend: "쿠폰·스탬프·가입은 이미 DB 에 있다. 집계 엔드포인트 하나면 된다. 「발급 → 사용」이 배너 A/B 주요 지표라 먼저.",
    push: "발송 건수는 notifications 테이블 집계로 나온다. 열기(open)는 앱 수정 대기 — 위 「푸시 → 앱 열기」 칸.",
    ga4: g
      ? `BigQuery 확정 테이블(${md(g.through)}까지)에서 6시간마다 읽는다. 기기 단위라 재설치하면 새 사용자로 센다. 배너 노출은 앱에 이벤트가 없어 앱 수정이 먼저.`
      : "앱은 3월부터 GA4 로 이벤트를 보내고 BigQuery 에 쌓인다. WAU · DAU/WAU · 앱 열기 → 매장 상세는 쿼리만 붙이면 된다. 배너 노출은 앱에 이벤트가 없어 앱 수정이 먼저. 값과 배지는 같은 배포에.",
    firebase: g
      ? "GA4 와 같은 스트림이라 같은 BigQuery 에서 읽는다. 가입 1주 후 복귀 = first_open 코호트의 7~13일째 재방문."
      : "GA4 와 같은 스트림이라 같은 BigQuery 에 있다. 가입 1주 후 복귀는 first_open 코호트 쿼리로 읽는다.",
  };
  // 배지는 값이 실제로 들어온 칸이 있을 때만 올린다
  const live: Record<Source, boolean> = { backend: s !== null, push: false, ga4: g?.wau != null, firebase: g?.retention_w1 != null };
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
    draft: true,
    draft_note: "값이 비어 있는 칸은 데이터 소스가 아직 연결되지 않은 것입니다. 0 이 아닙니다.",
  });
}
