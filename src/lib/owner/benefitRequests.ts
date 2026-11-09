import { notifyPartnerOps } from "../slack";

interface Created {
  request?: {
    id: number; restaurant_id: number; store_name: string;
    action_label: string; benefit_label: string; before: string; after: string; note: string;
    applies_automatically: boolean;
  };
  replaced?: boolean;
}

export async function submitBenefitRequest<T extends Created>(body: unknown, save: (body: unknown) => Promise<T>, notify = notifyPartnerOps): Promise<T> {
  const data = await save(body);
  // 슬랙이 실패해도 신청은 이미 저장됐다. 사장님에게 실패라고 말하면 두 번 신청한다.
  const q = data?.request;
  if (q) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const lines = [
      `:bell: *혜택 변경 ${data?.replaced ? "신청 수정" : "신청"}* — ${q.store_name || q.restaurant_id}`,
      `• ${q.benefit_label || q.action_label}`,
      `• 「${q.before || "없음"}」 → 「${q.after}」`,
      q.note ? `• 사장님 말씀: ${q.note}` : "",
      q.applies_automatically ? "" : "• *구조 변경 요청입니다* — 승인해도 자동 반영되지 않습니다. 혜택 편집에서 손으로 반영해 주세요.",
      `• 승인: ${base}/dashboard/admin?tab=astro-benefits`,
    ].filter(Boolean);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([notify(lines.join("\n")), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("notification timeout")), 5000);
      })]);
    } catch { /* Saving has succeeded; never invite a duplicate application. */ }
    finally { if (timer) clearTimeout(timer); }
  }
  return data;
}
