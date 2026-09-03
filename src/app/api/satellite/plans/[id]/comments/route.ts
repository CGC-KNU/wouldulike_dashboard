import { NextRequest, NextResponse } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";
import { planDeepLink, sendSlackNotification } from "@/lib/slack";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyGet(`/api/satellite/plans/${id}/comments/`);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const res = await proxyBody("POST", `/api/satellite/plans/${id}/comments/`, body);

  if (res.status >= 200 && res.status < 300) {
    const comment = await res.clone().json().catch(() => null);
    if (comment) {
      const kind = comment.parent_id != null ? "답글" : "피드백";
      const text =
        `💬 새 ${kind} — *${comment.author_name}*\n` +
        `${comment.body}\n` +
        `<${planDeepLink(Number(id))}|대시보드에서 보기>`;
      await sendSlackNotification("SLACK_FEEDBACK_WEBHOOK_URL", text);
    }
  }

  return res;
}
