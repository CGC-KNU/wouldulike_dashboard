import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readChecklist } from "@/lib/onboard/checklist";
import { foldByStore, readLedger } from "@/lib/onboard/reconcile";

/** 계약 탭 [상세] — 사장님이 적은 값(동의·완료 기록) + 등록 현황(사진·스탬프·쿠폰·특별 쿠폰·PIN). ?rid= */
export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rid = Number(req.nextUrl.searchParams.get("rid"));
  if (!Number.isFinite(rid) || rid <= 0) return NextResponse.json({ detail: "rid 가 필요합니다." }, { status: 400 });
  // ?only=check — 견적서처럼 등록 현황만 필요한 화면은 시트 원장(느림, ~10초)을 건너뛴다 (0929)
  const onlyCheck = req.nextUrl.searchParams.get("only") === "check";
  const [ledger, check] = await Promise.all([onlyCheck ? Promise.resolve([]) : readLedger().catch(() => []), readChecklist(rid)]);
  const f = foldByStore(ledger).find((x) => x.rid === rid) ?? null;
  const rec = f?.done ?? f?.consent ?? null;
  return NextResponse.json({
    rid,
    entered: rec ? {
      owner_name: rec.owner_name, biz_no: rec.biz_no, phone: rec.phone, email: rec.email,
      plan: rec.plan, fee: rec.fee, starts_on: rec.starts_on, kit_address: rec.kit_address, signature: rec.signature,
      consent_at: f?.consent?.at ?? null, done_at: f?.done?.at ?? null,
    } : null,
    check,
  });
}
