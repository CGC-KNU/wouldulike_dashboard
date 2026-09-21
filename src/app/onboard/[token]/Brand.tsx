/**
 * 온보딩 화면의 브랜드 표기 — **실제 로고 자산만 쓴다.**
 *
 * 그동안 헤더에 `WOULDULIKE` 를 자간 벌린 대문자 텍스트로 찍고 있었는데, 우리 워드마크는
 * 소문자 라운드체(`wouldulike`)다. 사장님이 계약에 동의하는 화면에서 브랜드가 딴 모습으로
 * 나오면 그 자체로 신뢰를 깎는다. 그래서 public/brand 의 원본에서 잘라낸 두 조각을 쓴다.
 *
 *   symbol.png         숟가락·포크 심볼 (네이비, 319×301)
 *   wordmark-navy.png  소문자 워드마크 (네이비, 651×103)  ← 밝은 배경용
 *   wordmark.png       같은 워드마크 (흰색, 577×101)      ← 네이비 배경용
 *
 * 세 파일 모두 logo.png(정본)에서 나왔다. 정본이 바뀌면 여기도 다시 잘라야 한다.
 */

const SYMBOL_RATIO = 319 / 301;
const WORD_RATIO = 651 / 103;

/** 가로 락업(심볼 + 워드마크) — 화면 상단 머리글용 */
export function BrandLockup({ size = 22, className = "" }: { size?: number; className?: string }) {
  const wordH = Math.round(size * 0.58);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="우주라이크">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/symbol.png" alt="" width={Math.round(size * SYMBOL_RATIO)} height={size} style={{ height: size, width: "auto" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark-navy.png" alt="우주라이크" width={Math.round(wordH * WORD_RATIO)} height={wordH} style={{ height: wordH, width: "auto" }} />
    </span>
  );
}

/** 세로 락업 — 완료 화면처럼 브랜드가 주인공인 자리 */
export function BrandStack({ size = 56, className = "" }: { size?: number; className?: string }) {
  const wordH = Math.round(size * 0.3);
  return (
    <span className={`inline-flex flex-col items-center gap-2 ${className}`} aria-label="우주라이크">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/symbol.png" alt="" width={Math.round(size * SYMBOL_RATIO)} height={size} style={{ height: size, width: "auto" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark-navy.png" alt="우주라이크" width={Math.round(wordH * WORD_RATIO)} height={wordH} style={{ height: wordH, width: "auto" }} />
    </span>
  );
}

/* 흰색 워드마크(public/brand/wordmark.png)는 여기서 쓰지 않는다.
 * logo.png 에서 자른 네이비 워드마크는 소문자 `wouldulike`, 저 파일은 `WouldULike` 로 **글자꼴이 다르다.**
 * 한 화면에 둘이 같이 나오면 브랜드가 두 개로 보인다. 포스터 미리보기는 실물 이미지를 쓰므로
 * 그 자리도 없어졌다. 파일은 포스터·인쇄물이 쓰고 있어 지우지 않는다. (0921)
 */
