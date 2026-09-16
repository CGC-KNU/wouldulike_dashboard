import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/**
 * 공동인증서 상태 — **볼타에 직접 묻는다.**
 *
 * 사람이 만료일을 받아 적던 칸은 등록해 놓고도 '미등록'이라고 말했다 (민열님 0916).
 * 진실은 볼타가 갖고 있다. 백엔드가 없으면 초안으로 흉내내지 않는다 — 인증서는
 * '모른다'와 '없다'를 섞으면 안 되는 값이라, 못 읽으면 못 읽었다고 한다.
 */
export interface CertState {
  state: "REGISTERED" | "NOT_REGISTERED" | "NO_KEY" | "NO_ISSUER" | "UNREACHABLE";
  detail?: string;
  issuer_id?: string;
  organization_name?: string;
  representative_name?: string;
  issued_at?: string | null;
  expires_at?: string | null;
  test?: boolean;
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const r = await remoteGet<CertState>("/api/astro/issuer/cert/");
  if (r.handled && r.ok && r.data) return NextResponse.json(r.data);
  return NextResponse.json({ state: "UNREACHABLE", detail: "백엔드에 연결하지 못했습니다." } satisfies CertState);
}

/** 등록·갱신 주소를 받아 온다. 인증서를 올리는 건 대표자 본인이 그 화면에서 한다. */
export async function POST() {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const r = await remoteSend<{ url?: string; detail?: string }>("POST", "/api/astro/issuer/cert/", {});
  if (!r.handled) return NextResponse.json({ detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
  if (!r.ok) return NextResponse.json(r.data ?? { detail: "등록 주소를 받지 못했습니다." }, { status: r.status });
  return NextResponse.json(r.data);
}
