import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { accessToken, clearBackendCache } from "@/lib/draft/toolProxy";
import { koyebFetch } from "@/lib/draft/koyeb";

/**
 * Probe · 설문 조사 — 설문 내용(문구 · 문항 · 선택지) 읽기 · 고치기 · 새로 만들기.
 *
 * GET   ?code=<code>   편집 화면용 전체 내용 (선택지마다 받은 답 수 포함)
 * PATCH {code, ...내용}  문구 · 홈 배너 문구 · 제외 대학가 · 문항 수정 (보낸 항목만 바뀜)
 * POST  {code, title, questions, reward, ...}  새 설문 — 보상 쿠폰 종류 · 발급 캠페인 · 매장 연결도 같이 만든다(꺼진 채로)
 *
 * 검증과 저장은 모두 백엔드(/api/dashboard/admin/surveys/, surveys/editor.py)가 한다.
 * 답이 있는 문항 · 선택지를 지우려 하면 백엔드가 409 로 막는다. 여기는 권한 확인과 전달만.
 * 켜기/끄기와 결과는 ../route.ts (Probe 백엔드) 가 그대로 한다.
 */
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const BASE = "/api/dashboard/admin/surveys/";

async function call(path: string, init: { method: string; body?: unknown }) {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return NextResponse.json({ detail: "백엔드 주소가 없습니다." }, { status: 503 });
  const res = await koyebFetch(`${base}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const out = await res.json().catch(() => ({ detail: `백엔드 응답 ${res.status}` }));
  if (res.ok && init.method !== "GET") clearBackendCache(); // 바뀐 내용이 바로 목록 · 결과에 보이게
  return NextResponse.json(out, { status: res.status });
}

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!CODE_RE.test(code)) return NextResponse.json({ detail: "code 가 필요합니다." }, { status: 400 });
  return call(`${BASE}${code}/`, { method: "GET" });
}

export async function PATCH(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!body || !CODE_RE.test(code)) return NextResponse.json({ detail: "code 가 필요합니다." }, { status: 400 });
  const { code: _code, ...rest } = body;
  void _code;
  return call(`${BASE}${code}/`, { method: "PATCH", body: rest });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ detail: "본문이 필요합니다." }, { status: 400 });
  return call(BASE, { method: "POST", body });
}
