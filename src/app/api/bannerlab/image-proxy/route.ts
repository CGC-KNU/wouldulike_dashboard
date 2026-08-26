import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/apiProxy";

/**
 * 식당 사진(S3)을 same-origin 으로 중계한다.
 *
 * 배너 스튜디오가 캔버스에 식당 사진을 배경으로 그릴 때 crossOrigin="anonymous" 로
 * 불러오는데, S3 버킷이 CORS 헤더를 내려주지 않으면 브라우저가 로드 자체를 막아버려
 * canvas.toBlob() 이전에 img.onerror 가 터진다. 여기서 서버가 대신 받아와 우리 도메인
 * 으로 재서빙하면 same-origin 이라 CORS 제약이 아예 적용되지 않는다.
 */

const ALLOWED_HOST = /(^|\.)s3(\.[a-z0-9-]+)?\.amazonaws\.com$/i;

export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "인증이 필요합니다." }, { status: 401 });
  }

  const src = req.nextUrl.searchParams.get("url");
  if (!src) {
    return NextResponse.json({ detail: "url 파라미터가 필요합니다." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ detail: "url 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOST.test(parsed.hostname)) {
    return NextResponse.json({ detail: "허용되지 않은 이미지 호스트입니다." }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { detail: `이미지를 불러오지 못했습니다 (${upstream.status}).` },
        { status: upstream.status === 200 ? 502 : upstream.status }
      );
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { detail: `이미지를 불러오지 못했습니다: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
