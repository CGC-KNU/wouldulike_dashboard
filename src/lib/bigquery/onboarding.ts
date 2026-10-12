import { clientFromEnv } from "./appMetrics";

/**
 * Probe 앱 지표의 「온보딩 완료율」.
 *
 * 온보딩(인삿말 컷 → 식당 고르기 → 룰렛 → 첫 쿠폰)은 앱이 이미 단계마다 이벤트를 남긴다
 * (`onboarding_intro_view` · `onboarding_coupon_reveal` · `onboarding_complete`). 화면에 칸이 없었을 뿐이다.
 *
 * 기기 단위(`user_pseudo_id`)로 센다 — 출시된 앱은 setUserId 를 안 부르고, 컷마다 `onboarding_intro_view` 가 찍혀
 * 이벤트 건수로 세면 한 사람이 몇 번이든 부풀기 때문이다(실측 117건이 64대).
 * 분모는 인삿말을 본 기기, 분자는 같은 창에서 `onboarding_complete` 를 보낸 기기다. 창 끝에서 막 시작한 사람은
 * 아직 못 끝냈을 수 있어 비율이 조금 낮게 나온다.
 * `onboarding_complete` 는 건너뛰기로 끝나도 찍힌다(skipped) — 「첫 쿠폰 공개」를 같이 줘서 끝까지 간 사람을 따로 본다.
 */
export interface OnboardingFunnel {
  window: { from: string; to: string };
  /** 인삿말을 본 기기 — 분모 */
  started: number;
  /** 그중 첫 쿠폰까지 본 기기 */
  revealed: number;
  /** 그중 온보딩을 마친(건너뛰기 포함) 기기 */
  completed: number;
  rate: number | null;
}

const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export async function readOnboardingFunnel(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string }
): Promise<{ ok: true; data: OnboardingFunnel } | { ok: false; reason: "no_key" | "error"; detail?: string }> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { start, end } = opts;
  if (start > end) return { ok: false, reason: "error", detail: `창이 거꾸로입니다 — ${start} > ${end}` };
  try {
    const [r] = await client.run<{ started: number; revealed: number; completed: number }>(
      `WITH e AS (
         SELECT user_pseudo_id uid, event_name FROM \`${client.dataset}.events_*\`
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end
           AND event_name IN ('onboarding_intro_view','onboarding_coupon_reveal','onboarding_complete')
       ), s AS (SELECT DISTINCT uid FROM e WHERE event_name = 'onboarding_intro_view')
       SELECT COUNT(*) AS started,
              COUNTIF(uid IN (SELECT uid FROM e WHERE event_name = 'onboarding_coupon_reveal')) AS revealed,
              COUNTIF(uid IN (SELECT uid FROM e WHERE event_name = 'onboarding_complete')) AS completed
       FROM s`,
      { start, end }
    );
    const started = Number(r?.started ?? 0);
    const completed = Number(r?.completed ?? 0);
    return {
      ok: true,
      data: { window: { from: dash(start), to: dash(end) }, started, revealed: Number(r?.revealed ?? 0), completed, rate: pct(completed, started) },
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류" };
  }
}
