import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { TEMPLATES, configStatus, normalizePhone, sendAlimtalk, type TemplateKey } from "@/lib/alimtalk";

/**
 * 알림톡 한 건 보내기 (민열님 0923).
 *
 * 키는 **서버에만** 있다(`SOLAPI_*`). `NEXT_PUBLIC_` 으로 두면 브라우저 번들에 박혀 누구나 꺼내 쓴다.
 * 화면은 여기로 "무엇을 · 누구에게 · 어떤 값으로" 만 보낸다.
 *
 * `GET` 은 **설정이 됐는지만** 알려 준다 — 값은 절대 돌려주지 않는다.
 * 아직 안 된 상태에서도 화면이 정확히 "무엇이 비었는지" 말할 수 있어야 한다.
 */

/** 변수 이름은 템플릿에 등록된 `#{…}` 과 **글자까지 같아야** 한다 (알림톡_템플릿_초안.md). */
const VARS: Record<TemplateKey, readonly string[]> = {
  onboard_link: ["#{매장명}", "#{플랜}", "#{이용료}", "#{시작월}", "#{담당자}", "#{담당자연락처}", "#{토큰}"],
  verify_code: ["#{인증번호}"],
  contract_copy: ["#{매장명}", "#{시작월}", "#{종료월}", "#{플랜}", "#{이용료}", "#{담당자}", "#{담당자연락처}", "#{토큰}"],
};

function isTemplate(v: unknown): v is TemplateKey {
  return typeof v === "string" && v in TEMPLATES;
}

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const t = req.nextUrl.searchParams.get("template");
  return NextResponse.json(configStatus(isTemplate(t) ? t : undefined));
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const body = (await req.json().catch(() => ({}))) as {
    template?: string; to?: string; variables?: Record<string, string>; fallback_text?: string;
  };
  if (!isTemplate(body.template)) {
    return NextResponse.json({ detail: `template 은 ${Object.keys(TEMPLATES).join(" · ")} 중 하나입니다.` }, { status: 400 });
  }
  if (!normalizePhone(body.to ?? "")) {
    return NextResponse.json({ detail: "받는 번호가 없거나 휴대폰 번호 형식이 아닙니다." }, { status: 400 });
  }

  // 빠진 변수는 **보내기 전에** 잡는다. 솔라피까지 가서 거절당하면 왜 실패했는지 화면에 안 남는다.
  const given = body.variables ?? {};
  const missing = VARS[body.template].filter((k) => !(given[k] ?? "").toString().trim());
  if (missing.length) {
    return NextResponse.json({ detail: `채우지 못한 값이 있습니다: ${missing.join(" · ")}` }, { status: 400 });
  }

  const r = await sendAlimtalk({
    template: body.template,
    to: body.to!,
    variables: given,
    fallbackText: body.fallback_text,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
