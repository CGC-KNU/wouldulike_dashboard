import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * "백엔드 먼저, 없으면 초안" 프록시.
 *
 * Astro 확장·Probe·Castor 의 엔드포인트는 아직 Django 에 없다. 그렇다고 프론트를 목업으로
 * 만들어두면 나중에 백엔드가 생겼을 때 화면을 다시 짜야 한다. 그래서 **호출 경로는 지금부터
 * 진짜로 만들어두고**, 백엔드가 응답하지 못할 때만 초안 데이터로 떨어진다.
 *
 * 재민님/민찬님이 `_backend_changes/{astro,probe,castor}` 의 Django 앱을 올리는 순간
 * 이 파일을 건드리지 않고도 화면이 실데이터로 갈아탄다 (draft 배지가 사라지는 것으로 확인).
 */

type DraftHandler<T> = () => T | Promise<T>;

// 502·503 은 "미구현"이 아니라 장애다 — 장애 때 조용히 초안 파일로 떨어지면 쓰기가 DB 와 파일로 갈라진다 (0911 리뷰 ④).
const NOT_IMPLEMENTED = new Set([404, 405, 501]);
/** 백엔드 앱이 올라간 뒤엔 `DRAFT_FALLBACK=0` 으로 폴백을 끈다. 그러면 미구현 응답도 그대로 에러로 나간다. */
const FALLBACK_ON = process.env.DRAFT_FALLBACK !== "0";

async function token(): Promise<string> {
  const store = await cookies();
  return store.get("access_token")?.value ?? "";
}

function backend(path: string, search?: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${path}${search ? `?${search}` : ""}`;
}

/** 응답에 초안 여부를 실어 보낸다. 화면이 이 플래그로 배지를 띄운다. */
function envelope(data: unknown, draft: boolean, note?: string) {
  return NextResponse.json(
    draft ? { ...(data as object), draft: true, draft_note: note } : { ...(data as object), draft: false },
    { status: 200 }
  );
}

/**
 * GET — 백엔드에 붙여보고, 미구현이면 초안 데이터를 돌려준다.
 * 백엔드가 4xx/5xx 중 "미구현"이 아닌 진짜 에러(401 등)를 주면 그대로 통과시킨다.
 */
export async function getOrDraft<T>(
  path: string,
  draftFn: DraftHandler<T>,
  opts: { search?: string; note?: string } = {}
): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const res = await fetch(backend(path, opts.search), {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: "no-store",
      });
      if (res.ok) {
        const text = await res.text();
        try {
          return envelope(JSON.parse(text), false);
        } catch {
          // Django 디버그 HTML — 미구현으로 간주하고 초안으로 떨어진다
        }
      } else if (!FALLBACK_ON || !NOT_IMPLEMENTED.has(res.status)) {
        const text = await res.text();
        try {
          return NextResponse.json(JSON.parse(text), { status: res.status });
        } catch {
          return NextResponse.json({ detail: text.slice(0, 200) }, { status: res.status });
        }
      }
    } catch {
      // 백엔드 연결 실패 — 초안으로 떨어진다 (킬스위치가 켜져 있으면 502)
      if (!FALLBACK_ON) return NextResponse.json({ detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
    }
  }
  if (!FALLBACK_ON) return NextResponse.json({ detail: "초안 폴백이 꺼져 있습니다 (DRAFT_FALLBACK=0)." }, { status: 501 });
  return envelope(await draftFn(), true, opts.note ?? "백엔드에 아직 이 엔드포인트가 없어 초안 데이터를 보여줍니다.");
}

/** POST/PATCH — 위와 동일한 규칙. 초안 모드에서는 draftFn 이 저장까지 담당한다. */
export async function writeOrDraft<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body: unknown,
  draftFn: DraftHandler<T>,
  opts: { note?: string } = {}
): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const res = await fetch(backend(path), {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Content-Type": "application/json",
        },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      if (res.ok) {
        if (res.status === 204) return new NextResponse(null, { status: 204 });
        const text = await res.text();
        try {
          return envelope(JSON.parse(text), false);
        } catch {
          /* 미구현으로 간주 */
        }
      } else if (!FALLBACK_ON || !NOT_IMPLEMENTED.has(res.status)) {
        const text = await res.text();
        try {
          return NextResponse.json(JSON.parse(text), { status: res.status });
        } catch {
          return NextResponse.json({ detail: text.slice(0, 200) }, { status: res.status });
        }
      }
    } catch {
      if (!FALLBACK_ON) return NextResponse.json({ detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
    }
  }
  if (!FALLBACK_ON) return NextResponse.json({ detail: "초안 폴백이 꺼져 있습니다 (DRAFT_FALLBACK=0)." }, { status: 501 });
  return envelope(await draftFn(), true, opts.note ?? "초안 저장소에 기록했습니다. 백엔드 연결 후에는 DB로 갑니다.");
}

/** 화면에서 restaurants 등 이미 있는 엔드포인트를 서버사이드로 당겨올 때 쓰는 단순 GET. */
export async function fetchBackendJson<T>(path: string, search?: string): Promise<T | null> {
  if (!process.env.NEXT_PUBLIC_API_URL) return null;
  try {
    const res = await fetch(backend(path, search), {
      headers: { Authorization: `Bearer ${await token()}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
