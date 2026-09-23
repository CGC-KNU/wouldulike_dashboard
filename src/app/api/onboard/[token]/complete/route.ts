import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import { shortId, stepStamp, stepStampOk, verifyOnboardToken } from "@/lib/onboard/token";
import { PLAN_LABEL, TERMS_VERSION, kdate, startsOnAfter, termsHash, todaySeoul } from "@/lib/onboard/contract";
import { anyCopy, clientMeta, notifyOnboard, persistRecord, type ConsentRecord } from "@/lib/onboard/records";

const API = () => process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * [6] 완료 — 서버가 순서를 강제한다.
 *
 *  1. [2] 동의 스탬프 쿠키가 있어야 한다 (없으면 계약 안 한 것).
 *  2. 스탬프 규칙이 실제로 백엔드에 있어야 한다 — **스탬프 필수** (민열님 0921). 쿠폰은 선택.
 *  3. 완료 기록을 남기고(활동·시트·드라이브), 후보가 있으면 단계를 '계약 완료'로(최선 노력), #ops-partner 에 알린다.
 *
 * 리드 단계 PATCH 는 점주 토큰으로는 403 일 수 있다. 그래서 실패해도 완료를 막지 않고, 슬랙 문장을
 * 리브라가 읽는 모양("계약 <매장> <플랜>")으로 써서 사람이 안 눌러도 시트·세틀라이트가 따라오게 한다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ detail: `링크가 유효하지 않습니다 (${v.reason}).` }, { status: 400 });
  const p = v.payload;

  const jar = await cookies();
  const access = jar.get("access_token")?.value;
  if (!access) return NextResponse.json({ detail: "로그인이 필요합니다." }, { status: 401 });
  if (!stepStampOk(p.n, "consent", jar.get(`ob_consent_${p.rid}`)?.value)) {
    return NextResponse.json({ detail: "계약 동의 단계가 완료되지 않았습니다.", step: 2 }, { status: 409 });
  }

  const b = (await req.json().catch(() => ({}))) as { owner_name?: string; biz_no?: string; phone?: string; email?: string; kit_address?: string; kit_ok?: boolean; signature?: string; revision?: boolean; contract_url?: string | null };
  const kit_address = (b.kit_address ?? "").trim();
  // 이미 끝낸 뒤 배송지만 고치러 돌아온 경우. 원장은 append-only 라 수정도 한 줄로 남는다 —
  // 무엇이 언제 바뀌었는지가 곧 증거다. 다만 슬랙에서 신규 등록처럼 보이면 안 된다.
  const revision = Boolean(b.revision);
  if (!b.kit_ok || !kit_address) return NextResponse.json({ detail: "웰컴 키트 배송지를 확인해 주세요.", step: 5 }, { status: 400 });

  // 2) 스탬프 필수 — 규칙이 없으면 완료 불가
  const stamp = await fetch(`${API()}/api/dashboard/stamp-rule/?restaurant_id=${p.rid}`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : null)).catch(() => null);
  const stamp_ok = hasStampRule(stamp);
  if (!stamp_ok) return NextResponse.json({ detail: "스탬프 혜택이 등록되지 않았습니다. 스탬프는 필수입니다.", step: 3 }, { status: 409 });

  let kakao_id: string | null = null;
  try { const j = decodeJwt<{ kakao_id?: number | string }>(access); kakao_id = j.kakao_id != null ? String(j.kakao_id) : null; } catch { /* 무시 */ }
  const { ip, ua } = clientMeta(req);
  const at = new Date().toISOString();
  const starts_on = startsOnAfter(todaySeoul());
  const billing_period = starts_on.slice(0, 7);
  const paid = p.plan !== "FREE";
  const rec: ConsentRecord = {
    kind: revision ? "revise" : "complete", short_id: shortId(p), rid: p.rid, lid: p.lid, name: p.name, campus: p.campus, plan: p.plan, fee: p.fee,
    terms_version: TERMS_VERSION, terms_hash: termsHash(), checks: {}, signature: (b.signature ?? "").trim(),
    owner_name: (b.owner_name ?? "").trim(), biz_no: (b.biz_no ?? "").replace(/\D/g, ""), phone: (b.phone ?? "").replace(/\D/g, ""),
    phone_verified: false, email: (b.email ?? "").trim(), kakao_id, ip, ua, at, stamp_ok, kit_address, starts_on,
  };
  const copies = await persistRecord(rec, { ownerToken: access });
  if (!anyCopy(copies)) return NextResponse.json({ detail: "완료 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", errors: copies.errors }, { status: 503 });

  // 3) 후보 단계 → 계약 완료 (최선 노력)
  let stage_ok = false;
  if (p.lid && API()) {
    stage_ok = await fetch(`${API()}/api/astro/leads/${encodeURIComponent(p.lid)}/`, {
      method: "PATCH", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "계약 완료" }), cache: "no-store",
    }).then((r) => r.ok).catch(() => false);
  }

  /**
   * 4) 매장 운영 값(계약 시작일·청구 시작 월)을 개시일에 맞춘다 — **최선 노력**.
   *
   * 개시일은 이제 온보딩이 정한다(다음 달 1일). 그런데 그 값을 손으로 다시 옮겨 적게 두면
   * 반드시 어긋난다 — 0921 에 실제로 어긋나 있었다(개시일 10월인데 청구 시작 월 2026-09).
   *
   * 다만 백엔드 `astro/*` 는 전부 `_is_admin` 으로 막혀 있어 **점주 토큰으로는 403 이다**
   * (wouldulike_backend astro/views.py). 그래서 실패해도 완료를 막지 않고, 대신 슬랙에
   * "손으로 넣어 주세요 · 2026-10" 이라고 값을 그대로 적어 둔다. 사람이 계산할 일은 없게 한다.
   * 재민이 이 경로를 열어 주면 코드를 고치지 않아도 그날부터 자동으로 들어간다.
   */
  let ops_ok = false;
  if (API() && !revision) {
    ops_ok = await fetch(`${API()}/api/astro/stores/${p.rid}/`, {
      method: "PATCH", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      // 0923 재민이 연 범위: owner_name · biz_no · contract_started_on · billing_start_period 넷.
      // **비어 있는 칸만** 채워진다(astro/views.py `_owner_store_ops_patch`) — 담당자가 적어 둔 값은 안 건드린다.
      // 그 밖의 칸(연락처·이메일·월 이용료·홍보물 수령)은 여전히 관리자만이라 reconcile 이 맡는다.
      body: JSON.stringify({
        owner_name: (b.owner_name ?? "").trim(), biz_no: (b.biz_no ?? "").replace(/\D/g, ""),
        contract_started_on: starts_on, ...(paid ? { billing_start_period: billing_period } : {}),
      }),
      cache: "no-store",
    }).then(async (r) => {
      if (!r.ok) return false;
      // 무엇이 채워졌는지 응답이 알려 준다. skipped 는 이미 값이 있어 건너뛴 것이라 실패가 아니다.
      const j = (await r.json().catch(() => ({}))) as { changed?: string[] };
      return Array.isArray(j.changed);
    }).catch(() => false);
  }

  // 승인 대기 중인 한정 쿠폰이 있는가 — 슬랙에 한 줄 띄워 잊히지 않게 한다
  const special_pending = await fetch(`${API()}/api/dashboard/restaurant-benefits/?restaurant_id=${p.rid}&kind=SPECIAL`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as { active?: boolean }[]) : []))
    .then((l) => Array.isArray(l) && l.some((x) => x.active === false)).catch(() => false);

  const feeTxt = p.fee ? ` ${p.fee.toLocaleString()}원` : "";
  const copyTxt = [copies.activity && "활동기록", copies.sheet && "시트", copies.drive_json && "드라이브"].filter(Boolean).join("·") || "없음";
  await notifyOnboard(
    (revision
      ? `:pencil2: *${p.name}* 온보딩 내용 수정 — ${PLAN_LABEL[p.plan]}${feeTxt} · ${p.campus}\n`
      : `:white_check_mark: *${p.name}* 온보딩 완료 — 계약 ${p.name} ${PLAN_LABEL[p.plan]}${feeTxt} · ${p.campus}\n`) +
    (revision ? "" : `• 개시일 ${kdate(starts_on)}${paid ? ` · 청구 시작 월 ${billing_period}` : " · 무료 플랜(청구 없음)"}\n`) +
    (ops_ok || revision ? "" : `• :warning: 매장 운영 값이 자동 반영되지 않았습니다 — 파트너 매장 ${p.rid} 상세에서 *계약 시작일 ${starts_on}*${paid ? ` · *청구 시작 월 ${billing_period}*` : ""} 를 넣어 주세요\n`) +
    `• 스탬프 등록 ✓ · 웰컴 키트 발송 대기 (${kit_address})\n` +
    // 한정 쿠폰은 학생회 채널로 나가는 캠페인 자리라 사장님이 적었다고 그대로 편성되지 않는다.
    // 비활성으로 들어가 있으니, 승인해야 앱에 나간다 (0923 결정).
    (special_pending ? `• :lock: *승인 대기* — 한정 쿠폰이 있습니다. 파트너 계약 탭에서 내용을 보고 승인해 주세요\n` : "") +
    `• 기록 사본: ${copyTxt}${copies.errors.length ? ` · 실패: ${copies.errors.join(", ")}` : ""}` +
    (p.lid ? `\n• 후보 단계: ${stage_ok ? "계약 완료로 옮김" : "옮기지 못함 — 세틀라이트에서 수동 변경 필요"}` : "") +
    // 계약서 사본 발송은 **사람이 한다**(자동 발송 없음 — 0922 결정). 완료 화면이 사장님께
    // "담당자가 보내드립니다"라고 약속하므로, 여기서 할 일과 보낼 링크를 같이 준다.
    // 링크가 없으면 왜 없는지 적는다 — 조용히 빠지면 아무도 안 보낸다.
    (revision ? "" :
      `\n• :envelope: *보낼 것* — 계약서 사본을 ${b.email ? `${(b.email ?? "").trim()} 와 ` : ""}카톡으로 보내 주세요` +
      // 사본은 **동의 단계**에서 드라이브에 올라간다 — 완료 단계의 copies 에는 없다.
      // 그때 돌려준 링크를 화면이 들고 있다가 여기로 넘겨 준다.
      (b.contract_url ? `\n   ${b.contract_url}` : `\n   :warning: 사본 링크를 못 받았습니다 — 드라이브에서 "온보딩_${p.rid}_" 로 찾아 주세요`)) +
    `\n• #${shortId(p)}`
  );

  /**
   * 완료 표식 — 스탬프 규칙 `config_json.onboarded_at`.
   * 기기가 바뀌어도 "이미 마친 매장"을 알아보려면 어딘가 남아야 하는데, 점주가 쓸 수 있는
   * 백엔드 자리가 여기뿐이다(astro 는 403, 시트는 페이지 로딩에 쓰기엔 너무 느리다).
   * config_json 은 통째로 교체되므로 **읽어서 합친다** — thresholds 를 날리면 손님 적립이 멈춘다.
   */
  if (API()) {
    await fetch(`${API()}/api/dashboard/stamp-rule/?restaurant_id=${p.rid}`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        const rule = (j.rule ?? j.stamp_rule ?? j) as { rule_type?: string; config_json?: Record<string, unknown>; active?: boolean };
        const cfg = { ...(rule.config_json ?? {}), onboarded_at: at };
        await fetch(`${API()}/api/dashboard/stamp-rule/?restaurant_id=${p.rid}`, {
          method: "PATCH", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({ rule_type: rule.rule_type ?? "THRESHOLD", config_json: cfg, active: rule.active !== false }),
          cache: "no-store",
        });
      }).catch(() => null);
  }

  const secure = process.env.NODE_ENV === "production";
  jar.set(`ob_done_${p.rid}`, stepStamp(p.n, "done"), { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ ok: true, at, starts_on, copies, stage_ok, ops_ok, guide_url: process.env.ONBOARD_GUIDE_URL ?? null });
}

/**
 * 백엔드 `StampRule` — `{ rule_type: "THRESHOLD"|"VISIT", config_json: { thresholds?: [{stamps, coupon_type_code}], cycle_target? }, active }`
 * (owner/restaurant/page.tsx 의 타입과 같다). 응답이 `{rule}` 로 감싸질 수도 있어 둘 다 본다.
 * 활성이고, 보상이 걸린 스탬프 개수가 하나라도 있어야 "규칙이 있다".
 */
function hasStampRule(d: Record<string, unknown> | null): boolean {
  if (!d) return false;
  const rule = (d.rule ?? d.stamp_rule ?? d) as { active?: boolean; rule_type?: string; config_json?: { thresholds?: { stamps?: number }[]; cycle_target?: number } };
  if (rule.active === false) return false;
  const cfg = rule.config_json ?? {};
  if (Array.isArray(cfg.thresholds) && cfg.thresholds.some((t) => Number(t?.stamps) > 0)) return true;
  return rule.rule_type === "VISIT" && Number(cfg.cycle_target) > 0;
}
