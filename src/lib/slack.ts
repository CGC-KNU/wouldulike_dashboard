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

/** 대시보드 딥링크 — PapillonDashboard 가 ?plan=<id> 를 읽어서 바로 에디터를 연다. */
export function planDeepLink(planId: number): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/dashboard/admin?plan=${planId}`;
}
