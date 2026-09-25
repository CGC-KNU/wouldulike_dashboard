import { NextRequest, NextResponse } from "next/server";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { notifyPartnerOps } from "@/lib/slack";

/**
 * 혜택 변경 신청 — 점주가 올리고, 우리가 승인한다 (민열님 0924).
 *
 * ## 초안 폴백이 없는 이유
 * 다른 Astro 화면은 백엔드가 없으면 파일 저장소로 떨어진다. 이건 안 그런다 —
 * "신청했습니다" 라고 말해 놓고 우리 쪽에 안 와 있으면 사장님은 기다리기만 한다.
 * 못 보냈으면 못 보냈다고 말한다.
 */

export async function GET(req: NextRequest) {
  const r = await remoteGet<unknown>("/api/astro/benefit-requests/", req.nextUrl.searchParams.toString());
  if (!r.handled) {
    return NextResponse.json({ detail: "서버에 닿지 못해 신청 내역을 읽지 못했습니다." }, { status: 503 });
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}

interface Created {
  request?: {
    id: number; restaurant_id: number; store_name: string;
    action_label: string; benefit_label: string; before: string; after: string; note: string;
    applies_automatically: boolean;
  };
  replaced?: boolean;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const r = await remoteSend<Created>("POST", "/api/astro/benefit-requests/", body);
  if (!r.handled) {
    return NextResponse.json({ detail: "서버에 닿지 못해 신청을 보내지 못했습니다." }, { status: 503 });
  }
  if (!r.ok) return NextResponse.json(r.data ?? { detail: "신청하지 못했습니다." }, { status: r.status });

  // 슬랙이 실패해도 신청은 이미 저장됐다. 사장님에게 실패라고 말하면 두 번 신청한다.
  const q = r.data?.request;
  if (q) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const lines = [
      `:bell: *혜택 변경 ${r.data?.replaced ? "신청 수정" : "신청"}* — ${q.store_name || q.restaurant_id}`,
      `• ${q.benefit_label || q.action_label}`,
      `• 「${q.before || "없음"}」 → 「${q.after}」`,
      q.note ? `• 사장님 말씀: ${q.note}` : "",
      q.applies_automatically ? "" : "• *구조 변경 요청입니다* — 승인해도 자동 반영되지 않습니다. 혜택 편집에서 손으로 반영해 주세요.",
      `• 승인: ${base}/dashboard/admin?tab=astro-benefits`,
    ].filter(Boolean);
    try { await notifyPartnerOps(lines.join("\n")); } catch { /* 알림 실패는 삼킨다 */ }
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}
