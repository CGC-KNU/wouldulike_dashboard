import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import { verifyOnboardToken, shortId, stepStampOk } from "@/lib/onboard/token";
import { CHECKS, PLAN_LABEL, TERMS_VERSION, articles, scheduleFrom, startsOnAfter, termsHash, todaySeoul } from "@/lib/onboard/contract";
import { COUPON_EXAMPLES, STAMP_EXAMPLES, sheetRead } from "@/lib/onboard/records";

/**
 * 온보딩 화면이 처음 부르는 것 — 토큰이 유효한지, 어느 매장·플랜인지, 세션이 이 매장 것인지, 어디까지 왔는지.
 * 공개 경로다(미들웨어). 토큰 본문 외에는 아무것도 새지 않는다 — 임시 PIN 은 응답에서 뺀다.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: v.reason === "만료" ? 410 : 404 });
  const p = v.payload;

  // 세션이 있고, 그 세션이 이 매장 점주인지
  const jar = await cookies();
  const access = jar.get("access_token")?.value;
  let session: { ok: boolean; kakao_id: string | null } = { ok: false, kakao_id: null };
  if (access) {
    try {
      const j = decodeJwt<{ restaurant_id?: number; restaurant_ids?: number[]; kakao_id?: number | string; user_id?: number }>(access);
      const rids = [j.restaurant_id, ...(j.restaurant_ids ?? [])].filter((x): x is number => typeof x === "number");
      // 토큰에 매장이 안 실려 있는 백엔드 JWT 도 있다 — 그 경우는 세션 존재만 인정하고 매장 확인은 백엔드 호출에서 걸린다.
      session = { ok: rids.length === 0 || rids.includes(p.rid), kakao_id: j.kakao_id != null ? String(j.kakao_id) : null };
    } catch {
      session = { ok: false, kakao_id: null };
    }
  }

  /**
   * **이미 등록을 마친 매장인가** — 쿠키가 아니라 **원장**으로 판정한다.
   *
   * `done` 은 브라우저 쿠키다. 폰에서 끝내고 며칠 뒤 카톡을 스크롤해 같은 링크를 다시 열면(흔하다)
   * 쿠키가 없는 기기에서는 처음부터 걷고 계약 동의를 두 번째로 하게 된다.
   *
   * ⚠️ 처음엔 "스탬프 규칙이 있으면 끝난 것"으로 봤다. **틀렸다** — 스탬프는 완료의 *필요*조건이지
   * 충분조건이 아니다. [3]혜택에서 등록되고 완료는 [6]이다. 그대로 두면 [3]까지 하고 새로고침한
   * 사장님이 완료 화면으로 튕겨, 입금·키트·완료 기록 없이 끝난 줄 안다. (0921 검토에서 잡음)
   *
   * 그래서 **완료가 실제로 기록된 곳**을 본다 — 시트 원장에 이 매장의 complete/revise 줄이 있는가.
   * 로그인 뒤에만 조회한다(첫 화면을 원장 읽기로 늦추지 않는다).
   */
  let already = false;
  if (session.ok) {
    const rows = await sheetRead("A2:D10000").catch(() => []);
    already = rows.some((r) => Number(r[3]) === p.rid && (r[1] === "complete" || r[1] === "revise"));
  }

  // 아직 동의 전이므로 "오늘 동의한다면" 기준으로 날짜를 미리 보여 준다. 확정은 consent 에서 한다.
  const sched = scheduleFrom(startsOnAfter(todaySeoul()));
  return NextResponse.json({
    ok: true,
    short_id: shortId(p),
    store: { rid: p.rid, lid: p.lid, name: p.name, campus: p.campus, plan: p.plan, plan_label: PLAN_LABEL[p.plan], fee: p.fee, vat: Math.round(p.fee * 0.1) },
    terms: { version: TERMS_VERSION, hash: termsHash(), schedule: sched, articles: articles(), checks: CHECKS.map((c) => ({ id: c.id, article: c.article, text: c.text(sched) })) },
    examples: { stamp: STAMP_EXAMPLES, coupon: COUPON_EXAMPLES },
    session,
    progress: { consent: stepStampOk(p.n, "consent", jar.get(`ob_consent_${p.rid}`)?.value) },
    expires_at: new Date(p.exp * 1000).toISOString(),
    sms_enabled: Boolean(process.env.ONBOARD_SMS_PROVIDER),
    // [4] 입금 안내 — 세금계산서 발행 설정과 같은 값(ASTRO_BANK_*). 없으면 화면이 "담당자가 안내" 로 대체한다.
    bank: process.env.ASTRO_BANK_ACCOUNT ? { name: process.env.ASTRO_BANK_NAME ?? "", account: process.env.ASTRO_BANK_ACCOUNT, holder: process.env.ASTRO_BANK_HOLDER ?? "" } : null,
    done: stepStampOk(p.n, "done", jar.get(`ob_done_${p.rid}`)?.value),
    already,
  });
}
