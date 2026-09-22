import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import { phoneMatches, shortId, stepStamp, verifyOnboardToken } from "@/lib/onboard/token";
import { CHECKS, TERMS_VERSION, contractHtml, startsOnAfter, termsHash, todaySeoul } from "@/lib/onboard/contract";
import { anyCopy, clientMeta, persistRecord, type ConsentRecord } from "@/lib/onboard/records";

/**
 * [2] 계약 — 동의를 기록한다. 이게 이 온보딩의 법적 핵심이다.
 *
 * 받는 것: 개별 체크 5개(각각 체크한 시각), 서명(성명), 당사자 값(대표자·사업자번호·연락처·이메일).
 * 남기는 것: 약관 버전·해시 · 체크별 시각 · IP · UA · 카카오ID · 서명 → 백엔드 활동기록 + 시트 + 드라이브(JSON + 계약서 사본 HTML).
 * 하나도 못 남기면 실패로 돌려준다. "기록 없는 동의"를 성공이라고 말하지 않는다.
 * 성공하면 `ob_consent_{rid}` 쿠키(서명된 스탬프)를 심어 [6]완료가 이 단계를 거쳤는지 서버가 확인한다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ detail: `링크가 유효하지 않습니다 (${v.reason}).` }, { status: 400 });
  const p = v.payload;

  const jar = await cookies();
  const access = jar.get("access_token")?.value;
  if (!access) return NextResponse.json({ detail: "로그인이 필요합니다." }, { status: 401 });
  let kakao_id: string | null = null;
  try { const j = decodeJwt<{ kakao_id?: number | string }>(access); kakao_id = j.kakao_id != null ? String(j.kakao_id) : null; } catch { /* 무시 */ }

  const b = (await req.json().catch(() => ({}))) as {
    checks?: Record<string, string>; signature?: string; owner_name?: string; biz_no?: string; phone?: string; phone_verified?: boolean; email?: string; terms_hash?: string;
  };

  // 개별 체크 전부 있어야 한다 — 약관규제법 설명의무의 증거가 이 다섯 줄이다.
  const missing = CHECKS.filter((c) => !b.checks?.[c.id]).map((c) => c.id);
  if (missing.length) return NextResponse.json({ detail: "중요 내용 확인 항목을 모두 체크해 주세요.", missing }, { status: 400 });
  const signature = (b.signature ?? "").trim();
  if (signature.length < 2) return NextResponse.json({ detail: "서명란에 성함을 입력해 주세요." }, { status: 400 });
  const owner_name = (b.owner_name ?? "").trim(), biz_no = (b.biz_no ?? "").replace(/\D/g, ""), phone = (b.phone ?? "").replace(/\D/g, ""), email = (b.email ?? "").trim();
  if (!owner_name) return NextResponse.json({ detail: "대표자 성함이 필요합니다." }, { status: 400 });
  if (!/^\d{10}$/.test(biz_no)) return NextResponse.json({ detail: "사업자등록번호 10자리를 확인해 주세요." }, { status: 400 });
  if (!/^01\d{8,9}$/.test(phone)) return NextResponse.json({ detail: "휴대폰 번호를 확인해 주세요." }, { status: 400 });
  // [0]을 건너뛴 세션이 있을 수 있어 여기서도 본다 (lib/onboard/token.ts phoneMatches)
  if (!phoneMatches(p, phone)) return NextResponse.json({ detail: "미팅 때 알려주신 번호와 다릅니다. 담당자에게 말씀해 주세요.", phone_mismatch: true, step: 0 }, { status: 409 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ detail: "이메일 형식을 확인해 주세요." }, { status: 400 });

  // 화면이 본 약관과 서버가 아는 약관이 같은지 — 배포 사이에 문구가 바뀌면 여기서 걸린다.
  const hash = termsHash();
  if (b.terms_hash && b.terms_hash !== hash) return NextResponse.json({ detail: "약관이 갱신되었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.", reload: true }, { status: 409 });

  const { ip, ua } = clientMeta(req);
  const at = new Date().toISOString();
  // 개시일은 동의한 날이 아니라 **다음 달 1일**이다 (lib/onboard/contract.ts 머리말 — 청구 주기를 매장마다 갈라놓지 않으려는 것).
  // 여기서 확정되어 사본과 기록에 그대로 박힌다.
  const starts_on = startsOnAfter(todaySeoul());
  const rec: ConsentRecord = {
    kind: "consent", short_id: shortId(p), rid: p.rid, lid: p.lid, name: p.name, campus: p.campus, plan: p.plan, fee: p.fee,
    terms_version: TERMS_VERSION, terms_hash: hash, checks: b.checks!, signature, owner_name, biz_no, phone, starts_on,
    phone_verified: Boolean(b.phone_verified) && Boolean(process.env.ONBOARD_SMS_PROVIDER), email, kakao_id, ip, ua, at,
  };
  const html = contractHtml({ name: p.name, campus: p.campus, plan: p.plan, fee: p.fee, owner_name, biz_no: fmtBiz(biz_no), phone: fmtPhone(phone), email, starts_on, signed_at: at.replace("T", " ").slice(0, 19) + " (UTC)", signature }, rec.checks);

  const copies = await persistRecord(rec, { ownerToken: access, contractHtml: html });
  if (!anyCopy(copies)) {
    return NextResponse.json({ detail: "동의 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요. (기록 없이 계약을 진행하지 않습니다)", errors: copies.errors }, { status: 503 });
  }

  const secure = process.env.NODE_ENV === "production";
  jar.set(`ob_consent_${p.rid}`, stepStamp(p.n, "consent"), { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 14 });
  // 완료 단계에서 다시 쓰려고 당사자 값을 서명된 쿠키 없이 짧게 들고 간다 — 민감값(사업자번호 전체·이메일)은 서버가 다시 받는다.
  return NextResponse.json({ ok: true, at, starts_on, copies: { ...copies, errors: copies.errors }, contract_url: copies.drive_contract });
}

const fmtBiz = (d: string) => `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
const fmtPhone = (d: string) => d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
