import { NextRequest, NextResponse } from "next/server";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { notifyPartnerOps } from "@/lib/slack";

/**
 * 혜택 변경 신청 — 점주가 올리고, 우리가 승인한다 (민열님 0924).
 *
 * ## 왜 여기에 `requireTool` 이 없나
 * 이 길은 **점주도 지나간다.** 관리자 권한을 요구하면 점주가 자기 신청을 못 올린다.
 * 누가 무엇을 볼지는 백엔드가 토큰을 보고 정한다 — 점주면 자기 매장 것만, 관리자면 전부.
 * 여기서 한 번 더 막으면 규칙이 두 곳에 생기고 반드시 어긋난다.
 *
 * ## 초안 폴백이 없는 이유
 * 다른 Astro 화면은 백엔드가 없으면 파일 저장소로 떨어진다. 이건 안 그런다 —
 * "신청했습니다"라고 말해 놓고 우리 쪽에 안 와 있으면 점주는 기다리기만 한다.
 * 못 보냈으면 못 보냈다고 말한다.
 */

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const r = await remoteGet<unknown>(`/api/astro/benefit-requests/`, qs);
  if (!r.handled) {
    return NextResponse.json({ detail: "서버에 닿지 못해 신청 내역을 읽지 못했습니다." }, { status: 503 });
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}

interface Created {
  request?: {
    id: number; restaurant_id: number; store_name: string;
    field_label: string; before: string; after: string; note: string; requested_by: string;
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

  // 슬랙 알림이 실패해도 신청 자체는 이미 저장됐다. 점주에게 실패라고 말하면 두 번 신청한다.
  const q = r.data?.request;
  if (q) {
    const head = r.data?.replaced ? "혜택 변경 신청 *수정*" : "혜택 변경 *신청*";
    const lines = [
      `:bell: *${head}* — ${q.store_name || q.restaurant_id}`,
      `• ${q.field_label}: 「${q.before || "없음"}」 → 「${q.after}」`,
      q.note ? `• 사장님 말씀: ${q.note}` : "",
      `• ASTRO 에서 승인해 주세요 — ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard/admin?tool=astro&tab=benefit-requests`,
    ].filter(Boolean);
    try { await notifyPartnerOps(lines.join("\n")); } catch { /* 알림 실패는 삼킨다 */ }
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}
