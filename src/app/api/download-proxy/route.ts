import { NextRequest, NextResponse } from "next/server";

/**
 * S3 presigned download_url(response-content-disposition에 원본 한글 파일명이
 * 그대로 박혀 있음)을 직접 열면 S3가 InvalidArgument로 거부한다(ISO-8859-1로
 * 표현 안 되는 헤더 값). 대신 열람용 URL(이미 잘 동작)을 서버에서 받아와, 여기서
 * 직접 RFC 5987 인코딩한 Content-Disposition을 붙여 내려준다.
 * (@/lib/downloadProxy 의 safeDownloadHref 가 링크를 만든다)
 */
const ALLOWED_HOSTS = ["wouldulike-bucket.s3.ap-northeast-2.amazonaws.com"];

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "download";
  if (!src) return NextResponse.json({ detail: "url이 필요합니다." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ detail: "잘못된 url입니다." }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    return NextResponse.json({ detail: "허용되지 않은 호스트입니다." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(target.toString(), { cache: "no-store" });
  } catch (e) {
    return NextResponse.json({ detail: `원본 파일을 불러오지 못했습니다: ${(e as Error).message}` }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    return NextResponse.json({ detail: `원본 파일을 불러오지 못했습니다 (${res.status})` }, { status: res.status || 502 });
  }

  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_") || "download";
  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("Content-Type") ?? "application/octet-stream");
  const len = res.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  return new NextResponse(res.body, { status: 200, headers });
}
