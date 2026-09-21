/**
 * 슬랙 Incoming Webhook 알림 발송 공통 헬퍼.
 *
 * SLACK_FEEDBACK_WEBHOOK_URL 이 설정되어 있지 않으면 조용히 무시한다 —
 * 알림 발송 실패가 원래 요청(댓글 등록 등)을 막으면 안 되므로 항상 캐치한다.
 */
export async function sendSlackNotification(webhookEnvVar: string, text: string): Promise<void> {
  const url = process.env[webhookEnvVar];
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // 슬랙 발송 실패는 무시 — 원래 액션(댓글 등록 등)은 이미 성공했다
  }
}

/**
 * 툴 채널로 보내기 — Astro 의 데이터 변화(계약·입금·후보 단계)를 그 팀 채널에 올린다 (민열님 0913).
 *
 * 두 가지 길을 둔다:
 *   1. `SLACK_BOT_TOKEN` (chat.postMessage) — 배포 알림과 같은 봇. 채널 ID 로 보낸다.
 *   2. `SLACK_ASTRO_WEBHOOK_URL` — 봇을 못 쓸 때의 우회로.
 * 둘 다 없으면 조용히 넘어간다. 알림 실패가 원래 작업(입금 확인 등)을 막으면 안 된다.
 *
 * **연락처·계좌·사업자번호는 보내지 않는다.** 채널에 남는 글이라 매장 이름·금액·상태까지만 적는다.
 */
export async function postToChannel(channelId: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (token) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
      });
      // 슬랙은 **인증 실패에도 HTTP 200** 을 주고 본문에 {ok:false,error:"invalid_auth"} 를 담는다.
      // 그래서 fetch 가 성공했다고 보낸 것이 아니다 — 토큰이 폐기되면 알림이 조용히 사라지고,
      // 점주가 계약을 마쳐도 아무도 모른다. 본문을 보고 실패면 우회로로 넘긴다. (0921)
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (j.ok) return;
      console.error("[slack] chat.postMessage 실패:", j.error ?? `http_${res.status}`, "→ 웹훅으로 재시도");
    } catch (e) {
      console.error("[slack] chat.postMessage 오류:", e, "→ 웹훅으로 재시도");
    }
  }
  await sendSlackNotification("SLACK_ASTRO_WEBHOOK_URL", text);
}

/** Astro(영업) 채널. 매장·후보·입금처럼 세일즈가 바로 알아야 하는 변화만 보낸다. */
export async function notifyAstro(text: string): Promise<void> {
  await postToChannel(ASTRO_CHANNEL_ID, text);
}

/**
 * 세금계산서·입금 알림은 **#ops-partner** 로 간다 (민열님 0915).
 *
 * #sat-astro 는 영업이 후보를 쫓는 채널이라 단계 변경 알림이 하루에도 여러 번 흐른다.
 * 돈이 들어오고 계산서가 나가는 일이 그 사이에 섞이면 묻힌다 — 보는 사람도 다르다.
 */
export async function notifyPartnerOps(text: string): Promise<void> {
  await postToChannel(OPS_PARTNER_CHANNEL_ID, text);
}

/** #sat-astro-세일즈 — lib/satellite.ts 의 TOOLS.astro.slack.id 와 같은 값이다. */
const ASTRO_CHANNEL_ID = "C0BPP3ACEUA";
/** #ops-partner — 파트너 매장 운영(계산서·입금) */
const OPS_PARTNER_CHANNEL_ID = "C0BPSQ7F8LC";

/** 대시보드 딥링크 — PapillonDashboard 가 ?plan=<id> 를 읽어서 바로 에디터를 연다. */
export function planDeepLink(planId: number): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/dashboard/admin?plan=${planId}`;
}
