/**
 * 개별 사진 다운로드 링크 헬퍼.
 *
 * 백엔드가 내려주는 `download_url`은 S3 presigned URL에 원본 파일명을 그대로
 * `response-content-disposition=attachment; filename="라라더협찬_1.jpg"`로 박아
 * 넣는데, S3는 이 값이 ISO-8859-1로 표현되지 않으면(한글 등) 요청 자체를
 * InvalidArgument로 거부한다("사진 전체 다운로드" zip은 백엔드가 ASCII
 * 파일명(zip)만 쓰기 때문에 이 문제가 없다).
 *
 * download_url을 직접 열지 않고, 이미 잘 동작하는 열람용 URL(preview_url /
 * image_url)을 /api/download-proxy로 넘겨 서버에서 직접 RFC 5987 인코딩한
 * Content-Disposition을 붙여 내려받는다. download_url은 원본 파일명을 꺼내는
 * 용도로만 쓴다.
 */
export function safeDownloadHref(viewUrl: string, downloadUrl?: string | null): string {
  let filename = "";
  if (downloadUrl) {
    try {
      const disp = new URL(downloadUrl).searchParams.get("response-content-disposition") ?? "";
      const rfc5987 = disp.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = disp.match(/filename="?([^";]+)"?/i);
      const raw = rfc5987?.[1] ?? plain?.[1];
      if (raw) filename = decodeURIComponent(raw);
    } catch {
      // downloadUrl이 없거나 파싱할 수 없으면 파일명 없이 진행
    }
  }
  const params = new URLSearchParams({ url: viewUrl });
  if (filename) params.set("filename", filename);
  return `/api/download-proxy?${params.toString()}`;
}
