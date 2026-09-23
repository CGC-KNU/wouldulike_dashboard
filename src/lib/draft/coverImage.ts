/**
 * 리포트 썸네일을 **스냅샷을 굳히는 순간** 파일째 담는다.
 *
 * 왜 — 지금까지 스냅샷에는 **주소**만 넣었는데 그 주소들이 전부 짧게 살다 죽는다:
 *   · `cover_url` : S3 presigned, **TTL 600초**. 리포트를 만든 지 10분이면 끝이다.
 *   · `thumb_url` : 메타 CDN 서명 주소. 역시 만료된다.
 * 그래서 며칠 뒤 리포트를 열면 403 이 떨어져 이미지가 빈다 — 화면에서도, PNG·HTML 저장에서도.
 * 프록시로는 못 고친다(0923 에 이 길로 여러 번 헛돌았다). **서버에서 불러도 똑같이 403** 이다.
 *
 * 만드는 순간에는 주소가 살아 있으므로, 그때 받아서 data: 로 박아 둔다.
 * 그 뒤로는 만료도 CORS 도 프록시도 없다 — 스냅샷 안에 그림이 들어 있으니까.
 */

/** 스냅샷에 담을 상한. 넘으면 담지 않고 주소를 그대로 둔다(빈 칸보다는 낫다). */
const MAX_BYTES = 2 * 1024 * 1024;

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * 주소를 data: 로 바꾼다. 못 바꾸면 **원래 주소를 그대로** 돌려준다 —
 * 리포트 만들기가 이미지 때문에 실패하면 안 된다.
 */
export async function embedImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!res.ok) return url;
    const type = (res.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!OK_TYPES.includes(type)) return url;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_BYTES) return url;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return url;
  }
}

export const isEmbedded = (url: string | null | undefined): boolean => Boolean(url && url.startsWith("data:"));
