/**
 * 파일 업로드 실패 문구.
 *
 * 업로드는 우리 서버가 아니라 S3 로 파일을 직접 보낸다(presigned PUT). 그래서
 * 브라우저가 요청 자체를 막으면 응답이 없고, `fetch` 는 상태 코드 대신 TypeError 를
 * 던진다. 사파리는 그 메시지를 "Load failed", 크롬은 "Failed to fetch" 라고만 적는다.
 * 그대로 보여 주면 받는 사람은 무엇이 잘못됐는지 알 길이 없다.
 *
 * 2026-09-25 실제 사고: 대시보드 주소를 app.wouldulike.kr 로 옮기면서 S3 버킷의
 * 허용 주소 목록에 새 주소를 넣지 않아, 업로드하는 화면 여섯 곳이 한꺼번에 막혔다.
 * 화면에 뜬 문구는 "04.png: Load failed" 하나뿐이었다.
 */
export function uploadFailureMessage(e: unknown, fileName?: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  const prefix = fileName ? `${fileName}: ` : "";
  const blocked =
    e instanceof TypeError || /load failed|failed to fetch|networkerror|network error/i.test(raw);

  if (!blocked) return `${prefix}${raw}`;

  return (
    `${prefix}파일 저장소에 닿지 못했습니다.\n\n` +
    `인터넷 연결이 끊겼거나, 지금 쓰고 계신 주소가 저장소 허용 목록에 없어 브라우저가 막은 경우입니다.\n` +
    `연결이 멀쩡한데도 계속 나오면 이 문구 그대로 개발팀에 알려주세요.\n\n` +
    `주소 ${typeof window === "undefined" ? "?" : window.location.origin} · 원문 "${raw}"`
  );
}
