import { NextRequest, NextResponse } from "next/server";

/**
 * 리포트 안의 **이미지를 우리 도메인으로 통과시키는** 창구.
 *
 * 왜 필요한가 — 리포트 썸네일의 원본은 둘 다 바깥이다:
 *   · `thumb_url` : 메타 CDN(scontent…cdninstagram.com). **CORS 헤더가 없다.**
 *   · `cover_url` : S3 presigned(TTL 600초).
 * 그래서 미리보기 띠의 두 기능이 같이 망가져 있었다(0923 민찬):
 *   · **HTML 저장** — `dataUrl()` 의 `fetch(url, {mode:"cors"})` 가 막혀 이미지를 파일에 못 넣는다.
 *     실패를 조용히 삼켜서, 저장된 파일은 바깥 URL을 그대로 가리키고 열면 썸네일이 비어 있다.
 *   · **PNG 저장** — html-to-image 도 같은 이유로 이미지를 못 읽는다. `cacheBust` 가 붙인 쿼리가
 *     **서명된 URL을 깨뜨려** 403 이 나는 것도 겹친다.
 * 같은 출처로 바꾸면 둘 다 풀린다.
 *
 * 로그인을 요구하지 않는다 — 점주가 받는 `/r/<토큰>` 페이지(로그인 없음)도 이 이미지를 쓴다.
 * 대신 **호스트 화이트리스트 · 리다이렉트 금지 · 크기 상한 · 이미지 타입만** 으로 막는다.
 * 아무 주소나 받아 주면 그냥 공개 프록시가 된다.
 */

/** `download-proxy` 와 같은 버킷. boto3 presigned 는 리전 없는 호스트, 직접 조립한 URL 은 리전 포함. */
const ALLOWED_EXACT = new Set([
  "wouldulike-default-bucket-lunching.s3.amazonaws.com",
  "wouldulike-default-bucket-lunching.s3.ap-northeast-2.amazonaws.com",
]);
/** 메타 CDN 은 호스트가 매번 달라진다(scontent-ssn1-1.cdninstagram.com 등) — 접미사로 본다. */
const ALLOWED_SUFFIX = [".cdninstagram.com", ".fbcdn.net"];

/** 8MB — 리포트 썸네일 한 장이 이보다 클 이유가 없다. */
const MAX_BYTES = 8 * 1024 * 1024;

function allowed(host: string): boolean {
  return ALLOWED_EXACT.has(host) || ALLOWED_SUFFIX.some((s) => host.endsWith(s));
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("u");
  if (!src) return NextResponse.json({ detail: "u 가 필요합니다." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ detail: "잘못된 주소입니다." }, { status: 400 });
  }
  if (target.protocol !== "https:" || !allowed(target.hostname)) {
    return NextResponse.json({ detail: "허용되지 않은 호스트입니다." }, { status: 400 });
  }

  let res: Response;
  try {
    // redirect: "error" — 허용 호스트에서 시작해 딴 데로 튀는 걸 막는다
    res = await fetch(target.toString(), { cache: "no-store", redirect: "error" });
  } catch (e) {
    return NextResponse.json({ detail: `이미지를 불러오지 못했습니다: ${(e as Error).message}` }, { status: 502 });
  }
  if (!res.ok) {
    // 서명 만료(403)도 여기로 온다 — 화면이 "왜 비었는지"를 말할 수 있게 상태를 그대로 넘긴다
    return NextResponse.json({ detail: `이미지를 불러오지 못했습니다 (${res.status})` }, { status: res.status });
  }

  const type = res.headers.get("Content-Type") ?? "";
  if (!type.startsWith("image/")) {
    return NextResponse.json({ detail: "이미지가 아닙니다." }, { status: 415 });
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ detail: "이미지가 너무 큽니다." }, { status: 413 });
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.byteLength),
      // PNG 만드는 동안 같은 이미지를 여러 번 읽는다 — 짧게라도 캐시해 둔다.
      // 원본이 서명 URL이라 오래 잡아 두면 만료 뒤에도 옛 그림을 주게 된다.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
