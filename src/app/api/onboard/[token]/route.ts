import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import { verifyOnboardToken, shortId, stepStampOk } from "@/lib/onboard/token";
import { CHECKS, PLAN_LABEL, TERMS_VERSION, articles, scheduleFrom, startsOnAfter, termsHash, todaySeoul } from "@/lib/onboard/contract";
import { COUPON_EXAMPLES, STAMP_EXAMPLES } from "@/lib/onboard/records";

/**
 * 온보딩 화면이 처음 부르는 것 — 토큰이 유효한지, 어느 매장·플랜인지, 세션이 이 매장 것인지, 어디까지 왔는지.
 * 공개 경로다(미들웨어). 토큰 본문 외에는 아무것도 새지 않는다 — 임시 PIN 은 응답에서 뺀다.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: v.reason === "만료" ? 410 : 404 });
  const p = v.payload;

  // 세션이 있고, 그 세션이 이 매장 점주인지
  const jar = await cookies();
  const access = jar.get("access_token")?.value;

  /**
   * 화면 확인용 — **개발 환경에서만.** `?preview=1` 이면 세션이 있는 척한다.
   * [4]입금·[5]키트 같은 뒷단계는 점주 세션이 있어야 그려져서, 디자인을 보려면 매번 계약을
   * 다시 타야 했다. 운영에서는 NODE_ENV 로 완전히 막힌다 — 이 플래그로는 아무것도 쓰지 못한다
   * (쓰기 라우트는 각자 쿠키·스탬프를 따로 본다).
   */
  const previewUi = process.env.NODE_ENV !== "production" && new URL(req.url).searchParams.get("preview") === "1";
  let session: { ok: boolean; kakao_id: string | null } = { ok: false, kakao_id: null };
  if (previewUi) session = { ok: true, kakao_id: null };
  else if (access) {
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
   * **이미 등록을 마친 매장인가** — 완료가 남긴 표식으로 판정한다.
   *
   * 판정 근거를 두 번 갈아엎었다. 남겨 둔다:
   *  1. `done` 쿠키 → 기기가 바뀌면 사라져 사장님이 계약을 두 번 한다.
   *  2. 스탬프 규칙 존재 → **틀렸다.** 스탬프는 [3]에서 등록되고 완료는 [6]이다. 필요조건이지 충분조건이 아니다.
   *  3. 시트 원장 조회 → 옳지만 **Apps Script 가 4~21초** 걸린다(범위와 무관, 실측 0921).
   *     첫 화면이 그만큼 멈춘다. 시트는 페이지 로딩 경로에 둘 수 없다.
   *
   * 그래서 완료 라우트가 스탬프 규칙 `config_json.onboarded_at` 에 표식을 남기고, 여기서는 그것만 본다.
   * 백엔드 한 번, 빠르다. 완료만 쓰는 값이라 충분조건이다. 기기가 바뀌어도 남는다.
   */
  let already = false;
  if (session.ok && access && process.env.NEXT_PUBLIC_API_URL) {
    already = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stamp-rule/?restaurant_id=${p.rid}`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return false;
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        const rule = (j.rule ?? j.stamp_rule ?? j) as { config_json?: { onboarded_at?: string } };
        return Boolean(rule?.config_json?.onboarded_at);
      }).catch(() => false);
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
    // 0925: 이 링크에 미팅 때 받아 둔 번호가 실려 있는가. 실려 있으면 **세션을 만들기 전에**
    // 그 번호를 맞혀야 한다 — 전에는 세션을 먼저 만들고 [0]에서야 물어봐서, 링크를 전달받은
    // 사람이 아무 카카오 계정으로나 그 매장 점주가 될 수 있었다.
    phone_required: Boolean(p.ph),
    // [4] 입금 안내 — 세금계산서 발행 설정과 같은 값(ASTRO_BANK_*). 없으면 화면이 "담당자가 안내" 로 대체한다.
    bank: process.env.ASTRO_BANK_ACCOUNT ? { name: process.env.ASTRO_BANK_NAME ?? "", account: process.env.ASTRO_BANK_ACCOUNT, holder: process.env.ASTRO_BANK_HOLDER ?? "" } : null,
    done: stepStampOk(p.n, "done", jar.get(`ob_done_${p.rid}`)?.value),
    already,
  });
}
