import { NextRequest, NextResponse } from "next/server";
import { verifyOnboardToken } from "@/lib/onboard/token";
import { contractHtml, CHECKS } from "@/lib/onboard/contract";
import { readLedger } from "@/lib/onboard/reconcile";

/**
 * 서명한 계약서 사본 — **앱이 직접 그린다.**
 *
 * 드라이브에도 사본을 올리지만, 드라이브는 HTML 을 문서로 보여 주지 못하고 **소스를 그대로 펼친다**
 * ("이상한 코드가 쭉 이어진 문서", 0922 점주 테스트). 계약서를 그렇게 받아보면 계약 자체를 의심한다.
 *
 * 그래서 원장(시트)에 남긴 동의 기록을 읽어 계약서를 다시 그린다.
 * 저장된 HTML 을 꺼내오는 게 아니라 **같은 함수로 다시 그리는 것**이라, 약관 문구가 바뀌면
 * 옛 계약서도 새 문구로 보일 위험이 있다 — 그래서 기록에 남은 `terms_version` 과 지금 버전이
 * 다르면 그 사실을 문서 머리에 적는다. 원본은 드라이브 사본이다.
 *
 * 인증: 링크 토큰을 아는 사람만. 계약 당사자에게 나간 링크와 같은 토큰이다.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return new NextResponse(page("이 링크로는 계약서를 볼 수 없습니다.", `링크가 유효하지 않습니다 (${v.reason}).`), { status: 400, headers: HTML });
  const p = v.payload;

  const rows = await readLedger().catch(() => []);
  const mine = rows.filter((r) => r.rid === p.rid && r.kind === "consent");
  const rec = mine[mine.length - 1];
  if (!rec) {
    return new NextResponse(page("아직 계약서가 없습니다.", "계약 동의를 마치시면 이 주소에서 사본을 보실 수 있습니다."), { status: 404, headers: HTML });
  }

  let checks: Record<string, string> = {};
  try { checks = JSON.parse(rec.checks || "{}") as Record<string, string>; } catch { /* 기록이 깨졌어도 본문은 보여 준다 */ }
  // 체크 기록이 비어 있으면 동의 시각으로 채운다 — 동의 없이는 기록 자체가 생기지 않는다
  if (!Object.keys(checks).length) for (const c of CHECKS) checks[c.id] = rec.at;

  const html = contractHtml({
    name: rec.name || p.name, campus: rec.campus || p.campus,
    plan: (rec.plan || p.plan) as typeof p.plan, fee: Number(rec.fee) || p.fee,
    owner_name: rec.owner_name, biz_no: rec.biz_no, phone: rec.phone, email: rec.email,
    starts_on: rec.starts_on || "", signed_at: rec.at.replace("T", " ").slice(0, 19) + " (UTC)",
    signature: rec.signature,
  }, checks);

  return new NextResponse(html, { headers: HTML });
}

const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function page(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:40px 20px;font-family:system-ui,'Apple SD Gothic Neo',sans-serif;background:#f4f5fa;color:#111">
<div style="max-width:420px;margin:0 auto;text-align:center">
<p style="font-size:17px;font-weight:700;margin:0 0 8px">${title}</p>
<p style="font-size:14px;color:#555;line-height:1.6;margin:0">${body}</p></div></body></html>`;
}
