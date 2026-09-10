import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";

/**
 * Probe · 앱 지표.
 *
 * 매장 지표만으로는 반쪽이다(민열님 0910: "앱 지표도 포괄적으로, 추후 GA 등 연동"). 이 라우트는
 * **지표의 자리와 출처를 먼저 못 박는다.** 값이 없는 칸은 지어내지 않고 `source.connected=false` 로 내려서
 * 화면이 "어디에 붙이면 채워지는가"를 그대로 보여준다.
 *
 * 연결되는 순서(권장): ① 백엔드 이벤트(가입·쿠폰 발급/사용·스탬프 — 이미 DB 에 있다)
 * ② 푸시 발송/도달(백엔드 notifications) ③ GA4/Firebase(세션·화면 흐름·리텐션).
 */

export type Source = "backend" | "push" | "ga4" | "firebase";

export interface AppMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  source: Source;
  note?: string;
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

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  // 백엔드가 이미 갖고 있는 집계가 있으면 쓴다. 없으면 null 로 둔다 — 0 이 아니다.
  const stats = await fetchBackendJson<{ stats?: Record<string, number> }>("/api/dashboard/stats/");
  const s = stats?.stats ?? null;
  const n = (k: string) => (s && typeof s[k] === "number" ? s[k] : null);

  const groups: AppMetricGroup[] = [
    {
      key: "usage",
      title: "앱 이용",
      description: "얼마나 많은 학생이 앱을 켜고, 돌아오는가.",
      metrics: [
        { key: "signups_month", label: "이번 달 가입", value: n("signups_this_month"), unit: "명", source: "backend" },
        { key: "wau", label: "주간 활성(WAU)", value: null, unit: "명", source: "ga4" },
        { key: "dau_wau", label: "DAU/WAU", value: null, unit: "%", source: "ga4", note: "끈적함. 20% 넘으면 습관이 붙은 것" },
        { key: "retention_w1", label: "가입 1주 후 복귀", value: null, unit: "%", source: "firebase" },
      ],
    },
    {
      key: "funnel",
      title: "전환 퍼널",
      description: "앱을 켠 사람이 실제로 매장에서 쓰기까지.",
      metrics: [
        { key: "open_to_store", label: "앱 열기 → 매장 상세", value: null, unit: "%", source: "ga4" },
        { key: "store_to_coupon", label: "매장 상세 → 쿠폰 발급", value: null, unit: "%", source: "backend" },
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
        { key: "push_open", label: "푸시 → 앱 열기", value: null, unit: "%", source: "push" },
        { key: "banner_ctr", label: "배너 노출 → 클릭", value: null, unit: "%", source: "ga4" },
        { key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", value: null, unit: "%", source: "backend" },
      ],
    },
  ];

  const sources = (Object.keys(SOURCE_LABEL) as Source[]).map((k) => ({
    key: k,
    label: SOURCE_LABEL[k],
    connected: k === "backend" ? s !== null : false,
    hint:
      k === "backend"
        ? "쿠폰·스탬프·가입은 이미 DB 에 있다. 집계 엔드포인트 하나면 된다."
        : k === "push"
          ? "notifications 테이블에 발송 기록이 있다. 열림(open) 이벤트만 앱에서 찍으면 된다."
          : k === "ga4"
            ? "앱에 GA4 SDK 를 넣고 화면 이벤트를 보내면 세션·퍼널이 나온다. 민열님 '추후 연동 예정'."
            : "Firebase Analytics 는 GA4 와 같은 스트림이다. 리텐션 리포트는 여기서 읽는다.",
  }));

  return NextResponse.json({
    groups,
    sources,
    generated_at: new Date().toISOString(),
    draft: true,
    draft_note: "값이 비어 있는 칸은 데이터 소스가 아직 연결되지 않은 것입니다. 0 이 아닙니다.",
  });
}
