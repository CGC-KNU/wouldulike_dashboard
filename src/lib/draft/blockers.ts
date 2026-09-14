import { isPaidTier, type Campus, type Lead, type StoreRow, type TaxInvoice } from "./types";
import { defaultMonthlyFee } from "./pricing";

/**
 * "지금 막힌 것" — 애딧 Pitchr 의 '오늘 끝내야 할 일'을 우리 일에 맞춰 옮긴 것 (민열님 0914).
 *
 * ## 왜
 *
 * 홈이 숫자만 보여 주면 "그래서 뭘 하지"가 남는다. Pitchr 은 홈을 목록이 아니라 **큐**로 만든다 —
 * 항목마다 *무엇이 없어서 안 굴러가는지* 한 줄이 붙고, 버튼 하나로 그 일을 하는 화면으로 간다.
 * "처리해야 다음 목록에서 사라집니다"가 화면에 적혀 있다.
 *
 * ## 우리 것으로 바꾼 부분
 *
 * 애딧은 원격으로 팔아서 막히는 곳이 '답장 없음'이다. 우리는 만나서 팔기 때문에
 * 막히는 곳이 **방문·계약서·입금**이다. 그래서 항목이 다르다.
 *
 * ## 규칙
 *
 *   · 돈이 멈춘 것부터. 청구가 아예 못 나가는 것(금액·시작일 없음)이 안 들어온 것보다 위다.
 *   · 없는 값을 지어내지 않는다. 판단할 수 없으면 항목을 만들지 않는다.
 *   · 한 줄은 **무엇이 없어서 못 하는지**를 말한다. "확인 필요" 같은 말은 쓰지 않는다.
 *   · **오래된 빈 칸은 막힌 것이 아니다.** 계약서 회수·비치물은 최근 계약만 센다.
 *     시트에서 넘어온 예전 매장까지 전부 세우면 큐가 133줄이 되고, 그러면 아무도 안 본다.
 *   · 아직 아무도 손대지 않은 후보(미컨택 · 기록 없음)는 '막힌 것'이 아니라 '안 한 것'이다.
 *     그건 파트너 후보 화면의 일이지 큐의 일이 아니다.
 *   · **아무도 안 쓰는 칸으로 사람을 몰지 않는다.** 계약서 회수·사업자번호처럼 한 곳도 채워지지
 *     않은 칸은 "다 막혀 있다"가 아니라 "그 칸을 안 쓴다"는 뜻이다. 그런 규칙은 통째로 쉰다.
 *     한 곳이라도 채워지는 순간 규칙이 저절로 깨어난다.
 */

/** 계약서·비치물처럼 '최근 계약만' 보는 창. 이보다 오래된 빈 칸은 큐에 세우지 않는다. */
const RECENT_DAYS = 60;

export type BlockerKind = "money" | "contract" | "lead" | "kit";

export interface Blocker {
  id: string;
  kind: BlockerKind;
  /** 낮을수록 먼저. 0 = 돈이 아예 못 나감 */
  rank: number;
  name: string;
  /** 왜 막혔나 — 한 문장 */
  why: string;
  /** 버튼 하나 */
  action: { label: string; go: string };
  /** 보조 정보(캠퍼스·담당) — 있으면 이름 옆에 작게 */
  note?: string;
}

/** 칩에 쓰는 말 — 팀이 실제로 쓰는 말로 (민열님 0914). "돈"·"비치물"은 우리가 안 쓰는 말이었다. */
const KIND_LABEL: Record<BlockerKind, string> = {
  money: "입금",
  contract: "계약",
  lead: "컨택",
  kit: "포스터·스티커",
};
export { KIND_LABEL as BLOCKER_KIND_LABEL };

/** "2026-09-01" 같은 날짜가 며칠 전인지. 못 읽으면 null. */
function daysSinceDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = Date.parse(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** "2026-09-16" · "9/16" 같은 기한 문자열이 오늘보다 지났는지. 못 읽으면 판단하지 않는다. */
function overdue(due: string | null | undefined, today: string): boolean {
  if (!due) return false;
  const m = due.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/) ?? due.match(/()(\d{1,2})\s*[/월]\s*(\d{1,2})/);
  if (!m) return false;
  const y = m[1] || today.slice(0, 4);
  const d = `${y}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return d < today;
}

export function buildBlockers(
  stores: StoreRow[],
  leads: Lead[],
  invoices: TaxInvoice[],
  period: string,
  today: string
): Blocker[] {
  const out: Blocker[] = [];
  const real = stores.filter((s) => s.is_affiliate && !s.ops?.is_test);
  /** 팀이 실제로 쓰는 칸인가. 한 곳도 안 채웠으면 그 규칙은 쉰다. */
  const inUse = (pick: (s: StoreRow) => unknown) => real.some((s) => { const v = pick(s); return v !== null && v !== undefined && v !== "" && v !== false; });
  const usesPaper = inUse((s) => s.ops?.contract_returned_at);
  const usesBizNo = inUse((s) => s.ops?.biz_no);
  const usesKit = inUse((s) => s.ops?.kit_delivered);
  const live = invoices.filter((i) => !["CANCELED", "REJECTED"].includes(i.status));
  const paidThisPeriod = new Set(live.filter((i) => i.period === period && i.paid_at).map((i) => i.restaurant_id));
  const billedThisPeriod = new Set(live.filter((i) => i.period === period).map((i) => i.restaurant_id));

  // ── 파트너 매장
  for (const s of stores) {
    if (!s.is_affiliate || s.ops?.is_test) continue;
    const o = s.ops;
    const store = { label: "매장 열기", go: `astro-ops?open=${s.restaurant_id}` };
    const money = { label: "입금 현황", go: "astro-billing" };
    const campus = o?.campus ? `${o.campus}` : undefined;

    if (isPaidTier(s.tier) && o?.billing !== "EXEMPT") {
      // 청구가 **아예 못 나가는** 것들 — 이게 제일 위다
      if (!o?.monthly_fee) {
        out.push({ id: `fee:${s.restaurant_id}`, kind: "money", rank: 0, name: s.name, note: campus,
          why: "월 이용료가 비어 있어 청구를 만들 수 없습니다.", action: store });
      } else if (!o?.contract_started_on) {
        out.push({ id: `start:${s.restaurant_id}`, kind: "money", rank: 0, name: s.name, note: campus,
          why: "계약 시작일이 없어 청구가 나가지 않습니다.", action: store });
      } else if (o?.pay_cycle !== "LUMP" && !billedThisPeriod.has(s.restaurant_id)) {
        out.push({ id: `bill:${s.restaurant_id}`, kind: "money", rank: 1, name: s.name, note: campus,
          why: `${Number(period.slice(5))}월 청구가 아직 만들어지지 않았습니다.`, action: money });
      } else if (o?.pay_cycle !== "LUMP" && !paidThisPeriod.has(s.restaurant_id)) {
        out.push({ id: `pay:${s.restaurant_id}`, kind: "money", rank: 2, name: s.name, note: campus,
          why: `${Number(period.slice(5))}월 입금이 아직입니다.`, action: money });
      }
      if (o?.invoice === "NO_REPLY") {
        out.push({ id: `noreply:${s.restaurant_id}`, kind: "money", rank: 2, name: s.name, note: campus,
          why: "계산서를 보냈는데 회신이 없습니다.", action: money });
      }
      if (usesBizNo && o?.monthly_fee && !o?.biz_no) {
        out.push({ id: `biz:${s.restaurant_id}`, kind: "contract", rank: 3, name: s.name, note: campus,
          why: "사업자번호가 없어 세금계산서를 만들 수 없습니다.", action: store });
      }
    }

    // 계약이 시작됐는데 손에 안 들어온 것들 — 최근 계약만. 예전 건의 빈 칸은 기록 누락이지 막힘이 아니다.
    const since = daysSinceDate(o?.contract_started_on);
    const recent = since !== null && since <= RECENT_DAYS;
    if (usesPaper && recent && !o?.contract_returned_at) {
      out.push({ id: `paper:${s.restaurant_id}`, kind: "contract", rank: 4, name: s.name, note: campus,
        why: `계약을 시작한 지 ${since}일인데 계약서를 아직 못 받았습니다.`, action: store });
    }
    if (usesKit && recent && o?.kit_delivered === false) {
      out.push({ id: `kit:${s.restaurant_id}`, kind: "kit", rank: 5, name: s.name, note: campus,
        why: "포스터·QR 을 아직 전달하지 못했습니다.", action: store });
    }
  }

  // ── 파트너 후보
  for (const l of leads) {
    if (["재컨택", "보류", "거절", "계약 완료"].includes(l.stage)) continue;
    const go = { label: "후보 열기", go: `astro-leads?open=${l.id}` };
    const campus = l.campus ?? undefined;

    if (overdue(l.due, today)) {
      out.push({ id: `due:${l.id}`, kind: "lead", rank: 2, name: l.name, note: campus,
        why: `기한(${l.due})이 지났습니다.${l.next_action ? ` — ${l.next_action}` : ""}`, action: go });
      continue; // 같은 후보를 두 번 세우지 않는다
    }
    if (["미팅 조율", "미팅 예정"].includes(l.stage) && !l.meeting_at) {
      out.push({ id: `meet:${l.id}`, kind: "lead", rank: 3, name: l.name, note: campus,
        why: "미팅 단계인데 날짜가 잡혀 있지 않습니다.", action: { label: "일정에서 잡기", go: "astro-calendar" } });
      continue;
    }
    // 아직 아무도 손대지 않은 후보는 '막힌 것'이 아니라 '안 한 것'이다 — 큐에 세우지 않는다.
    const started = l.stage !== "미컨택" || Boolean(l.contacted_at);
    if (!started) continue;

    if (!l.owner) {
      out.push({ id: `owner:${l.id}`, kind: "lead", rank: 4, name: l.name, note: campus,
        why: "연락은 시작됐는데 담당자가 없습니다. 후속 영업이 이어지지 않습니다.", action: go });
      continue;
    }
    const d = daysAgo(l.last_touch_at);
    if (d !== null && d >= 7) {
      out.push({ id: `stale:${l.id}`, kind: "lead", rank: 5, name: l.name, note: campus,
        why: `${d}일째 기록이 없습니다. 마지막 단계는 '${l.stage}'입니다.`, action: go });
    }
  }

  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko"));
}

/**
 * 제안 플랜에서 월 이용료를 읽는다.
 *
 *   1) 글자에 숫자가 있으면 그걸 쓴다 — "Boost 3만" · "33,000" · "4.5만" (예전 자유 입력 값).
 *   2) 없으면 플랜 이름과 캠퍼스의 **기본 단가**를 쓴다 — "Boost" + 영남대 = 49,500.
 *   3) 둘 다 아니면 `null`. 프리미엄처럼 정가가 없는 것은 세지 않는다.
 *
 * 지어내지 않는다는 규칙은 그대로다. 2)는 우리가 실제로 정한 값이지 추측이 아니다.
 */
export function monthlyFromPlan(plan: string | null | undefined, campus?: Campus | null): number | null {
  if (!plan) return null;
  const man = plan.match(/(\d+(?:\.\d+)?)\s*만/);
  if (man) return Math.round(Number(man[1]) * 10_000);
  const won = plan.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원?/);
  if (won) return Number(won[1].replace(/,/g, ""));
  const tier = /boost/i.test(plan) ? "BOOST" : /free|무료/i.test(plan) ? "FREE" : null;
  const v = tier ? defaultMonthlyFee(tier, campus ?? null) : null;
  return v && v > 0 ? v : null;
}
