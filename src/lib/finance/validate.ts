import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseCycle, type ExpenseEntry, type ExpenseItem, type ExpenseMethod } from "./types";

/**
 * 재무 입력 검사 — 라우트가 백엔드·초안 어느 쪽에 쓰기 전에 같은 규칙으로 거른다.
 * 돈을 다루는 값이라 **조용히 고쳐 주지 않는다**: 이상하면 이유를 말하고 막는다.
 * (이름 앞뒤 공백 정리, 분류가 목록에 없으면 「기타」 정도만 눈감는다.)
 */

export type Checked<T> = { ok: true; value: T } | { ok: false; detail: string };

const bad = (detail: string): { ok: false; detail: string } => ({ ok: false, detail });
const isPeriod = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** 한국 날짜(YYYY-MM-DD) — 서버 시간대와 무관하게 오늘을 센다. */
export function todayKst(now: number = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

function category(v: unknown): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(v as string) ? (v as ExpenseCategory) : "기타";
}

/** 금액 — 0 이상 정수, 또는 null(모름). 소수·음수·문자는 막는다. */
function money(v: unknown, allowNull: boolean): Checked<number | null> {
  if (v === null || v === undefined || v === "") return allowNull ? { ok: true, value: null } : bad("금액을 입력하세요.");
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원]/g, ""));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return bad("금액은 0 이상의 정수여야 합니다.");
  if (n > 10_000_000_000) return bad("금액이 너무 큽니다. 자릿수를 확인하세요.");
  return { ok: true, value: n };
}

type Body = Record<string, unknown>;

/** 고정 비용 항목 — 만들 때(`partial=false`)는 이름이 필수, 고칠 때는 온 칸만 본다. */
export function checkItem(body: Body, partial: boolean): Checked<Partial<ExpenseItem>> {
  const out: Partial<ExpenseItem> = {};

  if (!partial || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return bad("항목 이름을 입력하세요.");
    if (name.length > 60) return bad("항목 이름은 60자 이하여야 합니다.");
    out.name = name;
  }
  if (!partial || "category" in body) out.category = category(body.category);
  if (!partial || "method" in body) {
    const m = body.method ?? "FIXED";
    if (m !== "FIXED" && m !== "PER_PAID_STORE") return bad("출금 방식은 고정 금액 · 유료 식당 수 × 단가 중 하나입니다.");
    out.method = m as ExpenseMethod;
  }
  if (!partial || "amount" in body) {
    const m = money(body.amount, true);
    if (!m.ok) return m;
    out.amount = m.value;
  }
  if (!partial || "cycle" in body) {
    const c = body.cycle ?? "MONTHLY";
    if (c !== "MONTHLY" && c !== "YEARLY") return bad("주기는 매월 · 매년 중 하나입니다.");
    out.cycle = c as ExpenseCycle;
  }
  if (!partial || "pay_day" in body) {
    const d = body.pay_day;
    if (d === null || d === undefined || d === "") out.pay_day = null;
    else {
      const n = Number(d);
      if (!Number.isInteger(n) || n < 1 || n > 31) return bad("지급일은 1~31 사이 숫자입니다.");
      out.pay_day = n;
    }
  }
  if (!partial || "start_period" in body) {
    if (!isPeriod(body.start_period)) return bad("시작 월은 YYYY-MM 형식이어야 합니다.");
    out.start_period = body.start_period;
  }
  if (!partial || "end_period" in body) {
    const e = body.end_period;
    if (e === null || e === undefined || e === "") out.end_period = null;
    else if (!isPeriod(e)) return bad("종료 월은 YYYY-MM 형식이어야 합니다.");
    else out.end_period = e;
  }
  if ("active" in body) out.active = Boolean(body.active);
  if ("memo" in body) {
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    if (memo.length > 300) return bad("메모는 300자 이하여야 합니다.");
    out.memo = memo || null;
  }

  // 시작 · 종료가 둘 다 이 요청에 있으면 앞뒤를 확인한다 (한쪽만 고칠 때는 서버가 합쳐서 다시 본다)
  if (out.start_period && out.end_period && out.end_period < out.start_period) return bad("종료 월이 시작 월보다 앞입니다.");
  return { ok: true, value: out };
}

/** 출금 한 건 — 돈이 나간 날은 오늘 이후일 수 없다(나갈 돈은 「이번 달 예정」이 맡는다). */
export function checkEntry(body: Body, partial: boolean, today: string): Checked<Partial<ExpenseEntry>> {
  const out: Partial<ExpenseEntry> = {};

  if (!partial || "paid_on" in body) {
    if (!isDate(body.paid_on)) return bad("나간 날은 YYYY-MM-DD 형식이어야 합니다.");
    if (body.paid_on > today) return bad("나간 날은 오늘 이후가 될 수 없습니다. 나갈 돈은 「이번 달 예정」에 있습니다.");
    out.paid_on = body.paid_on;
  }
  if (!partial || "period" in body) {
    // 귀속 월을 안 주면 나간 달 몫으로 본다
    const p = body.period ?? (typeof body.paid_on === "string" ? body.paid_on.slice(0, 7) : undefined);
    if (!isPeriod(p)) return bad("귀속 월은 YYYY-MM 형식이어야 합니다.");
    out.period = p;
  }
  if (!partial || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return bad("내용을 입력하세요.");
    if (name.length > 80) return bad("내용은 80자 이하여야 합니다.");
    out.name = name;
  }
  if (!partial || "category" in body) out.category = category(body.category);
  if (!partial || "amount" in body) {
    const m = money(body.amount, false);
    if (!m.ok) return m;
    if (!m.value) return bad("금액은 0원보다 커야 합니다.");
    out.amount = m.value;
  }
  if (!partial || "item_id" in body) {
    const id = body.item_id;
    out.item_id = id === null || id === undefined || id === "" ? null : String(id);
  }
  if ("memo" in body) {
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    if (memo.length > 300) return bad("메모는 300자 이하여야 합니다.");
    out.memo = memo || null;
  }
  return { ok: true, value: out };
}
