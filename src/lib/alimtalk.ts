import crypto from "node:crypto";

/**
 * 알림톡 발송 — 솔라피(solapi.com) 배관 (민열님 0923).
 *
 * ## 왜 알림톡인가
 * 카카오톡 채널은 **먼저 말을 건 사람에게만** 답할 수 있다. 사장님이 우리 채널에 말을 건 적이
 * 없으면 챗봇은 아무것도 못 보낸다. 번호만 알고 먼저 보내는 길은 알림톡뿐이다(친구톡은
 * 채널 친구에게만 가고 광고성이다). 그래서 "봇으로 바로 보내기" = 알림톡이다.
 *
 * ## 지금 상태 — **키가 없으면 아무것도 안 한다**
 * 솔라피 가입·발신프로필 연동·템플릿 심사는 사람이 해야 한다(인계 문서 0923 §3).
 * 그게 끝나기 전에도 화면이 돌아가야 하므로, 설정이 비면 `configured: false` 와
 * **무엇이 비었는지**를 돌려준다. 절대 보낸 척하지 않는다.
 *
 * ## 안 지키면 반려되는 것
 * - **정보성만.** 광고 문구를 변수로 밀어 넣지 말 것 — 템플릿 내용과 다르면 발송이 막힌다.
 * - 변수는 템플릿에 등록된 `#{이름}` 과 **글자까지 같아야** 한다.
 * - 대체발송(SMS)은 알림톡이 실패했을 때만. 내용이 다르면 그것도 위반이다.
 */

const API = "https://api.solapi.com/messages/v4/send-many/detail";

/** 화면이 고르는 이름 → 환경변수에 든 템플릿 코드. 코드는 심사 승인 뒤에 나온다. */
export const TEMPLATES = {
  onboard_link: "ALIMTALK_TPL_ONBOARD",     // ① 파트너 등록 링크
  verify_code: "ALIMTALK_TPL_VERIFY",       // ② 본인 확인 인증번호
  contract_copy: "ALIMTALK_TPL_CONTRACT",   // ③ 계약서 사본 전달
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

const BASE_KEYS = ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_PFID", "SOLAPI_SENDER"] as const;

/** 무엇이 비었는지. **값은 돌려주지 않는다** — 화면에도 로그에도 키가 찍히면 안 된다. */
export function configStatus(template?: TemplateKey): { configured: boolean; missing: string[] } {
  const need: string[] = [...BASE_KEYS];
  if (template) need.push(TEMPLATES[template]);
  const missing = need.filter((k) => !(process.env[k] || "").trim());
  return { configured: missing.length === 0, missing };
}

/** 010-1234-5678 · +82 10 … → 01012345678. 솔라피는 숫자만 받는다. */
export function normalizePhone(raw: string): string | null {
  const d = (raw || "").replace(/[^\d]/g, "").replace(/^82/, "0");
  return /^01\d{8,9}$/.test(d) ? d : null;
}

/**
 * 솔라피 인증 헤더. `HMAC-SHA256 apiKey=…, date=…, salt=…, signature=…`
 * 서명은 `date + salt` 를 시크릿으로 HMAC-SHA256 한 hex.
 */
function authHeader(key: string, secret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

export interface SendResult {
  ok: boolean;
  /** 사람이 읽을 한 줄. 실패 이유를 감추지 않는다. */
  detail: string;
  groupId?: string;
  failed?: number;
}

/**
 * 한 사람에게 한 건. 여러 건은 아직 안 만든다 — 지금 쓰는 자리가 "이 매장에 링크 보내기" 하나다.
 *
 * `fallbackText` 를 주면 알림톡 실패 시 SMS 로 대체발송한다. **템플릿과 같은 내용이어야 한다.**
 */
export async function sendAlimtalk(opts: {
  template: TemplateKey;
  to: string;
  variables: Record<string, string>;
  fallbackText?: string;
}): Promise<SendResult> {
  const st = configStatus(opts.template);
  if (!st.configured) {
    return { ok: false, detail: `알림톡이 아직 설정되지 않았습니다 — ${st.missing.join(", ")} 가 비어 있습니다.` };
  }
  const to = normalizePhone(opts.to);
  if (!to) return { ok: false, detail: "받는 번호가 휴대폰 번호 형식이 아닙니다." };

  const body = {
    messages: [{
      to,
      from: (process.env.SOLAPI_SENDER || "").replace(/[^\d]/g, ""),
      text: opts.fallbackText ?? undefined,
      type: opts.fallbackText ? undefined : "ATA",
      kakaoOptions: {
        pfId: process.env.SOLAPI_PFID,
        templateId: process.env[TEMPLATES[opts.template]],
        variables: opts.variables,
        // 대체발송은 문안을 같이 줬을 때만. 안 주면 알림톡이 실패해도 문자로 새지 않는다.
        disableSms: !opts.fallbackText,
      },
    }],
  };

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: authHeader(process.env.SOLAPI_API_KEY!, process.env.SOLAPI_API_SECRET!),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      groupId?: string; failedMessageList?: unknown[]; errorMessage?: string; message?: string;
    };
    if (!res.ok) {
      return { ok: false, detail: j.errorMessage || j.message || `솔라피가 ${res.status} 를 돌려줬습니다.` };
    }
    const failed = (j.failedMessageList ?? []).length;
    if (failed > 0) {
      return { ok: false, detail: "받는 쪽에서 거절됐습니다 — 번호·템플릿 코드·변수 이름을 확인해 주세요.", groupId: j.groupId, failed };
    }
    return { ok: true, detail: "보냈습니다.", groupId: j.groupId };
  } catch (e) {
    return { ok: false, detail: `솔라피에 닿지 못했습니다 (${(e as Error).message}).` };
  }
}
