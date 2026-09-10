import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedIssuer } from "@/lib/draft/seed";
import type { IssuerSettings } from "@/lib/draft/types";

/** 발행 주체 설정 — Console '세금계산서(볼타) 설정'. 볼타 고객 키·인증서 만료일을 여기서 관리한다. */
const KEY = "astro_issuer";
const EDITABLE: (keyof IssuerSettings)[] = ["name", "biz_no", "ceo", "address", "email", "bolta_customer_key", "cert_expires_at", "item_template", "approver", "slack_channel"];

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  return NextResponse.json({ issuer: readDraft<IssuerSettings>(KEY, seedIssuer), draft: true });
}

export async function PATCH(req: NextRequest) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as Partial<IssuerSettings>;
  const cur = readDraft<IssuerSettings>(KEY, seedIssuer);
  const next = { ...cur };
  for (const k of EDITABLE) if (k in b) (next as Record<string, unknown>)[k] = (b[k] as string) || (k === "bolta_customer_key" || k === "cert_expires_at" ? null : "");
  next.updated_at = new Date().toISOString();
  writeDraft(KEY, next);
  return NextResponse.json({ issuer: next, draft: true });
}
