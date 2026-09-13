import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";

/**
 * 지도 링크 → 공식 상호. 네이버지도(naver.me · map.naver.com · m.place.naver.com)·카카오맵(place.map.kakao.com · kko.to) 페이지의
 * og:title 을 읽는다. 팀원이 손으로 치는 이름 대신 지도 표기를 쓰게 하려는 것 (민열님 0911). 못 읽으면 null — 사람이 적는다.
 */
const ALLOW = /^(https?:\/\/)?([a-z0-9.-]*\.)?(naver\.me|naver\.com|kakao\.com|kko\.to)(\/|$)/i;

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const url = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!ALLOW.test(url)) return NextResponse.json({ detail: "네이버지도 또는 카카오맵 링크만 읽습니다." }, { status: 400 });
  try {
    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", "Accept-Language": "ko" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    const html = (await res.text()).slice(0, 200_000);
    const meta = (prop: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1] ?? null;
    const raw = meta("og:title") ?? html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null;
    let name = raw ? raw.replace(/\s*[:|·-]\s*(네이버\s*(지도|플레이스)?|카카오맵|Kakao ?Map).*$/i, "").replace(/&amp;/g, "&").trim() : null;
    // 장소가 아니라 서비스 이름만 남으면 못 읽은 것이다
    if (name && /^(네이버\s*(지도|플레이스)?|카카오맵|Kakao ?Map)$/i.test(name)) name = null;
    const provider = /kakao|kko\.to/i.test(url) ? "카카오맵" : "네이버지도";
    return NextResponse.json({ name: name || null, address: meta("og:description")?.split("|")[0]?.trim() ?? null, provider, final_url: res.url });
  } catch {
    return NextResponse.json({ name: null, address: null, detail: "지도 페이지를 읽지 못했습니다. 이름을 직접 적어 주세요." }, { status: 200 });
  }
}
