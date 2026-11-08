import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { accessToken, clearBackendCache, fetchBackendResult } from "@/lib/draft/toolProxy";
import { koyebFetch } from "@/lib/draft/koyeb";

/**
 * Probe · 설문 조사 — 앱 내 설문 목록 · 결과 · 켜기/끄기 (1109).
 *
 * GET   ?code=<code>[&version=N]  결과 집계. code 가 없으면 목록.
 * PATCH {code, action: "open", days} | {code, action: "close"}
 *
 * 집계·켜기/끄기는 모두 백엔드(probe/surveys, surveys/ops.py)가 한다. 여기는 권한 확인과 전달만.
 * 초안 파일로 떨어지지 않는다 — 설문을 켜고 끄는 일이라 백엔드가 못 받으면 그대로 실패를 보인다.
 */
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const code = req.nextUrl.searchParams.get("code");
  const version = req.nextUrl.searchParams.get("version");
  if (code && !CODE_RE.test(code)) return NextResponse.json({ detail: "code 형식이 아닙니다." }, { status: 400 });
  if (version && !/^\d+$/.test(version)) return NextResponse.json({ detail: "version 은 숫자입니다." }, { status: 400 });
  const path = code ? `/api/probe/surveys/${code}/` : "/api/probe/surveys/";
  const { status, data } = await fetchBackendResult<Record<string, unknown>>(path, version ? `version=${version}` : undefined);
  if (!data) return NextResponse.json({ detail: status === 404 ? "설문을 찾을 수 없습니다." : "백엔드에서 설문을 읽지 못했습니다." }, { status: status || 502 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => null)) as { code?: unknown; action?: unknown; days?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!CODE_RE.test(code)) return NextResponse.json({ detail: "code 가 필요합니다." }, { status: 400 });
  if (body?.action !== "open" && body?.action !== "close") return NextResponse.json({ detail: "action 은 open · close 입니다." }, { status: 400 });
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return NextResponse.json({ detail: "백엔드 주소가 없습니다." }, { status: 503 });
  const res = await koyebFetch(`${base}/api/probe/surveys/${code}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify(body.action === "open" ? { action: "open", days: body.days } : { action: "close" }),
    cache: "no-store",
  });
  const out = await res.json().catch(() => ({ detail: `백엔드 응답 ${res.status}` }));
  if (res.ok) clearBackendCache(); // 바뀐 상태가 바로 목록에 보이게
  return NextResponse.json(out, { status: res.status });
}
