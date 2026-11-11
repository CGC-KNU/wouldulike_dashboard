/**
 * 사장님에게 **청구서를 보여 줘도 되는 단계인가** (0924).
 *
 * 전에는 상태를 안 보고 입금일 유무만 봤다. 그래서 아직 우리 내부 품의 단계인 초안 금액이
 * 사장님 화면에 "대기" 칩과 함께 떴다 — 승인도 발행도 안 된 숫자다.
 * 국세청에 실제로 나간 뒤(발행 중·발행 완료)부터만 보여 준다. 그 전에는 금액을 말하지 않는다.
 */
export function invoiceVisible(invoice: { status?: string; paid_at?: unknown } | null | undefined): boolean {
  return !!invoice && (["ISSUING", "ISSUED"].includes(invoice.status ?? "") || !!invoice.paid_at);
}
export function reportStatus(days: number | null, count: number | null) {
  const state = days === null ? "unknown_start" : days < 30 ? "collecting" : count === null ? "unavailable"
    : count > 0 ? "available" : days > 45 ? "delayed" : "preparing";
  return { state, days_until_first: days === null ? null : Math.max(0, 30 - days), available_count: count };
}
