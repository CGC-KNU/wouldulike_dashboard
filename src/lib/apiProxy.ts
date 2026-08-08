import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 백엔드 프록시 공통 헬퍼.
 *
 * 기존 프록시들은 `NextResponse.json(await res.json())` 형태였는데,
 * Django 가 500 을 HTML 트레이스백으로 내려주면 `res.json()` 이 throw 하면서
 * 원래 상태 코드와 사유가 통째로 사라진다. 프론트에는 정체불명의 에러만 남는다.
 * 여기서는 JSON 파싱에 실패해도 상태 코드와 요약을 살려서 넘긴다.
 */

export async function getAccessToken(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export function backendUrl(path: string, search?: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${path}${search ? `?${search}` : ""}`;
}

/** 백엔드 응답을 상태 코드 보존하며 JSON 으로 정규화한다. */
export async function passthrough(res: Response): Promise<NextResponse> {
  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const text = await res.text();

  // 정상 JSON
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    // JSON 이 아님 — Django 디버그 트레이스백(HTML), 프록시 에러 페이지 등
  }

  // HTML 에서 사람이 읽을 만한 한 줄을 뽑아낸다
  const detail = summarizeNonJson(text, res.status);
  return NextResponse.json(
    { detail, non_json: true, status: res.status },
    { status: res.status === 200 ? 502 : res.status }
  );
}

function summarizeNonJson(body: string, status: number): string {
  // Django 디버그 페이지의 <title> 에 예외 요약이 들어 있다
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (title) {
    const clean = title.replace(/\s+/g, " ").slice(0, 300);
    // "ProgrammingError at /api/satellite/plans/ ..." 형태
    if (/relation .* does not exist|column .* does not exist|no such table/i.test(body)) {
      return `${clean} — DB 스키마가 코드보다 뒤처져 있습니다. 마이그레이션을 적용해주세요.`;
    }
    return clean;
  }

  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain) return plain.slice(0, 300);
  return `서버가 ${status} 응답을 반환했습니다.`;
}

/** GET 프록시 */
export async function proxyGet(path: string, search?: string): Promise<NextResponse> {
  const token = await getAccessToken();
  try {
    const res = await fetch(backendUrl(path, search), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return passthrough(res);
  } catch (e) {
    return NextResponse.json(
      { detail: `백엔드에 연결하지 못했습니다: ${(e as Error).message}`, unreachable: true },
      { status: 502 }
    );
  }
}

/** 본문이 있는 요청 프록시 (POST / PATCH / PUT) */
export async function proxyBody(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown
): Promise<NextResponse> {
  const token = await getAccessToken();
  try {
    const res = await fetch(backendUrl(path), {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return passthrough(res);
  } catch (e) {
    return NextResponse.json(
      { detail: `백엔드에 연결하지 못했습니다: ${(e as Error).message}`, unreachable: true },
      { status: 502 }
    );
  }
}

/** DELETE 프록시 */
export async function proxyDelete(path: string): Promise<NextResponse> {
  const token = await getAccessToken();
  try {
    const res = await fetch(backendUrl(path), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return passthrough(res);
  } catch (e) {
    return NextResponse.json(
      { detail: `백엔드에 연결하지 못했습니다: ${(e as Error).message}`, unreachable: true },
      { status: 502 }
    );
  }
}
