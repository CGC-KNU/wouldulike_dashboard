import { NextRequest, NextResponse } from "next/server";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedStoreOps } from "@/lib/draft/seed";
import { STORE_OPS_EDITABLE, emptyStoreOps, type StoreOps } from "@/lib/draft/types";
import { actorName, requireTool } from "@/lib/draft/guard";
import { notifyAstro, notifyPartnerOps } from "@/lib/slack";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/** 매장 운영 필드 조회·수정. 수정자와 시각을 반드시 같이 남긴다 (시트가 못 남기던 것). */

const KEY = "astro_store_ops";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const r = await remoteGet<{ ops: StoreOps | null }>(`/api/astro/stores/${id}/`);
  if (r.handled && r.ok) {
    const o = r.data?.ops ?? null;
    return NextResponse.json({ ops: o ? { ...emptyStoreOps(o.id), ...o } : null, draft: false });
  }
  const list = readDraft<StoreOps[]>(KEY, seedStoreOps);
  const found = list.find((o) => String(o.id) === id) ?? null;
  return NextResponse.json({ ops: found ? { ...emptyStoreOps(found.id), ...found } : null, draft: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const rid = parseId(id);
  if (rid === null) return NextResponse.json({ detail: "잘못된 매장 id 입니다." }, { status: 400 });

  const body = (await req.json()) as Partial<StoreOps> & { updated_by?: string };

  // 허용 필드만 받는다 — id·billing_checked_by 같은 걸 클라이언트가 덮어쓰면
  // "누가 확인했는지를 못 박는다"는 이 화면의 존재 이유가 우회된다.
  const who = (await actorName()) ?? body.updated_by ?? "unknown";
  const stamped: Partial<StoreOps> = { updated_at: new Date().toISOString(), updated_by: who };
  for (const k of STORE_OPS_EDITABLE) {
    if (k in body) (stamped as Record<string, unknown>)[k] = body[k];
  }

  // 입금을 "확인"으로 바꾸는 순간, 누가 언제 확인했는지를 같이 못 박는다.
  if (body.billing === "PAID" && !body.billing_checked_at) {
    stamped.billing_checked_at = new Date().toISOString().slice(0, 10);
    stamped.billing_checked_by = who;
  }

  // 백엔드가 원본이면 거기서 고친다.
  const prevRes = await remoteGet<{ ops: StoreOps | null }>(`/api/astro/stores/${rid}/`);
  if (prevRes.handled && prevRes.ok) {
    const prev = prevRes.data?.ops ?? null;
    const r = await remoteSend<{ ops: StoreOps }>("PATCH", `/api/astro/stores/${rid}/`, { ...body, updated_by: who });
    if (r.handled) {
      if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
      await notifyStoreChange(r.data!.ops, prev, body, who);
      return NextResponse.json({ ops: r.data!.ops, draft: false });
    }
  }

  const before = readDraft<StoreOps[]>(KEY, seedStoreOps).find((o) => String(o.id) === id) ?? null;
  const updated = patchDraftItem<StoreOps>(KEY, seedStoreOps, id, stamped);
  if (updated) {
    await notifyStoreChange(updated, before, body, who);
    return NextResponse.json({ ops: updated, draft: true });
  }

  // 아직 운영 행이 없는 매장 — 이 시점에 만든다
  const list = readDraft<StoreOps[]>(KEY, seedStoreOps);
  const created: StoreOps = { ...emptyStoreOps(rid), ...stamped };
  writeDraft(KEY, [...list, created]);
  await notifyStoreChange(created, null, body, who);
  return NextResponse.json({ ops: created, draft: true });
}

/**
 * Astro 채널 알림 — **세일즈가 바로 알아야 하는 변화만** 보낸다 (민열님 0913).
 * 메모·연락처 같은 잔손질까지 보내면 채널이 시끄러워져 아무도 안 본다.
 * 매장 이름은 여기 없으므로(운영 행은 id 만 안다) id 를 적고, 화면 링크를 붙인다.
 */
async function notifyStoreChange(after: StoreOps, before: StoreOps | null, body: Partial<StoreOps>, who: string) {
  // 돈 이야기와 영업 이야기를 갈라 보낸다 (민열님 0915).
  // #sat-astro 는 후보를 쫓는 채널이라 단계 알림이 하루에도 여러 번 흐른다.
  // 입금·청구가 그 사이에 섞이면 묻히고, 보는 사람도 다르다.
  const money: string[] = [];
  const sales: string[] = [];
  if (body.billing === "PAID" && before?.billing !== "PAID") money.push(":white_check_mark: 입금 확인");
  if (body.billing_start_period && body.billing_start_period !== before?.billing_start_period) money.push(`:calendar: 청구 시작 월 ${body.billing_start_period}`);
  if (body.kit_delivered === true && before?.kit_delivered !== true) sales.push(":package: 비치물 전달 완료");
  if (body.contract_started_on && body.contract_started_on !== before?.contract_started_on) sales.push(`:handshake: 계약 시작일 ${body.contract_started_on}`);
  if (body.campus && body.campus !== before?.campus) sales.push(`:round_pushpin: 캠퍼스 ${before?.campus ?? "미지정"} → ${body.campus}`);
  if (money.length === 0 && sales.length === 0) return;

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = base ? ` <${base}/dashboard/admin?tab=astro-ops&open=${after.id}|열기>` : "";
  const head = `:office: *파트너 매장 ${after.id}*`;
  if (money.length) await notifyPartnerOps(`${head} — ${money.join(" · ")} · ${who}${link}`);
  if (sales.length) await notifyAstro(`${head} — ${sales.join(" · ")} · ${who}${link}`);
}
