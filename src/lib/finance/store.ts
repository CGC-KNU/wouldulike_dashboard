import { readDraft, writeDraft } from "../draft/store";
import { DEFAULT_ITEMS } from "./defaults";
import type { ExpenseEntry, ExpenseItem } from "./types";

/**
 * 재무 초안 저장소 — **백엔드(finance 앱)가 아직 없는 동안만** 쓴다.
 * 원본은 백엔드 DB 다(remote.ts 의 규칙과 같다). 이 파일은 로컬·미리보기에서 화면이 멈추지 않게 하는 임시 자리고,
 * 배포 환경에서는 재시작하면 사라진다 — 응답에 `draft: true` 를 붙여 화면이 「초안 데이터」라고 말하게 한다.
 */

export const ITEMS_KEY = "finance_items";
export const ENTRIES_KEY = "finance_entries";

export const currentPeriodKst = (now: number = Date.now()): string => new Date(now + 9 * 3600_000).toISOString().slice(0, 7);

/** 기본 항목을 항목 모양으로 — 금액은 비어 있다. */
export function defaultItem(d: (typeof DEFAULT_ITEMS)[number], id: string, period: string): ExpenseItem {
  return { id, key: d.key, name: d.name, category: d.category, amount: null, cycle: d.cycle, pay_day: d.pay_day, start_period: period, end_period: null, active: true, is_default: true, memo: d.memo, updated_by: null, updated_at: null };
}

const seedItems = (): ExpenseItem[] => DEFAULT_ITEMS.map((d, i) => defaultItem(d, `default-${i + 1}`, currentPeriodKst()));

export const readItems = (): ExpenseItem[] => {
  const list = readDraft<ExpenseItem[]>(ITEMS_KEY, seedItems);
  // 코드에 기본 항목이 새로 늘었으면 초안에도 깐다
  const have = new Set(list.map((i) => i.key).filter(Boolean));
  const missing = DEFAULT_ITEMS.filter((d) => !have.has(d.key));
  if (!missing.length) return list;
  return writeDraft(ITEMS_KEY, [...list, ...missing.map((d) => defaultItem(d, `default-${d.key}`, currentPeriodKst()))]);
};
export const writeItems = (v: ExpenseItem[]) => writeDraft(ITEMS_KEY, v);
export const readEntries = () => readDraft<ExpenseEntry[]>(ENTRIES_KEY, () => []);
export const writeEntries = (v: ExpenseEntry[]) => writeDraft(ENTRIES_KEY, v);

export const newId = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
