import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { proxyBody } from "@/lib/apiProxy";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { clearBackendCache } from "@/lib/draft/toolProxy";
import { notifyAstro } from "@/lib/slack";
import type { Lead, StoreOps } from "@/lib/draft/types";

/**
 * 계약 종료 — 파트너를 보는 어느 탭에서든 행에서 바로 (민열님 0928).
 *
 * 지우지 않는다. 종료한 매장은 앱 DB 에 일반 식당으로 남고, 손님이 쌓아 둔 스탬프·쿠폰 이력도
 * 그대로다. 재계약하면 제휴만 다시 켜면 된다. 진짜 삭제는 테스트 매장에만 있다(TestStoreDelete).
 *
 * 세 곳을 같이 고친다 — 매장 상세(StoreAppSection.endContract)가 하던 둘에 후보를 보탰다.
 *   ① 앱 매장의 제휴를 끈다 → 파트너 매장·계약 탭 목록에서 빠지고 앱에서 혜택이 사라진다
 *   ② 운영값에 종료일을 남긴다 → 파트너 매장 탭 '계약 종료' 칸에서 다시 볼 수 있다
 *   ③ 이 매장에 이어진 후보가 있으면 '보류' 로 옮기고 메모에 날짜를 적는다 → 후보 탭에서도 빠진다
 * ①이 실패하면 거기서 멈추고 실패라고 말한다. ②③은 최선 노력이되 결과를 응답에 적는다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const rid = Number(id);
  if (!Number.isFinite(rid)) return NextResponse.json({ detail: "매장 번호가 아닙니다." }, { status: 400 });
  const { actor } = (await req.json().catch(() => ({}))) as { actor?: string };
  const who = actor?.trim() || "unknown";
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // KST

  // ① 제휴 끄기 — 이게 안 되면 아무것도 안 한 것이다
  const off = await proxyBody("PATCH", `/api/dashboard/admin/restaurants/${rid}/`, { is_affiliate: false });
  if (!off.ok) {
    const d = (await off.json().catch(() => ({}))) as { detail?: string };
    return NextResponse.json({ detail: d.detail ?? `제휴를 끄지 못했습니다 (${off.status}).` }, { status: off.status });
  }
  clearBackendCache();

  // ② 종료일 — 이미 적혀 있으면 그대로 둔다
  const cur = await remoteGet<{ ops: StoreOps | null }>(`/api/astro/stores/${rid}/`);
  const ends = cur.ok ? cur.data?.ops?.contract_ends_on ?? null : null;
  const ops = await remoteSend("PATCH", `/api/astro/stores/${rid}/`, { contract_ends_on: ends ?? today, updated_by: who });

  // ③ 이어진 후보 — 계약 완료 카드가 후보 탭에 계속 서 있으면 '파트너' 로 읽힌다
  let leadName: string | null = null;
  let leadOk: boolean | null = null;
  const leads = await remoteGet<{ leads: Lead[] }>("/api/astro/leads/");
  const lead = leads.ok ? (leads.data?.leads ?? []).find((l) => l.converted_restaurant_id === rid) ?? null : null;
  if (lead) {
    leadName = lead.name;
    const note = `[계약 종료 ${today} · ${who}]`;
    const r = await remoteSend("PATCH", `/api/astro/leads/${lead.id}/`, {
      stage: "보류",
      memo: lead.memo ? `${note}\n${lead.memo}` : note,
    });
    leadOk = r.ok;
  }

  await notifyAstro(`:no_entry: *계약 종료* — 매장 #${rid}${leadName ? ` (${leadName})` : ""} · 종료일 ${ends ?? today} · ${who}`);
  return NextResponse.json({ ok: true, restaurant_id: rid, contract_ends_on: ends ?? today, ops_ok: ops.ok, lead: lead ? { id: lead.id, name: lead.name, moved: leadOk } : null });
}
