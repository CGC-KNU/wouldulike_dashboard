/**
 * 점주에게 보내는 **문자 문안**. 입금·미팅 팔로업이 목적이다 (민열님 0911).
 *
 * 규칙 — 리포트와 같다. 지어낸 숫자·약속을 넣지 않는다.
 *  · 금액·월·날짜는 **넘겨받은 값만** 쓴다. 없으면 그 문장을 뺀다.
 *  · 사업자번호는 넣지 않는다. **입금 계좌는 계약 완료 안내에만** 넣는다 — 팀이 실제로 그렇게 보내고(0914 민열님),
 *    값은 코드가 아니라 발행 주체 설정(IssuerSettings)에서 온다. 넣을 값이 없으면 그 줄이 빠진다.
 *  · 보장·단정("반드시" "매출이 늘어납니다")은 쓰지 않는다.
 *  · 문안은 초안이다. 사람이 고쳐서 보낸다.
 */

export type MsgKind =
  | "payment_notice" | "payment_due" | "payment_overdue" | "payment_thanks"
  | "meeting_confirm" | "meeting_remind" | "meeting_after"
  | "contract_start" | "onboarding" | "blank";

export interface MsgContext {
  /** 매장/후보 이름 */
  name: string;
  targetType: "store" | "lead";
  targetId: string;
  owner?: string | null;      // 대표자
  phone?: string | null;      // 받는 번호
  fee?: number | null;        // 월 이용료(VAT 포함)
  period?: string | null;     // "2026-09"
  dateLabel?: string | null;  // "9/1"
  meetingAt?: string | null;  // "9/15(월) 14시"
  nextAction?: string | null;
  sender?: string;            // 보내는 사람 이름
  /* ── 계약 완료 안내에만 쓰는 값들 (없으면 그 줄이 빠진다) ── */
  plan?: string | null;         // BOOST · CONTENT
  couponBasic?: string | null;  // 기본 쿠폰
  couponLimited?: string | null;// 한정 쿠폰
  stampCount?: string | null;   // "3 / 5 / 7 / 10"
  stampReward?: string | null;  // 단계별 혜택
  bank?: string | null;         // "토스뱅크 1002-…" — 발행 주체 설정 값
  bankHolder?: string | null;   // 예금주
  semester?: string | null;     // "26-2학기"
}

export interface MsgTemplate { kind: MsgKind; label: string; group: "입금" | "미팅" | "계약" | "기타"; text: string }


/** 조사 고르기 — "33,000원이" / "이용료가". 문자에 어색한 "원가"가 나가지 않게. */
export function josa(word: string, pair: "이/가" | "을/를" | "은/는" | "와/과"): string {
  const ch = (word ?? "").trim().slice(-1);
  const [withFinal, without] = pair.split("/");
  if (!ch) return without;
  const code = ch.charCodeAt(0);
  let hasFinal: boolean;
  if (code >= 0xac00 && code <= 0xd7a3) hasFinal = (code - 0xac00) % 28 !== 0;   // 한글
  else if (/[0-9]/.test(ch)) hasFinal = "1368097".includes(ch) && !"27459".includes(ch); // 일·삼·육·팔·영
  else hasFinal = false;                                                         // 영문·기호는 없는 쪽으로
  return hasFinal ? withFinal : without;
}

const won = (n: number) => `${n.toLocaleString()}원`;
/** 시트에는 '없음'을 x·-·없 으로도 적는다. 그대로 내보내면 "스탬프: x" 가 점주에게 간다. */
const real = (v?: string | null): string | null => {
  const t = (v ?? "").trim();
  if (!t || /^(x|X|×|-|없|없음|n\/a|na)$/i.test(t)) return null;
  return t;
};
const monthOf = (p?: string | null) => (p ? `${Number(p.slice(5))}월` : null);

/** 상황별 문안. 값이 없는 문장은 통째로 빠진다. */
export function templates(c: MsgContext): MsgTemplate[] {
  const hi = `${c.owner ? `${c.owner} 사장님` : "사장님"}, 안녕하세요. 우주라이크입니다.`;
  const sign = c.sender ? `\n\n우주라이크 ${c.sender} 드림` : "";
  const m = monthOf(c.period);
  const amount = c.fee ? ` ${won(c.fee)}` : "";
  const monthFee = m ? `${m}분 파트너 이용료${amount}` : `파트너 이용료${amount}`;
  const line = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(" ");

  return [
    {
      kind: "payment_notice", label: "이용료 안내", group: "입금",
      text: `${hi}\n\n${line(`${monthFee} 안내드립니다.`, c.dateLabel && `납부일은 ${c.dateLabel}입니다.`)}\n세금계산서는 등록해 주신 이메일로 발행해 드립니다. 확인 부탁드립니다.${sign}`,
    },
    {
      kind: "payment_due", label: "납부일 하루 전", group: "입금",
      text: `${hi}\n\n${line(`내일이 ${monthFee} 납부일입니다.`, "기존에 안내드린 계좌로 부탁드립니다.")}\n이미 보내셨다면 이 문자는 넘겨 주세요.${sign}`,
    },
    {
      kind: "payment_overdue", label: "입금 확인 안 됨 (재안내)", group: "입금",
      text: `${hi}\n\n${monthFee}${josa(monthFee, "이/가")} 아직 입금 확인이 안 되어 한 번 더 안내드립니다.\n이미 보내셨는데 확인이 늦어진 것일 수 있으니, 보내셨다면 말씀 주시면 저희가 다시 확인하겠습니다.${sign}`,
    },
    {
      kind: "payment_thanks", label: "입금 확인 · 감사", group: "입금",
      text: `${hi}\n\n${line(`${m ? `${m}분 ` : ""}이용료 입금 확인했습니다. 감사합니다.`)}\n이번 달도 앱에서 잘 보이도록 챙기겠습니다.${sign}`,
    },
    {
      kind: "meeting_confirm", label: "미팅 확정", group: "미팅",
      text: `${hi}\n\n${line(c.meetingAt ? `${c.meetingAt}에 방문드리기로 했습니다.` : "방문 일정 확정되어 안내드립니다.")}\n바쁘신 시간 피해서 짧게 말씀드리겠습니다. 일정 조정이 필요하시면 편하게 말씀해 주세요.${sign}`,
    },
    {
      kind: "meeting_remind", label: "미팅 하루 전", group: "미팅",
      text: `${hi}\n\n${line(c.meetingAt ? `내일 ${c.meetingAt} 방문드립니다.` : "내일 방문드립니다.")} 5~10분이면 충분합니다.\n혹시 매장이 바쁘신 시간이면 말씀 주세요. 시간 옮기겠습니다.${sign}`,
    },
    {
      kind: "meeting_after", label: "미팅 후 감사", group: "미팅",
      text: `${hi}\n\n오늘 시간 내주셔서 감사합니다.${c.nextAction ? `\n말씀 주신 대로 ${c.nextAction} 준비해서 다시 연락드리겠습니다.` : "\n말씀 주신 내용 정리해서 다시 연락드리겠습니다."}${sign}`,
    },
    {
      kind: "contract_start", label: "파트너 시작 안내", group: "계약",
      text: `${hi}\n\n오늘부터 ${c.name}${josa(c.name, "이/가")} 우주라이크 앱에 파트너 매장으로 올라갑니다.\n포스터와 QR 스티커는 계산대처럼 학생들 눈에 띄는 자리에 두시면 좋습니다. 혜택이나 메뉴가 바뀌면 언제든 말씀해 주세요.${sign}`,
    },
    {
      kind: "onboarding", label: "계약 완료 · 운영 시작 전 안내", group: "계약",
      text: [
        `${hi}`,
        "",
        line(`${c.semester ?? "이번 학기"} 제휴 운영 시작 전`, "최종 혜택 내용 확인과 이용료 안내드립니다."),
        "",
        "현재 등록 예정인 혜택은 아래와 같습니다.",
        real(c.couponBasic) ? `· 기본 쿠폰: ${real(c.couponBasic)}` : null,
        `· 한정 쿠폰: ${real(c.couponLimited) ?? "없음"}`,
        real(c.stampCount) ? `· 스탬프: ${real(c.stampCount)}` : null,
        real(c.stampReward) ? `· 스탬프 혜택: ${real(c.stampReward)}` : null,
        "",
        "위 내용으로 최종 등록해도 괜찮은지 확인 부탁드립니다.",
        "",
        c.plan || c.fee ? line("이번 학기에는", c.plan ? `${c.plan} 플랜` : null, c.fee ? `/ 월 ${won(c.fee)}(VAT 포함)` : null, "으로 운영됩니다.") : null,
        c.bank ? "" : null,
        c.bank ? `입금 계좌\n${c.bank}${c.bankHolder ? `\n예금주: ${c.bankHolder}` : ""}` : null,
        "",
        m && c.fee ? `${m} 이용료 ${won(c.fee)} 입금 부탁드립니다.` : null,
        "안내문·견적서·세금계산서도 같이 보내드립니다.",
        "",
        "감사합니다!",
      ].filter((l) => l !== null && l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n") + sign,
    },
    { kind: "blank", label: "직접 쓰기", group: "기타", text: `${hi}\n\n${sign}` },
  ];
}

/** 상황에 맞는 기본 문안 — 캘린더에서 무엇을 눌렀는지에 따라. */
export function defaultKind(ev: "payment" | "meeting" | "contract" | "due", opts?: { overdue?: boolean; tomorrow?: boolean; past?: boolean }): MsgKind {
  if (ev === "payment") return opts?.overdue ? "payment_overdue" : opts?.tomorrow ? "payment_due" : "payment_notice";
  if (ev === "meeting") return opts?.past ? "meeting_after" : opts?.tomorrow ? "meeting_remind" : "meeting_confirm";
  if (ev === "contract") return "contract_start";
  return "blank";
}

/** 한글은 2바이트. 90바이트까지 SMS, 넘으면 LMS. */
export function byteLen(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) < 128 ? 1 : 2;
  return n;
}

export function smsHref(phone: string, body: string): string {
  const num = phone.replace(/[^\d+]/g, "");
  // iOS·macOS 는 `&body=`, 안드로이드는 `?body=`
  const sep = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "?" : "&";
  return `sms:${num}${sep}body=${encodeURIComponent(body)}`;
}
