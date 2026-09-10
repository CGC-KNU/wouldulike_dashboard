import { SALES_SHEET } from "@/lib/satellite";
import type { BillingState, InvoiceState, Lead, LeadIntent, LeadStage, PayCycle, StoreOps } from "./types";
import { ALL_LEAD_STAGES, emptyStoreOps } from "./types";

/**
 * 팀 세일즈 시트 읽기.
 *
 * 지금 영업의 진짜 도구는 이 시트다(민열님 0910: "구글 시트를 대안으로 사용 중이니 시트 많이 참고").
 * 그래서 Astro 는 시트를 **대체**하지 않고 **읽는다**. 시트의 열을 그대로 툴의 필드로 옮기고,
 * 매장명으로 백엔드 매장과 잇는다. 쓰기는 툴 안(입금 확인·활동 기록)에만 하고 시트는 건드리지 않는다.
 *
 * 공개 CSV export 를 쓴다 (2026-08-30 확인). 시트가 비공개로 바뀌면 이 모듈은 빈 배열을 돌려주고
 * 화면은 "시트를 읽지 못했습니다"를 띄운다. 조용히 0 으로 채우지 않는다.
 */

/* ─── CSV ─── */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function fetchTab(gid: number): Promise<Record<string, string>[] | null> {
  try {
    const res = await fetch(SALES_SHEET.csv(gid), { cache: "no-store" });
    if (!res.ok) return null;
    const rows = parseCsv(await res.text());
    if (rows.length < 2) return [];
    const head = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
  } catch {
    return null;
  }
}

/* ─── 매장명 정규화 ───
   탭마다 같은 매장이 다르게 적혀 있다 — "다이와스시 경대점" / "다이와스시", "스톡홀롬샐러드" / "스톡홀름샐러드".
   지점 접미사와 공백을 걷어내고 비교한다. 완벽하지 않으므로 매칭 결과는 화면에 그대로 보여준다. */

export function normName(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/(경대북문점|경대정문점|경북대점|경대점|경대남문점|본점|정문점|북문점|영남대점|계명대점)$/g, "")
    .replace(/스톡홀롬/g, "스톡홀름")
    .toLowerCase();
}

function blank(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function stageOf(v: string | undefined): LeadStage {
  const t = (v ?? "").trim();
  return (ALL_LEAD_STAGES as readonly string[]).includes(t) ? (t as LeadStage) : "미컨택";
}

function intentOf(v: string | undefined): LeadIntent | null {
  const m = (v ?? "").trim().match(/^([ABCD])/);
  return m ? (m[1] as LeadIntent) : null;
}

/* ─── 후보/컨택 → Lead ─── */

export function rowToLead(r: Record<string, string>, source: Lead["source"], now: string): Lead | null {
  const name = blank(r["매장명"]);
  if (!name || name.startsWith("──") || name.startsWith("■")) return null;
  const score = Number(r["점수"]);
  return {
    id: `sheet-${source.split(":")[1]}-${normName(name)}`,
    name,
    kind: (blank(r["구분"]) as Lead["kind"]) ?? null,
    district: blank(r["상권"]),
    category: blank(r["카테고리"]),
    stage: stageOf(r["단계"]),
    owner: blank(r["담당자"]),
    intent: intentOf(r["유료화 의향"]),
    owner_name: blank(r["대표자"]),
    phone: blank(r["전화번호"]),
    contact: blank(r["연락처"]),
    link: blank(r["링크"]) ?? blank(r["인스타/링크"]),
    insta: blank(r["인스타 계정"]),
    channel: null,
    contacted_at: blank(r["컨택 일시"]),
    meeting_at: blank(r["미팅 일시"]),
    attendees: blank(r["미팅 참석자"]),
    proposed_plan: blank(r["제안 플랜"]),
    next_action: blank(r["다음 액션"]) ?? (source === "sheet:현황" ? blank(r["입금여부"]) : null),
    due: blank(r["기한"]),
    last_touch_at: null,
    grade: (blank(r["등급"]) as Lead["grade"]) ?? null,
    score: Number.isFinite(score) && r["점수"] ? score : null,
    angle: blank(r["공략 포인트"]),
    memo: [blank(r["비고"]), blank(r["사전조사·메모"])].filter(Boolean).join("\n") || null,
    source,
    created_at: now,
    converted_restaurant_id: null,
  };
}

/* ─── 계약 세부사항 + 매장 현황 → StoreOps 보강 ─── */

function feeOf(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/[^\d]/g, ""));
  return n > 0 ? n : null;
}

function cycleOf(v: string | undefined): PayCycle | null {
  const t = (v ?? "").trim();
  if (t.includes("월납")) return "MONTHLY";
  if (t.includes("일시")) return "LUMP";
  return null;
}

function startOf(v: string | undefined): string | null {
  const m = (v ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 시트 '견적서·세금계산서 발송' 열의 자유 텍스트를 두 상태로 가른다. 못 읽으면 건드리지 않는다. */
function billingOf(v: string | undefined): { billing?: BillingState; invoice?: InvoiceState } {
  const t = (v ?? "").trim();
  if (!t) return {};
  if (t.includes("입금완료") || t.includes("입금 완료")) return { billing: "PAID", invoice: "ISSUED" };
  if (t.includes("발송")) return { invoice: "SENT", billing: "PENDING" };
  if (t.includes("유보")) return { invoice: "NONE", billing: "PENDING" };
  return {};
}

function kitOf(v: string | undefined): { kit_delivered?: boolean; kit_note: string | null } {
  const t = (v ?? "").trim();
  if (!t) return { kit_note: null };
  const zero = /^0장/.test(t);
  return { kit_delivered: !zero, kit_note: t };
}

export interface SheetStoreInfo {
  name: string;
  norm: string;
  patch: Partial<StoreOps>;
}

/** 계약 탭 한 행을 운영 필드 패치로. 매장 매칭은 호출자가 한다. */
export function contractRowToOps(r: Record<string, string>, syncedAt: string): SheetStoreInfo | null {
  const name = blank(r["매장명"]);
  if (!name) return null;
  const plan = blank(r["플랜"]);
  const benefit = [
    blank(r["기본 쿠폰 (상시)"]) && `상시: ${r["기본 쿠폰 (상시)"]}`,
    blank(r["한정 쿠폰"]) && `한정: ${r["한정 쿠폰"]}`,
    blank(r["스탬프 적립 개수"]) && `스탬프 ${r["스탬프 적립 개수"]}: ${r["스탬프 혜택"] ?? ""}`,
    blank(r["식사권 제외 메뉴·시간대"]) && `제외: ${r["식사권 제외 메뉴·시간대"]}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    name,
    norm: normName(name),
    patch: {
      monthly_fee: plan === "무료" ? 0 : feeOf(r["월 이용료 (VAT 포함)"]),
      pay_cycle: cycleOf(r["납부 방식"]),
      contract_started_on: startOf(r["제1차 이용기간"]),
      contract_months: (() => {
        const m = (r["전체 계약기간"] ?? "").match(/(\d{4})-(\d{2})-\d{2}\s*~\s*(\d{4})-(\d{2})/);
        if (!m) return null;
        return (Number(m[3]) - Number(m[1])) * 12 + (Number(m[4]) - Number(m[2])) + 1;
      })(),
      ...billingOf(r["견적서·세금계산서 발송"]),
      ...kitOf(r["홍보물 수령 (포스터/QR/배너)"]),
      pin: blank(r["PIN 번호"]),
      sheet_owner: blank(r["담당자"]),
      benefit_note: benefit || null,
      sheet_synced_at: syncedAt,
    },
  };
}

/** 매장 현황 탭에서 대표자·연락처를 가져온다. */
export function statusRowToOps(r: Record<string, string>): SheetStoreInfo | null {
  const name = blank(r["매장명"]);
  if (!name) return null;
  return {
    name,
    norm: normName(name),
    patch: {
      owner_name: blank(r["대표자"]),
      owner_phone: blank(r["연락처"]),
    },
  };
}

export { emptyStoreOps };
