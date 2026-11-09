import { NextRequest, NextResponse } from "next/server";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { submitBenefitRequest } from "@/lib/owner/benefitRequests";

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
  let result: Awaited<ReturnType<typeof remoteSend<Created>>> | undefined;
  const data = await submitBenefitRequest(body, async (payload) => {
    result = await remoteSend<Created>("POST", "/api/astro/benefit-requests/", payload);
    return result.ok ? result.data ?? {} : {};
  });
  if (!result?.handled) return NextResponse.json({ detail: "서버에 닿지 못해 신청을 보내지 못했습니다." }, { status: 503 });
  return NextResponse.json(result.ok ? data : result.data ?? { detail: "신청하지 못했습니다." }, { status: result.status });
}
