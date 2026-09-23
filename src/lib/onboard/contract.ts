import { createHash } from "node:crypto";
import type { OnboardPlan } from "./token";

/**
 * 온보딩 화면에 올라가는 **이용약관**.
 *
 * ## 왜 학기 고정 날짜를 뺐나 (0921)
 * 종이 계약서는 학기 초에 몰아서 서명받았으니 "2026.9.1 ~ 2027.2.28 6개월"이 사실이었다.
 * 온보딩은 매장마다 **동의하는 날이 다르다.** 9월 21일에 동의한 매장에 "9월 1일부터"라고 적으면 거짓이고,
 * 종료일을 2월 28일로 못 박으면 늦게 들어온 매장은 이유 없이 짧은 계약을 하게 된다.
 * 그래서 구독 서비스의 표준 모양으로 바꿨다 — **기간의 정함은 없음, 해지할 때까지 월 단위로 계속.**
 *
 * ## 왜 개시일을 다음 달 1일로 했나 (0921)
 * 이용료 정산 단위가 1개월이다. 개시일이 동의한 날이면 매장마다 청구 주기가 제각각이 되고(9월 21일 개시 →
 * 21일마다 청구), 일할 계산·환급·세금계산서 발행일이 전부 매장별로 갈라진다. 사람이 손으로 관리하는 동안은
 * 그 복잡도가 그대로 사고가 된다. 그래서 **개시일은 동의한 달의 다음 달 1일**로 고정한다.
 * 동의일부터 개시일까지는 준비 기간이고 이용료를 받지 않는다 — 매장에도 손해가 없다.
 *
 * 그 결과 약관 본문에 매장별 값이 하나도 없다 → **해시가 모든 매장에서 같다.** 상권은 이제 가격만 결정한다.
 * 날짜·플랜·이용료는 전부 개별 약정(`PartyValues`)으로 내려가 계약서 사본에 박힌다.
 *
 * 문구를 한 글자라도 고치면 `TERMS_VERSION` 을 올려라. 지난 버전에 동의한 매장의 기록이 달라지면 안 된다.
 */

export const TERMS_VERSION = "wouldulike.partner.terms.v4";

/** 상권은 가격만 결정한다 (경북대 Boost 30,000 / 그 외 45,000 — 0919 확정). */
export function boostFee(campus: string): number {
  return campus === "경북대" ? 30000 : 45000;
}
export function defaultFee(plan: OnboardPlan, campus: string): number {
  if (plan === "FREE") return 0;
  if (plan === "PREMIUM") return 80000;
  return boostFee(campus);
}

export const PLAN_LABEL: Record<OnboardPlan, string> = { FREE: "무료", BOOST: "Boost", PREMIUM: "Premium" };

/* ── 날짜 ───────────────────────────────────────────────── */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** 개월 더하기 — 말일 보정(1/31 + 1개월 = 2/28). */
function addMonths(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const t = new Date(y, m - 1 + n, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return iso(t);
}
const addDays = (base: string, n: number) => { const [y, m, d] = base.split("-").map(Number); const t = new Date(y, m - 1, d + n); return iso(t); };
export const kdate = (s: string) => { const [y, m, d] = s.split("-"); return `${y}년 ${Number(m)}월 ${Number(d)}일`; };
const won = (n: number) => n.toLocaleString("ko-KR") + "원";

/** 개시일 하나로 이 계약의 날짜가 전부 결정된다. */
export interface Schedule {
  starts_on: string;      // 개시일 = 동의한 달의 다음 달 1일
  min_term_to: string;    // 최소 이용기간(1개월) 만료일
  campaign_due: string;   // 캠페인 편입 이행기한 = 개시일 + 60일
}
export function scheduleFrom(starts_on: string): Schedule {
  return { starts_on, min_term_to: addDays(addMonths(starts_on, 1), -1), campaign_due: addDays(starts_on, 60) };
}
export const todaySeoul = () => iso(new Date(Date.now() + 9 * 3600 * 1000));
/** 개시일 = 동의한 달의 **다음 달 1일**. 청구 주기를 매장마다 갈라놓지 않으려는 것 (머리말 참고). */
export function startsOnAfter(consent_date: string): string {
  const [y, m] = consent_date.split("-").map(Number);
  return iso(new Date(y, m, 1));
}

/* ── 약관 본문 (매장별 값 없음) ─────────────────────────── */
export interface Article { no: string; title: string; body: string[] }

export function articles(): Article[] {
  return [
    { no: "제1조", title: "목적", body: [
      "회사(상호 코끼리, 서비스명 우주라이크)는 자사 애플리케이션·웹사이트·인스타그램 및 제휴 채널을 통하여 파트너 매장을 홍보하고, 파트너 매장은 이용자에게 쿠폰·스탬프 혜택 및 마일리지 추첨의 당첨 상품을 제공하며, 회사가 그 당첨 상품의 대금을 정산함으로써 상호 이익을 도모한다.",
      "본 약관은 파트너 매장이 온보딩 화면에서 동의함으로써 체결되는 계약의 내용이 된다. 플랜·이용료·개시일 등 매장마다 다른 사항은 개별 약정란에 기재하며, 개별 약정이 본 약관과 다른 경우 개별 약정이 우선한다.",
    ]},
    { no: "제2조", title: "계약의 개시와 기간", body: [
      "본 계약은 파트너 매장이 본 약관에 동의한 날(이하 “동의일”)에 성립하며, **기간의 정함이 없다.** 어느 한쪽이 해지할 때까지 월 단위로 계속된다.",
      "용역의 **개시일은 동의일이 속한 달의 다음 달 1일**로 한다. 개시일은 개별 약정란에 기재한다.",
      "회사는 동의일부터 개시일까지 매장 정보·혜택의 등록과 홍보물 제작을 수행한다. 이 준비 기간에는 이용료를 청구하지 아니하며, 파트너 매장이 부담하는 것은 없다.",
      "회사의 용역 중 캠페인·배너 운영은 대학 학사일정의 영향을 받는다. 방학 기간에는 운영 빈도가 달라질 수 있으며, 회사는 그 내용을 미리 통지한다.",
    ]},
    { no: "제3조", title: "플랜 및 이용료", body: [
      "플랜과 월 이용료는 개별 약정란에 기재한 바에 따르며, 표시 금액은 부가가치세 별도이다. 무료 플랜의 경우 이용료가 없고, 이용료에 관한 조항은 유료 플랜에 한하여 적용한다.",
      "이용료의 정산 단위는 1개월로 하며, 개시일이 매월 1일이므로 일할 계산은 하지 아니한다. 파트너 매장은 매월 이용료를 해당 월의 전월 말일까지 회사가 통지한 계좌로 지급하며, 최초 이용료는 개시일부터 7일 이내에 지급한다.",
      "입금 계좌는 세금계산서에 기재하여 통지하며, 그 예금주는 회사(상호 코끼리) 또는 그 대표자 노재민의 명의로 한다. 회사는 세금계산서에 기재하지 아니한 계좌로 입금을 요구하지 아니한다.",
      "회사가 이용료를 변경하려면 적용일부터 30일 이전에 서면으로 통지한다. 통지를 받은 파트너 매장은 변경이 적용되기 전에 해지할 수 있으며, 이 경우 변경된 이용료는 적용되지 아니한다. 회사는 연체이자를 청구하지 아니한다.",
      "회사는 최초 이용료의 입금이 확인된 때부터 유료 플랜의 용역을 개시하며, 그 전의 기간에 대하여 파트너 매장이 부담하는 것은 없다.",
    ]},
    { no: "제4조", title: "회사의 제공 용역", body: [
      "회사는 계약이 존속하는 동안 앱에 매장 정보 및 혜택을 상시 게재하고, 기본 쿠폰과 스탬프·마일리지 적립 및 추첨을 운영하며, 당첨 식사권 대금을 매월 1회(다음 달 10일까지) 정산한다.",
      "회사는 포스터 1종과 QR 스티커 2매를 개시 후 1회 무상으로 제작·제공한다.",
      "유료 플랜에 대하여 회사는 캠페인(한정 쿠폰)에 **개시일부터 60일 이내 1회 이상** 편입하고, 캠페인 회차마다 앱 배너 노출과 푸시 알림을 발송하며, 캠페인 기간 외에도 월 1회 이상 앱 배너에 노출한다.",
      "제휴 채널(학생회·단과대)은 제3자가 자율적으로 운영하므로 회사는 게재를 강제할 수 없으며, 회사의 채무는 회차마다 배포를 요청하고 결과를 통지하는 것으로 이행한 것으로 본다. 회사는 대학의 명칭·엠블럼을 사용하지 아니한다.",
    ]},
    { no: "제5조", title: "파트너 매장의 협조", body: [
      "파트너 매장은 회사가 요청하는 매장 정보·메뉴·혜택 내용 및 사진을 제공하고, 앱에 등록된 혜택을 이용자에게 실제로 제공한다.",
      "파트너 매장은 제공한 사진·상호에 대한 이용 권한을 보유함을 보증하며, 회사는 이를 앱·웹사이트·인스타그램 및 제휴 채널의 홍보에 사용할 수 있다.",
      "휴업·폐업·업종·상호의 변경 및 초상권·개인정보에 관한 요청은 회사가 7일 이내에 처리한다.",
    ]},
    { no: "제6조", title: "마일리지 추첨 및 당첨 식사권의 정산", body: [
      "회사는 이용자의 스탬프·마일리지 적립을 바탕으로 추첨을 운영하며, 당첨 이용자는 파트너 매장에서 액면 1만원(부가세 포함)의 식사권을 사용할 수 있다.",
      "당첨 식사권의 대금은 회사가 부담하며, 파트너 매장에 매월 1회 다음 달 10일까지 정산한다. 이는 손해배상이 아니라 회사가 부담하는 대금 채무이므로 상한과 관계없이 전액 지급한다.",
    ]},
    { no: "제7조", title: "정보 보호", body: [
      "회사는 파트너 매장의 성과 데이터·매출 추정치·이용료 조건을 동일 상권의 동종 매장에 제공하거나 영업 자료로 사용하지 아니한다. 상권 통계를 산출하는 경우 매장을 식별할 수 없도록 집계한다.",
      "파트너 매장은 혜택 처리 과정에서 알게 된 이용자의 정보를 혜택 처리 외의 목적으로 이용하지 아니한다.",
    ]},
    { no: "제8조", title: "최소 이용기간 · 해지 및 환급", body: [
      "본 계약의 최소 이용기간은 **개시일부터 1개월**로 한다. 그 만료일은 개별 약정란에 기재한다.",
      "파트너 매장은 매월 말일까지 서면(문자·카카오톡·전자우편 포함)으로 통지함으로써 다음 달 1일자로 해지할 수 있다. 다만 해지의 효력은 최소 이용기간 만료일의 다음 날 이전에는 발생하지 아니한다. **위약금 및 해지 수수료는 없다.**",
      "최소 이용기간이 지난 뒤에도 본 계약은 해지 통지가 있을 때까지 월 단위로 계속되며, 계속을 이유로 회사가 이용료를 인상하거나 조건을 변경하지 아니한다.",
      "회사는 미경과 월분을 월 단위로 전액 환급한다. 환급은 계약 종료일부터 14일 이내에 이행하고 수정세금계산서를 발행한다. 위약금·해지 수수료 및 실비의 공제는 일체 없다.",
      "파트너 매장이 휴업 또는 폐업하는 경우 증빙의 제출로써 본 계약은 종료한다. 회사가 사업을 폐지하거나 용역을 제공할 수 없게 된 경우 회사는 미경과 월분을 전액 환급한다.",
    ]},
    { no: "제9조", title: "손해배상 및 불가항력", body: [
      "어느 한쪽이 본 계약을 위반하여 상대방에게 손해를 발생시킨 경우 그 손해를 배상한다. 한쪽이 상대방에게 배상하는 금액의 합계는 파트너 매장이 본 계약에 따라 실제로 지급한 최근 6개월분 이용료(부가가치세 포함)를 초과하지 아니하며, 간접손해·특별한 사정으로 인한 손해 및 상실이익은 배상하지 아니한다.",
      "천재지변, 감염병, 정부의 조치, 대학의 학사일정 변경, 외부 플랫폼의 정책·기능 변경, 통신 장애 등 회사가 통제할 수 없는 사정으로 용역을 제공하지 못한 경우 회사는 책임을 부담하지 아니하며, 파트너 매장과 협의하여 대체 방안 또는 기간의 조정을 정한다.",
    ]},
    { no: "제10조", title: "약관의 변경", body: [
      "회사가 본 약관을 변경하려면 적용일부터 30일 이전에 파트너 매장이 지정한 연락처로 통지한다. 통지를 받은 파트너 매장이 적용일 전에 해지하지 아니하면 변경에 동의한 것으로 본다.",
      "파트너 매장에게 불리한 변경의 경우 회사는 변경 내용과 사유를 함께 통지하며, 파트너 매장은 변경이 적용되기 전에 위약금 없이 해지할 수 있다.",
    ]},
    { no: "제11조", title: "계약의 성립 및 전자문서", body: [
      "본 계약은 파트너 매장이 이 화면에서 약관을 열람하고 중요 내용에 개별적으로 동의한 뒤 서명란에 성명을 기재함으로써 성립한다. 회사는 동의 시각·접속 정보·동의한 약관의 버전을 기록하고, 계약 내용을 파트너 매장이 지정한 전자우편 및 연락처로 교부한다.",
      "본 계약은 전자문서 및 전자거래 기본법에 따른 전자문서로서 효력을 가지며, 종이 문서로 작성한 것과 동일하게 취급한다.",
    ]},
    { no: "제12조", title: "개인정보의 수집·이용", body: [
      "회사는 본 계약의 체결·이행과 그 증거 보전을 위하여 다음의 정보를 수집·이용한다. **대표자 성명, 사업자등록번호, 휴대전화번호, 전자우편주소**(기재한 경우), **카카오 계정 식별자, 동의 시각, 접속 아이피 주소와 브라우저 정보, 서명란에 기재한 성명.** 접속 기록은 누가 언제 동의하였는지를 뒤에 확인하기 위한 것이며, 그 밖의 목적으로 이용하지 아니한다.",
      "이용 목적은 계약의 체결과 이행, 계약서 사본과 세금계산서의 교부, 요금의 청구와 정산, 계약에 관한 연락에 한한다. 광고성 정보의 전송에는 이용하지 아니하며, 이를 원하시는 경우 별도로 동의를 받는다.",
      "보유 기간은 **계약 종료일부터 5년**으로 한다. 계약과 대금에 관한 기록은 상법 제33조와 국세기본법이 정하는 기간 동안 보존할 의무가 있기 때문이다. 그 기간이 지나면 지체 없이 파기한다.",
      "위 정보는 계약의 체결과 이행에 필요한 것이므로 제공하지 아니하면 계약을 체결할 수 없다. 다만 전자우편주소는 선택이며, 적지 아니하여도 계약에는 영향이 없다(계약서 사본과 세금계산서를 다른 방법으로 받으시게 된다).",
      "회사는 수집한 정보를 제3자에게 제공하지 아니한다. 다만 세금계산서 발행과 대금 지급을 위하여 관련 사업자에게 필요한 범위에서 전달하는 경우는 그러하지 아니하며, 이 경우에도 목적에 필요한 최소한으로 한다.",
      "정보의 열람·정정·삭제와 처리정지는 언제든지 요청할 수 있고, 회사는 7일 이내에 처리한다. 요청은 계약에 기재된 연락처로 하면 된다.",
    ]},
  ];
}

/** 중요 내용 개별 체크 — 종이 계약서 6면 확인란을 옮긴 것. 전부 체크해야 서명할 수 있다. */
export interface Check { id: string; text: (s: Schedule) => string; article: string }
export const CHECKS: Check[] = [
  { id: "min_term", article: "제2조·제8조", text: (s) => `시작은 다음 달 1일(${kdate(s.starts_on)})입니다. 그때까지는 준비 기간이라 이용료가 없습니다. 최소 이용기간은 개시일부터 1개월(${kdate(s.min_term_to)}까지)이고, 그 뒤에는 매월 말일까지 말씀만 하시면 다음 달 1일자로 끝납니다. 위약금은 없습니다.` },
  { id: "auto_continue", article: "제2조·제8조", text: () => "이 계약은 종료일이 정해져 있지 않고, 해지하실 때까지 매월 자동으로 이어집니다. 계속한다는 이유로 이용료가 오르지 않습니다." },
  { id: "fee_refund", article: "제3조·제8조", text: () => "유료 플랜의 이용료는 부가세 별도이며, 해지하시면 아직 쓰지 않은 달의 이용료는 전액 돌려드립니다. 이용료를 바꾸려면 30일 전에 미리 알려드리고, 그 전에 해지하실 수 있습니다." },
  { id: "mileage", article: "제6조", text: () => "마일리지 추첨 당첨 식사권(액면 1만원)은 매장에서 손님께 제공하시고, 그 대금은 저희가 매월 10일까지 정산해 드립니다." },
  { id: "campaign", article: "제4조", text: (s) => `캠페인(한정 쿠폰) 편입은 개시일부터 60일 이내(${kdate(s.campaign_due)}까지)가 기한이며, 첫 달에는 이행되지 않을 수 있습니다.` },
  { id: "media", article: "제5조", text: () => "제공해 주신 매장 사진·상호를 앱·인스타그램·제휴 채널 홍보에 사용하는 데 동의합니다." },
];

/**
 * 약관 본문 해시 — 동의 기록에 남긴다.
 * 본문에 매장별 값이 없으므로 **모든 매장에서 같다**. 체크 문구의 날짜는 해시에서 뺀다(개시일마다 달라지므로).
 */
export function termsHash(): string {
  const text = [TERMS_VERSION, ...articles().flatMap((a) => [a.no, a.title, ...a.body]), ...CHECKS.map((c) => `${c.id}:${c.article}`)].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface PartyValues {
  name: string; campus: string; plan: OnboardPlan; fee: number;
  owner_name: string; biz_no: string; phone: string; email: string;
  starts_on: string; signed_at: string; signature: string;
}

/** 개별 약정 — 당사자 표 + 플랜 + 날짜. 이 값들이 그대로 사본에 박힌다. */
export function partyLines(v: PartyValues): { label: string; value: string }[] {
  const s = scheduleFrom(v.starts_on);
  const vat = Math.round(v.fee * 0.1);
  return [
    { label: "파트너 매장", value: v.name },
    { label: "대표자", value: v.owner_name },
    { label: "사업자등록번호", value: v.biz_no },
    { label: "연락처", value: v.phone },
    { label: "전자우편(계약서·세금계산서)", value: v.email || "—" },
    { label: "상권", value: v.campus },
    { label: "플랜", value: PLAN_LABEL[v.plan] },
    { label: "월 이용료", value: v.fee ? `${won(v.fee)} + 부가세 ${won(vat)} = ${won(v.fee + vat)}` : "0원 (무료 플랜)" },
    { label: "개시일", value: `${kdate(s.starts_on)} (동의일의 다음 달 1일 · 그때까지는 준비 기간으로 이용료 없음)` },
    { label: "계약기간", value: "기간의 정함 없음 — 해지 시까지 월 단위로 계속" },
    { label: "최소 이용기간", value: `${kdate(s.starts_on)} ~ ${kdate(s.min_term_to)} (1개월)` },
    { label: "캠페인 편입 기한", value: `${kdate(s.campaign_due)} (개시일부터 60일)` },
    { label: "회사", value: "코끼리 (서비스명 우주라이크) · 대표 노재민 · 사업자등록번호 268-11-03292 · 대구광역시 북구 대학로 80, 글로벌플라자 101호" },
    { label: "동의·서명", value: `${v.signature} · ${v.signed_at}` },
    { label: "약관 버전", value: `${TERMS_VERSION} · ${termsHash().slice(0, 16)}` },
  ];
}

/** 사본으로 보관·발송하는 단일 HTML. 외부 의존 없음. */
export function contractHtml(v: PartyValues, checks: Record<string, string>): string {
  const s = scheduleFrom(v.starts_on);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bold = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const party = partyLines(v).map((l) => `<tr><th>${esc(l.label)}</th><td>${esc(l.value)}</td></tr>`).join("");
  const arts = articles().map((a) => `<h2>${a.no} (${esc(a.title)})</h2><ol>${a.body.map((b) => `<li>${bold(b)}</li>`).join("")}</ol>`).join("");
  const chk = CHECKS.map((c) => `<tr><td>☑</td><td>${esc(c.text(s))}<div class="s">${esc(c.article)} · 동의 ${esc(checks[c.id] ?? "")}</div></td></tr>`).join("");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>우주라이크 파트너 매장 이용약관 및 개별 약정 · ${esc(v.name)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;max-width:760px;margin:0 auto;padding:32px 20px;line-height:1.6;font-size:13.5px}
h1{font-size:22px;text-align:center;margin:0 0 4px}.sub{text-align:center;color:#666;font-size:12.5px;margin-bottom:22px}
h2{font-size:14px;margin:22px 0 6px;border-left:3px solid #111;padding-left:8px}
table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:12.8px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f2f2f2;width:34%;font-weight:700}
ol{padding-left:18px;color:#333}li{margin:4px 0}.s{font-size:11px;color:#777;margin-top:2px}
.foot{margin-top:26px;padding-top:12px;border-top:1px solid #ccc;font-size:11px;color:#777}
@media print{body{padding:0}@page{size:A4;margin:16mm}}
</style></head><body>
<h1>파트너 매장 이용약관 및 개별 약정</h1><div class="sub">${esc(v.campus)} · 전자문서 사본 · 개시일 ${esc(kdate(s.starts_on))}</div>
<h2>개별 약정 (계약 당사자 및 조건)</h2><table>${party}</table>
${arts}
<h2>중요 내용 확인 (개별 동의)</h2><table>${chk}</table>
<div class="foot">이 문서는 파트너 매장이 온보딩 화면에서 약관을 열람하고 중요 내용에 개별 동의한 뒤 성명을 기재하여 성립한 계약의 사본입니다. 동의 시각·접속 정보·약관 버전 해시는 회사가 별도로 보관합니다. 문의: hello@wouldulike.kr</div>
</body></html>`;
}
