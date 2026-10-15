/**
 * `/api/img` 가 통과시키는 이미지 호스트 — 라우트와 리포트가 **같은 목록**을 본다.
 *
 * 리포트에 싣는 그림은 PNG·HTML 저장 때 이 창구를 거쳐야 읽힌다(바깥 출처는 CORS 가 없다).
 * 목록 밖 주소를 리포트에 넣으면 화면엔 보여도 저장한 파일에서는 빈다 — 넣기 전에 여기로 거른다.
 */

/** `download-proxy` 와 같은 버킷. boto3 presigned 는 리전 없는 호스트, 직접 조립한 URL(가게 사진)은 리전 포함. */
const ALLOWED_EXACT = new Set([
  "wouldulike-default-bucket-lunching.s3.amazonaws.com",
  "wouldulike-default-bucket-lunching.s3.ap-northeast-2.amazonaws.com",
]);
/** 메타 CDN 은 호스트가 매번 달라진다(scontent-ssn1-1.cdninstagram.com 등) — 접미사로 본다. */
const ALLOWED_SUFFIX = [".cdninstagram.com", ".fbcdn.net"];

export function imageHostAllowed(host: string): boolean {
  return ALLOWED_EXACT.has(host) || ALLOWED_SUFFIX.some((s) => host.endsWith(s));
}

/** https 이고 허용 호스트인 주소인가 — 못 읽는 주소는 false */
export function proxyableImage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && imageHostAllowed(u.hostname);
  } catch {
    return false;
  }
}
