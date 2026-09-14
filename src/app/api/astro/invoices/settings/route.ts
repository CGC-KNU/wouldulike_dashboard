import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedIssuer } from "@/lib/draft/seed";
import { ISSUER_EDITABLE, type IssuerSettings } from "@/lib/draft/types";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/** 발행 주체 설정 — Console '세금계산서(볼타) 설정'. 볼타 고객 키·인증서 만료일을 여기서 관리한다. */
const KEY = "astro_issuer";
/** 고칠 수 있는 칸은 타입 쪽 한 곳에서 정한다 — 입금 계좌 세 칸이 여기서 빠져 저장이 안 되던 적이 있다. */
const EDITABLE: readonly (keyof IssuerSettings)[] = ISSUER_EDITABLE;

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const r = await remoteGet<{ issuer: IssuerSettings }>("/api/astro/issuer/");
  if (r.handled && r.ok && r.data?.issuer) {
    const remote = r.data.issuer;
    // 막 올린 직후라 비어 있으면 시드 값을 한 번 넣는다.
    if (!remote.name && !remote.biz_no) {
      const seeded = seedIssuer();
      const push = await remoteSend<{ issuer: IssuerSettings }>("PATCH", "/api/astro/issuer/", seeded);
      if (push.ok && push.data?.issuer) return NextResponse.json({ issuer: push.data.issuer, draft: false });
    }
    return NextResponse.json({ issuer: remote, draft: false });
  }
  return NextResponse.json({ issuer: readDraft<IssuerSettings>(KEY, seedIssuer), draft: true });
}

export async function PATCH(req: NextRequest) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as Partial<IssuerSettings>;
  const r = await remoteSend<{ issuer: IssuerSettings }>("PATCH", "/api/astro/issuer/", b);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ issuer: r.data!.issuer, draft: false });
  }

  const cur = readDraft<IssuerSettings>(KEY, seedIssuer);
  const next = { ...cur };
  for (const k of EDITABLE) if (k in b) (next as Record<string, unknown>)[k] = (b[k] as string) || (k === "bolta_customer_key" || k === "cert_expires_at" ? null : "");
  next.updated_at = new Date().toISOString();
  writeDraft(KEY, next);
  return NextResponse.json({ issuer: next, draft: true });
}
