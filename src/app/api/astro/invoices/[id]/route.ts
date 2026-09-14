import { NextRequest, NextResponse } from "next/server";
import { actorName, isAdminActor, requireTool } from "@/lib/draft/guard";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedInvoices, seedIssuer, seedStoreOps } from "@/lib/draft/seed";
import { emptyStoreOps, type IssuerSettings, type StoreOps, type TaxInvoice } from "@/lib/draft/types";
import { notifyAstro } from "@/lib/slack";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/**
 * 계산서 한 건의 상태 전이. 세발의 approve / cancel / sync / 재시도 를 하나의 action 으로 받는다.
 *
 *   approve   PENDING → APPROVED          승인자·시각 기록, 슬랙 🧾
 *   reject    PENDING → REJECTED          사유 필수
 *   issue     APPROVED → ISSUING → ?      볼타 키가 있으면 발행 호출(미구현) → RESULT_UNKNOWN 으로 멈춘다. 없으면 거부
 *   mark-issued  * → ISSUED               볼타/홈택스에서 사람이 발행한 뒤 승인번호를 적는다. 슬랙 ✅. 매장 운영의 invoice=ISSUED
 *   sync      ISSUING|RESULT_UNKNOWN → ?  볼타 상태 동기화(미구현) — 그대로 둔다
 *   cancel    !ISSUED → CANCELED
 *   mark-paid ISSUED → paid_at            매장 운영의 billing=PAID (입금 현황과 같은 값). 날짜를 주면 그 날로 찍는다
 *   unmark-paid  paid_at → null           잘못 눌렀을 때 되돌린다. 매장 운영의 billing 은 '입금 대기'로
 */

const KEY = "astro_invoices";
type Action = "approve" | "reject" | "issue" | "mark-issued" | "sync" | "cancel" | "mark-paid" | "unmark-paid" | "edit";

/** "2026-09-14" 같은 날짜만 받는다. 미래 날짜는 입금일이 될 수 없다. */
function normalizePaidAt(v: string | undefined, now: string): string | null {
  if (!v) return now;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  if (v > now.slice(0, 10)) return null;
  return `${v}T00:00:00.000Z`;
}

function syncOps(inv: TaxInvoice, patch: Partial<StoreOps>, by: string) {
  const list = [...readDraft<StoreOps[]>("astro_store_ops", seedStoreOps)];
  const idx = list.findIndex((o) => o.id === inv.restaurant_id);
  const base = { ...emptyStoreOps(inv.restaurant_id), ...(idx === -1 ? {} : list[idx]) };
  const next = { ...base, ...patch, updated_at: new Date().toISOString(), updated_by: by };
  if (idx === -1) list.push(next); else list[idx] = next;
  writeDraft("astro_store_ops", list);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { action?: Action; by?: string; reason?: string; nts_no?: string; url?: string; memo?: string; supply?: number; tax?: number; title?: string; paid_at?: string };
  // 백엔드가 원본이면 상태 전이도 거기서 한다. 슬랙 문구는 어느 쪽이든 여기서 만든다.
  const remoteList = await remoteGet<{ invoices: TaxInvoice[] }>("/api/astro/invoices/");
  if (remoteList.handled && remoteList.ok) {
    const before = (remoteList.data?.invoices ?? []).find((i) => i.id === id) ?? null;
    if (!before) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
    const r = await remoteSend<{ invoice: TaxInvoice }>("PATCH", `/api/astro/invoices/${id}/`, b);
    if (r.handled) {
      if (!r.ok) return NextResponse.json(r.data ?? { detail: "처리하지 못했습니다." }, { status: r.status });
      const after = r.data!.invoice;
      const msg = slackFor(b.action, before, after, (await actorName()) ?? b.by ?? "unknown");
      if (msg) await notifyAstro(msg);
      return NextResponse.json({ invoice: after, draft: false });
    }
  }

  const inv = readDraft<TaxInvoice[]>(KEY, seedInvoices).find((i) => i.id === id);
  if (!inv) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  // "누가"는 서버가 찍는다. 본문 by 는 백엔드를 못 읽을 때의 마지막 폴백.
  const by = (await actorName()) ?? b.by ?? "unknown";
  // 승인·반려·발행은 승인권자(관리자)만 — 버튼을 숨기는 건 권한이 아니다.
  if (["approve", "reject", "issue", "mark-issued"].includes(b.action ?? "") && !(await isAdminActor())) return NextResponse.json({ detail: "승인권자(관리자)만 할 수 있습니다." }, { status: 403 });
  const now = new Date().toISOString();
  const bad = (msg: string) => NextResponse.json({ detail: msg }, { status: 409 });
  let patch: Partial<TaxInvoice> = {};
  let slack: string | null = null;

  switch (b.action) {
    case "approve":
      if (inv.status !== "PENDING") return bad("품의 상태에서만 승인할 수 있습니다.");
      patch = { status: "APPROVED", approved_by: by, approved_at: now };
      slack = `:receipt: *발행 요청(승인)* — ${inv.name} · ${inv.title} · ${inv.total.toLocaleString()}원 · 승인 ${by}`;
      break;
    case "reject":
      if (inv.status !== "PENDING") return bad("품의 상태에서만 반려할 수 있습니다.");
      if (!b.reason?.trim()) return NextResponse.json({ detail: "반려 사유가 필요합니다." }, { status: 400 });
      patch = { status: "REJECTED", reject_reason: b.reason.trim() };
      break;
    case "issue": {
      if (inv.status !== "APPROVED" && inv.status !== "FAILED") return bad("승인된 건만 발행할 수 있습니다.");
      const issuer = readDraft<IssuerSettings>("astro_issuer", seedIssuer);
      if (!issuer.bolta_customer_key) return bad("볼타 고객이 등록되지 않았습니다. 설정에서 볼타 고객 키와 공동인증서를 먼저 등록하거나, 홈택스에서 발행한 뒤 '발행 완료로 표시'하세요.");
      // 볼타 API 호출 자리. 응답이 없으면 RESULT_UNKNOWN 으로 멈춘다 — 재시도 클릭이 이중 발행을 만들지 않게.
      patch = { status: "RESULT_UNKNOWN", attempts: inv.attempts + 1, fail_code: "BOLTA_NOT_WIRED" };
      break;
    }
    case "mark-issued":
      if (inv.status === "ISSUED") return bad("이미 발행 완료입니다.");
      if (inv.status === "CANCELED" || inv.status === "REJECTED") return bad("취소·반려된 건은 발행 완료로 바꿀 수 없습니다.");
      patch = { status: "ISSUED", issued_at: now, nts_no: b.nts_no?.trim() || null, url: b.url?.trim() || null, approved_by: inv.approved_by ?? by, approved_at: inv.approved_at ?? now };
      syncOps(inv, { invoice: "ISSUED" }, by);
      slack = `:white_check_mark: *발행 완료* — ${inv.name} · ${inv.title} · ${inv.total.toLocaleString()}원${b.nts_no ? ` · 승인번호 ${b.nts_no}` : ""}`;
      break;
    case "sync":
      if (inv.status !== "ISSUING" && inv.status !== "RESULT_UNKNOWN") return bad("발행 중·결과 불명 상태에서만 동기화합니다.");
      return bad("볼타 상태 동기화는 아직 연결되지 않았습니다. 볼타 대시보드에서 실제 발행 여부를 확인한 뒤 '발행 완료로 표시'하세요.");
    case "cancel":
      if (inv.status === "ISSUED") return bad("발행 완료 건은 취소가 어렵습니다. 국세청 수정세금계산서로 처리하세요.");
      patch = { status: "CANCELED" };
      break;
    case "mark-paid": {
      // 월납은 발행 전에 돈이 먼저 오기도 한다. 입금은 입금대로 찍고, 계산서 상태는 건드리지 않는다 (발행 완료로 '만들지' 않는다 — 0911 리뷰).
      if (inv.status === "CANCELED" || inv.status === "REJECTED") return bad("취소·반려된 건에는 입금을 찍을 수 없습니다.");
      if (inv.paid_at) return bad("이미 입금 확인된 건입니다.");
      // 돈은 대개 어제 들어와 있고 우리는 오늘 확인한다. 날짜를 주면 그 날로 찍는다 (민열님 0914).
      const at = normalizePaidAt(b.paid_at, now);
      if (!at) return NextResponse.json({ detail: "입금일은 YYYY-MM-DD 형식의 오늘 이전 날짜여야 합니다." }, { status: 400 });
      patch = { paid_at: at };
      syncOps(inv, { billing: "PAID", billing_checked_at: at.slice(0, 10), billing_checked_by: by }, by);
      break;
    }
    case "unmark-paid":
      // 잘못 누른 것을 되돌린다. 되돌린 사실도 누가 언제 했는지 남긴다 — 지우는 게 아니라 고치는 것이다.
      if (!inv.paid_at) return bad("입금으로 찍힌 건이 아닙니다.");
      patch = { paid_at: null };
      syncOps(inv, { billing: "PENDING", billing_checked_at: now.slice(0, 10), billing_checked_by: by }, by);
      slack = `:leftwards_arrow_with_hook: *입금 확인 취소* — ${inv.name} · ${inv.title} · ${inv.total.toLocaleString()}원 · ${by}`;
      break;
    case "edit":
      if (inv.status !== "PENDING" && inv.status !== "REJECTED" && inv.status !== "FAILED") return bad("품의·반려·실패 상태에서만 고칠 수 있습니다.");
      patch = {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(typeof b.supply === "number" && typeof b.tax === "number" ? { supply: b.supply, tax: b.tax, total: b.supply + b.tax } : {}),
        ...(b.memo !== undefined ? { memo: b.memo || null } : {}),
        ...(inv.status !== "PENDING" ? { status: "PENDING" as const, reject_reason: null, fail_code: null } : {}),
      };
      break;
    default:
      return NextResponse.json({ detail: "알 수 없는 action" }, { status: 400 });
  }

  const updated = patchDraftItem<TaxInvoice>(KEY, seedInvoices, id, patch);
  if (slack) await notifyAstro(slack);
  return NextResponse.json({ invoice: updated, draft: true });
}

/** 상태 전이마다 슬랙에 뭐라고 쓸지. 백엔드 경로와 초안 경로가 같은 문구를 쓰게 한 곳에 둔다. */
function slackFor(action: string | undefined, before: TaxInvoice, after: TaxInvoice, by: string): string | null {
  const won = after.total.toLocaleString();
  switch (action) {
    case "approve":
      return `:receipt: *발행 요청(승인)* — ${after.name} · ${after.title} · ${won}원 · 승인 ${by}`;
    case "mark-issued":
      return `:white_check_mark: *발행 완료* — ${after.name} · ${after.title} · ${won}원${after.nts_no ? ` · 승인번호 ${after.nts_no}` : ""}`;
    case "unmark-paid":
      return `:leftwards_arrow_with_hook: *입금 확인 취소* — ${after.name} · ${after.title} · ${won}원 · ${by}`;
    case "mark-paid":
      return before.paid_at ? null : `:moneybag: *입금 확인* — ${after.name} · ${won}원${after.paid_at ? ` · ${after.paid_at.slice(0, 10)}` : ""} · ${by}`;
    default:
      return null;
  }
}
