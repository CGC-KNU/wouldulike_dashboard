"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountBalance, BillingLine, ExpenseEntry, ExpenseItem, FundingEvent, IncomeEntry, MetricsInputs, PaidStore } from "@/lib/finance/types";

/**
 * 재무 세 화면(현황 · 입금 · 출금)이 같이 쓰는 데이터 훅.
 * 같은 데이터를 한 곳에서 읽어 세 화면이 다른 숫자를 말하지 않게 하고, 쓰기는 한 번 하고 다시 읽는다.
 * 쓰기 함수는 실패하면 **이유 문장**을, 성공하면 null 을 돌려준다 — 화면이 그대로 보여 준다.
 */

export interface EntryInput {
  paid_on: string;
  period?: string;
  name: string;
  category: string;
  amount: number | string;
  memo?: string;
  item_id?: string | null;
  tax?: number | string | null;
  tag?: string | null;
  store_id?: number | null;
  campus?: string | null;
}

export interface ItemInput {
  name?: string;
  category?: string;
  method?: string;
  amount?: number | string | null;
  cycle?: string;
  pay_day?: number | string | null;
  start_period?: string;
  end_period?: string | null;
  behavior?: string | null;
  account?: string | null;
  active?: boolean;
  memo?: string;
}

export interface BalanceInput {
  account_name?: string;
  last4?: string | null;
  amount?: number | string;
  as_of?: string;
  reconciled?: boolean;
  memo?: string;
}

export interface FundingInput {
  kind?: string;
  status?: string;
  name?: string;
  amount?: number | string | null;
  expected_on?: string | null;
  received_on?: string | null;
  restricted?: boolean;
  restricted_left?: number | string | null;
  spend_deadline?: string | null;
  memo?: string;
}

async function detailOf(res: Response, fallback: string): Promise<string> {
  const d = (await res.json().catch(() => null)) as { detail?: string } | null;
  return d?.detail ?? fallback;
}

export function useFinance() {
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [billing, setBilling] = useState<BillingLine[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [fundings, setFundings] = useState<FundingEvent[]>([]);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  /** 유료 식당 — 「유료 식당 수 × 단가」의 곱할 수. null 은 못 읽음(0곳이 아니다). */
  const [paidStores, setPaidStores] = useState<PaidStore[] | null>(null);
  const [draft, setDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  /** 못 읽은 것과 비어 있는 것을 가른다 — 못 읽었으면 0 이 아니라 모름이다. */
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  /** 월말 잔고 · 자금 조달 — 못 읽으면 가용 현금 · 런웨이는 모름이다. */
  const [cashError, setCashError] = useState<string | null>(null);
  /** 지표 입력(1122) — 영업 시간 · 해지 · 플랜 변경 · 계획값 · 시장 · 목표 · 후보 · 허블. 못 읽으면 null(지표는 「—」). */
  const [metrics, setMetrics] = useState<MetricsInputs | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [i, e, b, fu, mx] = await Promise.all([
      fetch("/api/finance/income", { cache: "no-store" }).catch(() => null),
      fetch("/api/finance/expenses", { cache: "no-store" }).catch(() => null),
      fetch("/api/finance/balances", { cache: "no-store" }).catch(() => null),
      fetch("/api/finance/fundings", { cache: "no-store" }).catch(() => null),
      fetch("/api/finance/metrics", { cache: "no-store" }).catch(() => null),
    ]);
    setMetrics(mx?.ok ? ((await mx.json().catch(() => null)) as MetricsInputs | null) : null);
    let isDraft = false;

    if (i?.ok) {
      const d = (await i.json().catch(() => ({}))) as { income?: IncomeEntry[]; billing?: BillingLine[]; draft?: boolean };
      setIncome(d.income ?? []);
      setBilling(d.billing ?? []);
      setIncomeError(null);
      isDraft = isDraft || Boolean(d.draft);
    } else {
      setIncomeError(i ? await detailOf(i, "입금 내역을 읽지 못했습니다.") : "입금 내역을 읽지 못했습니다.");
    }

    if (e?.ok) {
      const d = (await e.json().catch(() => ({}))) as { items?: ExpenseItem[]; entries?: ExpenseEntry[]; paid_stores?: PaidStore[] | null; draft?: boolean };
      setItems(d.items ?? []);
      setEntries(d.entries ?? []);
      setPaidStores(d.paid_stores ?? null);
      setExpenseError(null);
      isDraft = isDraft || Boolean(d.draft);
    } else {
      setExpenseError(e ? await detailOf(e, "출금 장부를 읽지 못했습니다.") : "출금 장부를 읽지 못했습니다.");
    }

    if (b?.ok && fu?.ok) {
      const db = (await b.json().catch(() => ({}))) as { balances?: AccountBalance[]; draft?: boolean };
      const df = (await fu.json().catch(() => ({}))) as { fundings?: FundingEvent[]; draft?: boolean };
      setBalances(db.balances ?? []);
      setFundings(df.fundings ?? []);
      setCashError(null);
      isDraft = isDraft || Boolean(db.draft) || Boolean(df.draft);
    } else {
      const bad = b && !b.ok ? b : fu && !fu.ok ? fu : null;
      setCashError(bad ? await detailOf(bad, "월말 잔고 · 자금 조달을 읽지 못했습니다.") : "월말 잔고 · 자금 조달을 읽지 못했습니다.");
    }

    setDraft(isDraft);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = useCallback(
    async (method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body: unknown, fallback: string): Promise<string | null> => {
      try {
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res.ok) return await detailOf(res, fallback);
      } catch {
        return "네트워크 오류로 저장하지 못했습니다. 다시 시도해 주세요.";
      }
      await load();
      return null;
    },
    [load],
  );

  return {
    income, billing, items, entries, balances, fundings, paidStores, metrics, draft, loading, incomeError, expenseError, cashError, reload: load,
    saveSettings: (b: { hour_rate: number | string }) => write("PUT", "/api/finance/settings", b, "저장하지 못했습니다."),
    addEntry: (b: EntryInput) => write("POST", "/api/finance/expenses", b, "기록하지 못했습니다."),
    patchEntry: (id: string, b: Partial<EntryInput>) => write("PATCH", `/api/finance/expenses/${encodeURIComponent(id)}`, b, "저장하지 못했습니다."),
    deleteEntry: (id: string) => write("DELETE", `/api/finance/expenses/${encodeURIComponent(id)}`, undefined, "지우지 못했습니다."),
    addItem: (b: ItemInput) => write("POST", "/api/finance/items", b, "추가하지 못했습니다."),
    patchItem: (id: string, b: ItemInput) => write("PATCH", `/api/finance/items/${encodeURIComponent(id)}`, b, "저장하지 못했습니다."),
    deleteItem: (id: string) => write("DELETE", `/api/finance/items/${encodeURIComponent(id)}`, undefined, "지우지 못했습니다."),
    addBalance: (b: BalanceInput) => write("POST", "/api/finance/balances", b, "저장하지 못했습니다."),
    patchBalance: (id: string, b: BalanceInput) => write("PATCH", `/api/finance/balances/${encodeURIComponent(id)}`, b, "저장하지 못했습니다."),
    deleteBalance: (id: string) => write("DELETE", `/api/finance/balances/${encodeURIComponent(id)}`, undefined, "지우지 못했습니다."),
    addFunding: (b: FundingInput) => write("POST", "/api/finance/fundings", b, "저장하지 못했습니다."),
    patchFunding: (id: string, b: FundingInput) => write("PATCH", `/api/finance/fundings/${encodeURIComponent(id)}`, b, "저장하지 못했습니다."),
    deleteFunding: (id: string) => write("DELETE", `/api/finance/fundings/${encodeURIComponent(id)}`, undefined, "지우지 못했습니다."),
  };
}

export type FinanceData = ReturnType<typeof useFinance>;
