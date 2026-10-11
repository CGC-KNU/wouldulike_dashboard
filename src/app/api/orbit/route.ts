import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getAccessToken, proxyGet } from "@/lib/apiProxy";
import { actorName } from "@/lib/draft/guard";
import type { Board } from "@/lib/orbit";

/**
 * Orbit 현황판 — 백엔드 `/api/astro/orbit/` 프록시 (1011).
 * 저장이 되면 **단계가 바뀐 건만** 그 건의 슬랙 스레드에 한 줄 남긴다(민열님 결정 ⑤). 스레드가 없으면 남기지 않는다.
 */
export async function GET() {
  return proxyGet("/api/astro/orbit/");
}

async function threadReply(ch: string, ts: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: ch, thread_ts: ts, text, unfurl_links: false }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!j.ok) console.error("[orbit] 슬랙 스레드 답글 실패:", j.error);
  } catch (e) { console.error("[orbit] 슬랙 오류:", e); }
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { projects?: unknown; base_updated_at?: string | null };
  const who = (await actorName()) ?? "";
  const headers = { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" };
  const before = (await fetch(backendUrl("/api/astro/orbit/"), { headers, cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Board | null;
  const res = await fetch(backendUrl("/api/astro/orbit/"), { method: "PUT", headers, body: JSON.stringify({ projects: body.projects, base_updated_at: body.base_updated_at ?? null, updated_by: who }), cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as Board & { detail?: string };
  if (res.ok && before) {
    const old = new Map(before.projects.map((p) => [p.id, p.stage]));
    for (const p of data.projects ?? []) {
      const prev = old.get(p.id);
      if (!prev || prev === p.stage || !p.slack?.ch || !p.slack?.ts) continue;
      const left = p.todos.filter((t) => !t.done).map((t) => t.text).slice(0, 3);
      await threadReply(p.slack.ch, p.slack.ts,
        `:arrows_counterclockwise: *Orbit 단계 변경* — ${prev} → *${p.stage}* · ${who || "세틀라이트"}${p.owners.length ? ` · 담당 ${p.owners.join(" · ")}` : ""}` +
        (left.length ? `\n남은 할 일: ${left.join(" · ")}` : "") +
        `\n<https://app.wouldulike.kr/dashboard/admin?tab=orbit-board&p=${p.id}|Orbit에서 보기>`);
    }
  }
  return NextResponse.json(data, { status: res.status });
}
