import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getAccessToken } from "@/lib/apiProxy";

/**
 * zip 응답은 바이너리라 다른 라우트들이 쓰는 `passthrough()`(JSON 전제, `res.text()`로
 * 읽음)를 그대로 쓰면 인코딩 왕복 중에 바이트가 깨진다. 여기서는 `arrayBuffer()`로
 * 받아 그대로 돌려주고, Content-Disposition만 백엔드 응답에서 그대로 복사한다.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = await getAccessToken();
  try {
    const res = await fetch(backendUrl(`/api/satellite/plans/${id}/assets/download-zip/`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        detail = JSON.parse(text).detail ?? text;
      } catch {
        /* JSON이 아니면 원문 그대로 */
      }
      return NextResponse.json({ detail: detail || `HTTP ${res.status}` }, { status: res.status });
    }

    const buf = await res.arrayBuffer();
    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") ?? "application/zip");
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new NextResponse(buf, { status: 200, headers });
  } catch (e) {
    return NextResponse.json(
      { detail: `백엔드에 연결하지 못했습니다: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
