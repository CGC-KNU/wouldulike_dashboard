/**
 * 리포트 이미지를 우리 도메인(`/api/img`)으로 돌려 준다.
 *
 * 썸네일 원본은 메타 CDN(CORS 없음)이거나 S3 presigned 다. 바깥 출처 그대로 두면
 * HTML 저장 때 파일에 못 넣고(썸네일 빈 칸), PNG 저장 때는 변환 도구가 이미지를 못 읽는다.
 * 이유는 `src/app/api/img/route.ts` 주석에.
 *
 * ── 반드시 **절대 주소**여야 한다 ──
 * 양식(reportTemplateHtml)의 `url()` 은 `https:` 와 `data:image/` 만 통과시킨다:
 *     function url(u) { return /^(https?:|data:image\/)/.test(u || "") ? esc(u) : ""; }
 * 그래서 `/api/img?...` 같은 상대경로를 주면 **통째로 걸러져** 이미지 자리에 자리표시
 * (「게시물 이미지 · post.image」)가 뜬다. 0923 에 실제로 그렇게 내보냈다 — 프록시를 붙이면서
 * 상대경로를 준 탓에 미리보기에서 썸네일이 아예 사라졌다.
 */

const PROXY_HOSTS = [".cdninstagram.com", ".fbcdn.net", ".amazonaws.com"];

/** `/r/[token]` 라우트의 SITE 와 같은 값 — 양식에 절대 주소로 넣어야 해서 여기도 필요하다. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wouldulike-dashboard.vercel.app";

/** 이미 우리 주소거나 data: 면 그대로. 바깥 이미지면 프록시를 씌운다(절대 주소). */
export function imageProxyHref(url: string | null | undefined, site: string = SITE): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    host = u.hostname;
  } catch {
    return url; // 주소 모양이 아니면 건드리지 않는다
  }
  if (!PROXY_HOSTS.some((s) => host.endsWith(s))) return url;
  return `${site.replace(/\/$/, "")}/api/img?u=${encodeURIComponent(url)}`;
}
