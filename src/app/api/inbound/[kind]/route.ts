import { NextRequest, NextResponse } from "next/server";
import { API } from "@/lib/join";

/**
 * 홈페이지(wouldulike.kr) 상담 요청 · 스팟 견적 대리 입구 (1027).
 * 정적 페이지가 여기로 보내면 서버에서 백엔드 공개 입구(/api/partner/inbound/*)를 부른다 — 백엔드 CORS 는 그대로 둔다.
 * 받는 출처는 우리 홈페이지뿐. 도배 막기 · 금액 계산은 백엔드가 한다.
 */
const ORIGINS = new Set(["https://wouldulike.kr", "https://www.wouldulike.kr"]);
const KINDS = new Set(["consult", "spot"]);

function cors(req: NextRequest): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return ORIGINS.has(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" } : {};
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const h = cors(req);
  if (!KINDS.has(kind)) return NextResponse.json({ detail: "없는 경로입니다." }, { status: 404, headers: h });
  const o = req.headers.get("origin");
  if (o && !ORIGINS.has(o)) return NextResponse.json({ detail: "허용되지 않은 출처입니다." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  try {
    const r = await fetch(`${API()}/api/partner/inbound/${kind}/`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(fwd ? { "X-Forwarded-For": fwd } : {}) },
      body: JSON.stringify(body), cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j, { status: r.status, headers: h });
  } catch {
    return NextResponse.json({ detail: "잠시 연결이 안 됩니다. hello@wouldulike.kr 로 보내 주세요." }, { status: 503, headers: h });
  }
}
