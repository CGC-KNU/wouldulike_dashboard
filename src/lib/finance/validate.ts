import { ACCOUNTS, BEHAVIORS, CAMPUSES, ENTRY_TAGS, EXPENSE_CATEGORIES, FUNDING_KINDS, FUNDING_STATUSES, type AccountBalance, type ExpenseAccount, type ExpenseBehavior, type ExpenseCategory, type ExpenseCycle, type ExpenseEntry, type ExpenseItem, type EntryTag, type ExpenseMethod, type FundingEvent, type FundingKind, type FundingStatus } from "./types";

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

/** 반복 항목 — 만들 때(`partial=false`)는 이름이 필수, 고칠 때는 온 칸만 본다. */
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
  // 행동 방식 · 회계 위치 — 항목에만 있다. 비우면 미분류(null).
  if (!partial || "behavior" in body) {
    const b = body.behavior;
    if (b === null || b === undefined || b === "") out.behavior = null;
    else if (!(BEHAVIORS as string[]).includes(b as string)) return bad("행동 방식은 고정 · 변동 · 준변동 · 일회성 중 하나입니다.");
    else out.behavior = b as ExpenseBehavior;
  }
  if (!partial || "account" in body) {
    const a = body.account;
    if (a === null || a === undefined || a === "") out.account = null;
    else if (!(ACCOUNTS as string[]).includes(a as string)) return bad("회계 위치는 COGS · S&M · R&D · G&A 중 하나입니다.");
    else out.account = a as ExpenseAccount;
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
  // 매입 세액 · 선택 태그(1122) — 온 칸만 본다. 비우면 null.
  if ("tax" in body) {
    const m = money(body.tax, true);
    if (!m.ok) return bad(m.detail.replace("금액", "세액"));
    out.tax = m.value;
  }
  if ("tag" in body) {
    const t = body.tag;
    if (t === null || t === undefined || t === "") out.tag = null;
    else if (!(ENTRY_TAGS as string[]).includes(t as string)) return bad("태그는 입점 · 상권 진입 중 하나입니다.");
    else out.tag = t as EntryTag;
  }
  if ("store_id" in body) {
    const v = body.store_id;
    if (v === null || v === undefined || v === "") out.store_id = null;
    else if (!Number.isInteger(Number(v))) return bad("매장 번호가 올바르지 않습니다.");
    else out.store_id = Number(v);
  }
  if ("campus" in body) {
    const c = body.campus;
    if (c === null || c === undefined || c === "") out.campus = null;
    else if (!(CAMPUSES as readonly string[]).includes(c as string)) return bad("상권은 경북대 · 영남대 · 계명대 중 하나입니다.");
    else out.campus = c as string;
  }
  // 한 요청 안에서 볼 수 있는 것만 — 고칠 때 합친 뒤 규칙은 서버가 다시 본다
  if (out.tax != null && out.amount != null && out.tax > out.amount) return bad("세액이 출금액보다 큽니다.");
  if (out.tag === "campus" && !out.campus && (!partial || "campus" in body)) return bad("상권 태그는 상권을 골라야 합니다.");
  if ("tag" in out && out.tag !== "onboarding" && out.store_id != null) return bad("매장은 입점 태그에만 고를 수 있습니다.");
  return { ok: true, value: out };
}

/** 재무 설정 — 영업 시간 단가(원/시간). */
export function checkSettings(body: Body): Checked<{ hour_rate: number }> {
  const m = money(body.hour_rate, false);
  if (!m.ok) return bad(m.detail.replace("금액", "시간 단가"));
  if ((m.value as number) > 1_000_000) return bad("시간 단가가 너무 큽니다(시간당 100만 원 이하).");
  return { ok: true, value: { hour_rate: m.value as number } };
}

const memoOf = (v: unknown): Checked<string | null> => {
  const memo = typeof v === "string" ? v.trim() : "";
  return memo.length > 300 ? bad("메모는 300자 이하여야 합니다.") : { ok: true, value: memo || null };
};

/** 월말 잔고 — 0원은 있을 수 있다(빈 통장). 기준일은 오늘 이후가 될 수 없다. */
export function checkBalance(body: Body, partial: boolean, today: string): Checked<Partial<AccountBalance>> {
  const out: Partial<AccountBalance> = {};
  if (!partial || "account_name" in body) {
    const name = typeof body.account_name === "string" ? body.account_name.trim() : "";
    if (!name) return bad("계좌 이름을 입력하세요.");
    if (name.length > 40) return bad("계좌 이름은 40자 이하여야 합니다.");
    out.account_name = name;
  }
  if (!partial || "last4" in body) {
    const v = typeof body.last4 === "string" || typeof body.last4 === "number" ? String(body.last4).trim() : "";
    if (v && !/^\d{4}$/.test(v)) return bad("계좌 끝 4자리는 숫자 4개입니다.");
    out.last4 = v || null;
  }
  if (!partial || "amount" in body) {
    const m = money(body.amount, false);
    if (!m.ok) return bad(m.detail.replace("금액", "잔고"));
    out.amount = m.value as number;
  }
  if (!partial || "as_of" in body) {
    if (!isDate(body.as_of)) return bad("기준일은 YYYY-MM-DD 형식이어야 합니다.");
    if (body.as_of > today) return bad("기준일은 오늘 이후가 될 수 없습니다.");
    out.as_of = body.as_of;
    out.period = body.as_of.slice(0, 7);
  }
  if ("reconciled" in body) out.reconciled = Boolean(body.reconciled);
  if ("memo" in body) {
    const m = memoOf(body.memo);
    if (!m.ok) return m;
    out.memo = m.value;
  }
  return { ok: true, value: out };
}

/** 자금 조달 — 「입금」이면 금액 · 입금일이 있어야 한다(한쪽만 고칠 때는 라우트가 합쳐서 다시 본다: checkFundingWhole). */
export function checkFunding(body: Body, partial: boolean, today: string): Checked<Partial<FundingEvent>> {
  const out: Partial<FundingEvent> = {};
  const optDate = (k: string, label: string): Checked<string | null> => {
    const v = body[k];
    if (v === null || v === undefined || v === "") return { ok: true, value: null };
    return isDate(v) ? { ok: true, value: v } : bad(`${label}은 YYYY-MM-DD 형식이어야 합니다.`);
  };
  if (!partial || "kind" in body) {
    if (!(FUNDING_KINDS as string[]).includes(body.kind as string)) return bad("종류는 SAFE · 지원금 · 상금 · 대출 중 하나입니다.");
    out.kind = body.kind as FundingKind;
  }
  if (!partial || "status" in body) {
    const st = body.status ?? "PLANNED";
    if (!(FUNDING_STATUSES as string[]).includes(st as string)) return bad("상태는 예정 · 확정 · 입금 중 하나입니다.");
    out.status = st as FundingStatus;
  }
  if (!partial || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return bad("이름을 입력하세요.");
    if (name.length > 60) return bad("이름은 60자 이하여야 합니다.");
    out.name = name;
  }
  if (!partial || "amount" in body) {
    const m = money(body.amount, true);
    if (!m.ok) return m;
    out.amount = m.value;
  }
  for (const [k, label] of [["expected_on", "예정일"], ["received_on", "입금일"], ["spend_deadline", "집행 마감"]] as const) {
    if (!partial || k in body) {
      const d = optDate(k, label);
      if (!d.ok) return d;
      out[k] = d.value;
    }
  }
  if (out.received_on && out.received_on > today) return bad("입금일은 오늘 이후가 될 수 없습니다.");
  if (!partial || "restricted" in body) out.restricted = Boolean(body.restricted);
  if (!partial || "restricted_left" in body) {
    const m = money(body.restricted_left, true);
    if (!m.ok) return bad(m.detail.replace("금액", "남은 전용 잔액"));
    out.restricted_left = m.value;
  }
  if ("memo" in body) {
    const m = memoOf(body.memo);
    if (!m.ok) return m;
    out.memo = m.value;
  }
  return { ok: true, value: out };
}

/** 합친 뒤에 보는 규칙 — 입금이면 금액 · 입금일 필수, 남은 전용 잔액은 금액을 넘지 않는다. */
export function checkFundingWhole(f: Partial<FundingEvent>): string | null {
  if (f.status === "RECEIVED" && f.amount == null) return "입금된 조달은 금액이 있어야 합니다.";
  if (f.status === "RECEIVED" && !f.received_on) return "입금된 조달은 입금일이 있어야 합니다.";
  if (f.restricted_left != null && f.amount != null && f.restricted_left > f.amount) return "남은 전용 잔액이 조달 금액보다 큽니다.";
  return null;
}
