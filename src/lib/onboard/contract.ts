import { createHash } from "node:crypto";
import type { OnboardPlan } from "./token";

/**
 * 온보딩 화면에 올라가는 계약 본문 — 종이 계약서 `우주라이크_파트너매장_계약서_26_2_간소화` 의 요지.
 *
 * 원칙 (0921 설계): 정형 부분(약관)과 개별 약정(플랜·이용료·당사자)을 나눈다. 약관은 여기 상수로 두고
 * **버전과 해시**를 붙인다 — 동의 기록에는 "어느 문구에 동의했는지"가 해시로 남아야 한다.
 * 문구를 한 글자라도 고치면 VERSION 을 올려라. 지난 버전에 동의한 매장의 기록이 달라지면 안 된다.
 *
 * 중요 내용(약관규제법 §3 설명의무)은 `CHECKS` 로 따로 뽑아 **개별 체크**를 받는다.
 * 종이 계약서 6면의 "확인란" 표를 그대로 옮긴 것이다.
 */

export const TERMS_VERSION = "26-2.v6.onboard.1";

export interface CampusTerms {
  campus: string;
  /** 계약기간 */
  starts_on: string; ends_on: string; months: number;
  /** 제1차 이용기간(최소 이용기간) */
  first_from: string; first_to: string;
  /** 무상 준비기간 종료일 */
  prep_until: string;
  /** 제1차 기간 안에 해지 통지 시 종료일 */
  first_exit_on: string;
  boost_fee: number;
}

const KNU: CampusTerms = { campus: "경북대", starts_on: "2026-09-01", ends_on: "2027-02-28", months: 6, first_from: "2026-09-01", first_to: "2026-09-30", prep_until: "2026-08-31", first_exit_on: "2026-10-01", boost_fee: 30000 };
const NEW: Omit<CampusTerms, "campus"> = { starts_on: "2026-10-01", ends_on: "2027-02-28", months: 5, first_from: "2026-10-01", first_to: "2026-10-31", prep_until: "2026-09-30", first_exit_on: "2026-11-01", boost_fee: 45000 };

export function campusTerms(campus: string): CampusTerms {
  if (campus === "경북대") return KNU;
  return { campus, ...NEW };
}

export const PLAN_LABEL: Record<OnboardPlan, string> = { FREE: "무료", BOOST: "Boost", PREMIUM: "Premium" };

/** 플랜별 기본 이용료(부가세 별도). 발급자가 토큰에 다른 값을 넣으면 그 값이 우선한다. */
export function defaultFee(plan: OnboardPlan, campus: string): number {
  if (plan === "FREE") return 0;
  if (plan === "PREMIUM") return 80000;
  return campusTerms(campus).boost_fee;
}

const won = (n: number) => n.toLocaleString("ko-KR") + "원";
const kdate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };

export interface Article { no: string; title: string; body: string[] }

/** 정형 약관 — 스크롤해서 읽는 부분. 매장별 값은 들어가지 않는다 (그래야 해시가 매장마다 같다). */
export function articles(t: CampusTerms): Article[] {
  return [
    { no: "제1조", title: "목적 및 계약기간", body: [
      "회사(상호 코끼리, 서비스명 우주라이크)는 자사 애플리케이션·웹사이트·인스타그램 및 제휴 채널을 통하여 파트너 매장을 홍보하고, 파트너 매장은 이용자에게 쿠폰·스탬프 혜택 및 마일리지 추첨의 당첨 상품을 제공하며, 회사가 그 당첨 상품의 대금을 정산함으로써 상호 이익을 도모한다.",
      `계약기간은 ${kdate(t.starts_on)}부터 ${kdate(t.ends_on)}까지 ${t.months}개월로 한다. 체결일부터 ${kdate(t.prep_until)}까지는 무상 준비기간으로, 회사는 이 기간에 매장 정보·혜택의 등록과 홍보물 제작을 수행하며 이용료를 청구하지 아니한다.`,
      "본 계약은 자동으로 갱신되지 아니한다. 회사는 2027년 1월 29일까지 차기 학기의 조건을 통지하고, 파트너 매장은 2027년 2월 14일까지 연장 여부를 회신한다.",
    ]},
    { no: "제2조", title: "플랜 및 이용료", body: [
      "이용료는 부가가치세 별도이며, 이용료에 관한 조항은 유료 플랜에 한하여 적용한다. 무료 플랜의 경우 이용료가 없다.",
      "이용료의 정산 단위는 1개월로 한다. 파트너 매장은 매월 이용료를 해당 월의 전월 말일까지 회사가 통지한 계좌로 지급하며, 최초 이용료는 체결일부터 7일 이내에 지급한다.",
      "입금 계좌는 세금계산서에 기재하여 통지하며, 그 예금주는 회사(상호 코끼리) 또는 그 대표자 노재민의 명의로 한다. 회사는 세금계산서에 기재하지 아니한 계좌로 입금을 요구하지 아니한다.",
      "회사는 계약기간 중 이용료를 인상하지 아니하며, 연체이자를 청구하지 아니한다. 회사는 최초 이용료의 입금이 확인된 때부터 용역을 개시한다.",
    ]},
    { no: "제3조", title: "회사의 제공 용역 및 최소 횟수", body: [
      "회사는 계약기간 전체에 걸쳐 앱에 매장 정보 및 혜택을 상시 게재하고, 기본 쿠폰과 스탬프·마일리지 적립 및 추첨을 운영하며, 당첨 식사권 대금을 매월 1회(다음 달 10일까지) 정산한다.",
      "회사는 포스터 1종과 QR 스티커 2매를 계약기간 중 1회 무상으로 제작·제공한다.",
      "유료 플랜에 대하여 회사는 캠페인(한정 쿠폰)에 계약기간 중 1회 이상 편입하고(이행기한 2026년 11월 30일, 대체 이행기한 12월 31일), 캠페인 회차마다 앱 배너 노출과 푸시 알림을 발송하며, 캠페인 기간 외에도 월 1회 이상 앱 배너에 노출한다.",
      "제휴 채널(학생회·단과대)은 제3자가 자율적으로 운영하므로 회사는 게재를 강제할 수 없으며, 회사의 채무는 회차마다 배포를 요청하고 결과를 통지하는 것으로 이행한 것으로 본다. 회사는 대학의 명칭·엠블럼을 사용하지 아니한다.",
    ]},
    { no: "제4조", title: "파트너 매장의 협조", body: [
      "파트너 매장은 회사가 요청하는 매장 정보·메뉴·혜택 내용 및 사진을 제공하고, 앱에 등록된 혜택을 이용자에게 실제로 제공한다.",
      "파트너 매장은 제공한 사진·상호에 대한 이용 권한을 보유함을 보증하며, 회사는 이를 앱·웹사이트·인스타그램 및 제휴 채널의 홍보에 사용할 수 있다.",
      "휴업·폐업·업종·상호의 변경 및 초상권·개인정보에 관한 요청은 회사가 7일 이내에 처리한다.",
    ]},
    { no: "제5조", title: "마일리지 추첨 및 당첨 식사권의 정산", body: [
      "회사는 이용자의 스탬프·마일리지 적립을 바탕으로 추첨을 운영하며, 당첨 이용자는 파트너 매장에서 액면 1만원(부가세 포함)의 식사권을 사용할 수 있다.",
      "당첨 식사권의 대금은 회사가 부담하며, 파트너 매장에 매월 1회 다음 달 10일까지 정산한다. 이는 손해배상이 아니라 회사가 부담하는 대금 채무이므로 상한과 관계없이 전액 지급한다.",
    ]},
    { no: "제6조", title: "정보 보호", body: [
      "회사는 파트너 매장의 성과 데이터·매출 추정치·이용료 조건을 동일 상권의 동종 매장에 제공하거나 영업 자료로 사용하지 아니한다. 상권 통계를 산출하는 경우 매장을 식별할 수 없도록 집계한다.",
      "파트너 매장은 혜택 처리 과정에서 알게 된 이용자의 정보를 혜택 처리 외의 목적으로 이용하지 아니한다.",
    ]},
    { no: "제7조", title: "최소 이용기간 · 해지 및 환급", body: [
      `본 계약의 최소 이용기간은 1개월로 하며, ${kdate(t.first_from)}부터 ${kdate(t.first_to)}까지로 한다(제1차 이용기간).`,
      `파트너 매장은 매월 말일까지 서면(문자·카카오톡·전자우편 포함)으로 통지함으로써 다음 달 1일자로 해지할 수 있다. 위약금 및 해지 수수료는 없다. 파트너 매장이 ${kdate(t.first_to)}까지 해지를 통지한 경우 본 계약은 ${kdate(t.first_exit_on)}자로 종료하고, 파트너 매장은 제1차 이용기간분 이용료 외에 어떠한 금원도 부담하지 아니한다.`,
      "회사는 미경과 월분을 월 단위로 전액 환급한다. 환급은 계약 종료일부터 14일 이내에 이행하고 수정세금계산서를 발행한다. 위약금·해지 수수료 및 실비의 공제는 일체 없다.",
      "파트너 매장이 휴업 또는 폐업하는 경우 증빙의 제출로써 본 계약은 종료한다.",
    ]},
    { no: "제8조", title: "손해배상 및 불가항력", body: [
      "어느 한쪽이 본 계약을 위반하여 상대방에게 손해를 발생시킨 경우 그 손해를 배상한다. 한쪽이 상대방에게 배상하는 금액의 합계는 파트너 매장이 본 계약에 따라 실제로 지급한 이용료(부가가치세 포함)를 초과하지 아니하며, 간접손해·특별한 사정으로 인한 손해 및 상실이익은 배상하지 아니한다.",
      "천재지변, 감염병, 정부의 조치, 대학의 학사일정 변경, 외부 플랫폼의 정책·기능 변경, 통신 장애 등 회사가 통제할 수 없는 사정으로 용역을 제공하지 못한 경우 회사는 책임을 부담하지 아니하며, 파트너 매장과 협의하여 대체 방안 또는 기간의 조정을 정한다.",
    ]},
    { no: "제9조", title: "계약의 성립 및 전자문서", body: [
      "본 계약은 파트너 매장이 이 화면에서 약관을 열람하고 중요 내용에 개별적으로 동의한 뒤 서명란에 성명을 기재함으로써 성립한다. 회사는 동의 시각·접속 정보·동의한 약관의 버전을 기록하고, 계약 내용을 파트너 매장이 지정한 전자우편 및 연락처로 교부한다.",
      "본 계약은 전자문서 및 전자거래 기본법에 따른 전자문서로서 효력을 가지며, 종이 문서로 작성한 것과 동일하게 취급한다.",
    ]},
  ];
}

/** 중요 내용 개별 체크 — 종이 계약서 6면 확인란을 옮긴 것. 전부 체크해야 서명할 수 있다. */
export interface Check { id: string; text: (t: CampusTerms) => string; article: string }
export const CHECKS: Check[] = [
  { id: "min_term", article: "제7조", text: (t) => `최소 이용기간은 1개월(${kdate(t.first_from)} ~ ${kdate(t.first_to)})입니다. 매월 말일까지 통지하면 다음 달 1일자로 해지되며, 위약금은 없습니다.` },
  { id: "fee_refund", article: "제2조·제7조", text: () => "유료 플랜의 이용료는 부가세 별도이며, 해지 시 미경과 월분은 전액 환급됩니다. 이용료는 계약기간 중 인상되지 않습니다." },
  { id: "mileage", article: "제5조", text: () => "마일리지 추첨 당첨 식사권(액면 1만원)은 매장이 이용자에게 제공하고, 그 대금은 회사가 매월 10일까지 정산합니다." },
  { id: "campaign", article: "제3조", text: () => "캠페인(한정 쿠폰) 편입은 2026년 11월 30일이 이행기한이며, 첫 달에는 이행되지 않을 수 있습니다." },
  { id: "media", article: "제4조", text: () => "제공한 매장 사진·상호를 회사가 앱·인스타그램·제휴 채널 홍보에 사용하는 데 동의합니다." },
];

/** 약관 본문 해시 — 동의 기록에 남긴다. 상권마다 날짜가 달라 상권별로 해시가 다르다(의도). */
export function termsHash(campus: string): string {
  const t = campusTerms(campus);
  const text = [TERMS_VERSION, ...articles(t).flatMap((a) => [a.no, a.title, ...a.body]), ...CHECKS.map((c) => c.id + ":" + c.text(t))].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface PartyValues {
  name: string; campus: string; plan: OnboardPlan; fee: number;
  owner_name: string; biz_no: string; phone: string; email: string;
  signed_at: string; signature: string;
}

/** 개별 약정 — 계약서 1면 당사자 표 + 플랜 표. 이 값들이 그대로 사본에 박힌다. */
export function partyLines(v: PartyValues): { label: string; value: string }[] {
  const vat = Math.round(v.fee * 0.1);
  return [
    { label: "파트너 매장", value: v.name },
    { label: "대표자", value: v.owner_name },
    { label: "사업자등록번호", value: v.biz_no },
    { label: "연락처", value: v.phone },
    { label: "전자우편(계약서·세금계산서)", value: v.email || "—" },
    { label: "상권", value: v.campus },
    { label: "플랜", value: PLAN_LABEL[v.plan] },
    { label: "월 이용료", value: v.fee ? `${won(v.fee)} + 부가세 ${won(vat)} = ${won(v.fee + vat)}` : "0원" },
    { label: "회사", value: "코끼리 (서비스명 우주라이크) · 대표 노재민 · 사업자등록번호 268-11-03292 · 대구광역시 북구 대학로 80, 글로벌플라자 101호" },
    { label: "동의·서명", value: `${v.signature} · ${v.signed_at}` },
    { label: "약관 버전", value: `${TERMS_VERSION} · ${termsHash(v.campus).slice(0, 16)}` },
  ];
}

/** 사본으로 보관·발송하는 단일 HTML. 외부 의존 없음. */
export function contractHtml(v: PartyValues, checks: Record<string, string>): string {
  const t = campusTerms(v.campus);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const party = partyLines(v).map((l) => `<tr><th>${esc(l.label)}</th><td>${esc(l.value)}</td></tr>`).join("");
  const arts = articles(t).map((a) => `<h2>${a.no} (${esc(a.title)})</h2><ol>${a.body.map((b) => `<li>${esc(b)}</li>`).join("")}</ol>`).join("");
  const chk = CHECKS.map((c) => `<tr><td>☑</td><td>${esc(c.text(t))}<div class="s">${esc(c.article)} · 동의 ${esc(checks[c.id] ?? "")}</div></td></tr>`).join("");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>우주라이크 파트너 매장 계약서 · ${esc(v.name)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;max-width:760px;margin:0 auto;padding:32px 20px;line-height:1.6;font-size:13.5px}
h1{font-size:22px;text-align:center;margin:0 0 4px}.sub{text-align:center;color:#666;font-size:12.5px;margin-bottom:22px}
h2{font-size:14px;margin:22px 0 6px;border-left:3px solid #111;padding-left:8px}
table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:12.8px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f2f2f2;width:34%;font-weight:700}
ol{padding-left:18px;color:#333}li{margin:4px 0}.s{font-size:11px;color:#777;margin-top:2px}
.foot{margin-top:26px;padding-top:12px;border-top:1px solid #ccc;font-size:11px;color:#777}
@media print{body{padding:0}@page{size:A4;margin:16mm}}
</style></head><body>
<h1>파트너 매장 계약서</h1><div class="sub">26-2학기 · ${esc(t.campus)} · 전자문서 사본</div>
<h2>계약 당사자 및 개별 약정</h2><table>${party}</table>
${arts}
<h2>중요 내용 확인 (개별 동의)</h2><table>${chk}</table>
<div class="foot">이 문서는 파트너 매장이 온보딩 화면에서 약관을 열람하고 중요 내용에 개별 동의한 뒤 성명을 기재하여 성립한 계약의 사본입니다. 동의 시각·접속 정보·약관 버전 해시는 회사가 별도로 보관합니다. 문의: hello@wouldulike.kr</div>
</body></html>`;
}
