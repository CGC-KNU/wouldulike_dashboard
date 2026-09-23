/**
 * 리포트 이미지를 우리 도메인(`/api/img`)으로 돌려 준다.
 *
 * 썸네일 원본은 메타 CDN(CORS 없음)이거나 S3 presigned 다. 바깥 출처 그대로 두면
 * HTML 저장 때 파일에 못 넣고(썸네일 빈 칸), PNG 저장 때는 변환 도구가 이미지를 못 읽는다.
 * 같은 출처로 바꾸는 것만으로 둘 다 풀린다 — 이유는 `src/app/api/img/route.ts` 주석에.
 */

const PROXY_HOSTS = [".cdninstagram.com", ".fbcdn.net", ".amazonaws.com"];

/** 이미 우리 주소거나 data: 면 그대로. 바깥 이미지면 프록시를 씌운다. */
export function imageProxyHref(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("/")) return url;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    host = u.hostname;
  } catch {
    return url; // 주소 모양이 아니면 건드리지 않는다
  }
  if (!PROXY_HOSTS.some((s) => host.endsWith(s))) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}
