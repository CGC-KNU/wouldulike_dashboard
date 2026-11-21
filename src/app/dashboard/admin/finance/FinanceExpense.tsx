"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { dueRows, dueTotals, paidStoreCount, periodOf, recentPeriods, resolveAmount, won } from "@/lib/finance/calc";
import { ACCOUNTS, ACCOUNT_LABEL, BEHAVIORS, BEHAVIOR_LABEL, CYCLE_LABEL, EXPENSE_CATEGORIES, METHOD_HINT, METHOD_LABEL, type ExpenseEntry, type ExpenseItem, type ExpenseMethod } from "@/lib/finance/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, Input, Kpi, Notice, PageHeader, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, periodLocal, rowClickable, todayLocal } from "../_shared/ui";
import { useFinance } from "./useFinance";

/**
 * 재무 · 출금 관리.
 *
 * 계좌가 연결돼 있지 않아 **나간 돈은 사람이 적는다.** 그래서 장부를 두 층으로 둔다.
 *   1) 반복 항목 — 「어떤 비용이 나가는가」. 처음부터 깔린 기본 항목 + 새로 추가한 항목. 금액을 모르면 비워 둔다(0원이 아니다).
 *      항목마다 행동 방식(고정 · 변동 · 준변동 · 일회성)과 회계 위치(COGS · S&M · R&D · G&A)를 매긴다 — 출금 한 건에서는 못 바꾼다.
 *   2) 출금 기록 — 「실제로 나간 돈」. 반복 항목의 그 달 지급이거나, 한 번 나간 비용.
 * 이번 달 예정은 1)에서 2)가 아직 없는 것으로 계산한다 — 기록하면 예정에서 빠진다.
 * 고친 사람은 서버가 찍는다. 잘못 적은 기록은 지울 수 있다.
 */

const monthLabel = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;

type EntryPanel = { entry: ExpenseEntry } | { item: ExpenseItem | null; period: string; due_on: string | null } | null;
type ItemPanel = { item: ExpenseItem } | { item: null } | null;

export default function FinanceExpense({ onGo }: { onGo?: (tab: string) => void }) {
  const f = useFinance();
  const thisPeriod = periodLocal();
  const [period, setPeriod] = useState(thisPeriod);
  const [entryPanel, setEntryPanel] = useState<EntryPanel>(null);
  const [itemPanel, setItemPanel] = useState<ItemPanel>(null);
  const today = todayLocal();

  const periods = useMemo(() => recentPeriods(thisPeriod, 12).reverse(), [thisPeriod]);
  const monthEntries = useMemo(() => f.entries.filter((e) => periodOf(e.paid_on) === period).sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1)), [f.entries, period]);
  const monthTotal = monthEntries.reduce((a, e) => a + e.amount, 0);
  const paidCount = paidStoreCount(f.paidStores, period);
  const due = useMemo(() => dueRows(f.items, f.entries, period, today, paidCount), [f.items, f.entries, period, today, paidCount]);
  const dueSum = useMemo(() => dueTotals(due), [due]);
  const noAmount = f.items.filter((i) => i.active && i.amount === null);

  return (
    <>
      <PageHeader
        title="출금 관리"
        description="계좌가 연결돼 있지 않아 나간 돈은 직접 적습니다. 반복 항목을 두고, 나갈 때마다 지급을 기록하세요."
        actions={<>{f.draft && <DraftBadge note="백엔드 재무 앱이 아직 없어 임시 저장소를 보고 있습니다. 재시작하면 기록이 사라지니 실제 기록은 백엔드가 올라간 뒤에 적으세요." />}<Button icon={<IconRefresh />} onClick={f.reload} disabled={f.loading}>다시 읽기</Button><Button icon={<IconPlus />} onClick={() => setItemPanel({ item: null })}>항목 추가</Button><Button variant="primary" icon={<IconPlus />} onClick={() => setEntryPanel({ item: null, period, due_on: null })}>출금 기록</Button></>}
      >
        <div className="w-44"><Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="월">{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</Select></div>
      </PageHeader>

      {f.expenseError && <div className="mb-4"><Notice tone="red" title="출금 장부를 읽지 못했습니다">{f.expenseError} 비어 있는 것이 아니라 못 읽은 것입니다.</Notice></div>}
      {!f.loading && !f.expenseError && f.paidStores === null && f.items.some((i) => i.active && i.method === "PER_PAID_STORE") && (
        <div className="mb-4"><Notice tone="amber" title="유료 식당 수를 읽지 못했습니다">「유료 식당 수 × 단가」 항목의 금액은 0원이 아니라 모름으로 보입니다. 파트너 매장 목록(백엔드)을 읽을 수 있을 때 다시 읽어 주세요.</Notice></div>
      )}
      {!f.loading && !f.expenseError && noAmount.length > 0 && (
        <div className="mb-4"><Notice tone="amber" title={`금액이 비어 있는 반복 항목 ${noAmount.length}건`}>{noAmount.map((i) => i.name).join(" · ")} — 금액을 모르면 예정 합계가 모자랍니다. 항목을 눌러 금액을 적으세요(모르면 비워 두세요, 0원으로 채우지 않습니다).</Notice></div>
      )}

      <div className="sat-stagger grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
        <Kpi label={`${Number(period.slice(5))}월 출금`} value={f.expenseError ? "-" : won(monthTotal)} hint={`${monthEntries.length}건 기록`} />
        <Kpi label="남은 예정" value={f.expenseError ? "-" : won(dueSum.amount)} hint={due.length === 0 ? "예정된 반복 항목 없음" : `${due.length}건${dueSum.unknown ? ` · 금액 미입력 ${dueSum.unknown}건` : ""}`} />
        <Kpi label="반복 항목" value={f.expenseError ? "-" : f.items.filter((i) => i.active).length} suffix="개" hint={`쉬는 항목 ${f.items.filter((i) => !i.active).length}개${f.items.some((i) => i.active && (!i.behavior || !i.account)) ? ` · 미분류 ${f.items.filter((i) => i.active && (!i.behavior || !i.account)).length}개` : ""}`} />
      </div>

      {f.loading && !f.items.length ? <Skeleton rows={6} cols={4} /> : (
        <>
          <Card className="mb-4" flush title={`${Number(period.slice(5))}월 예정`} description="반복 항목 중 이 달에 아직 기록이 없는 것. 냈다면 「지급 기록」을 누르세요.">
            {due.length === 0 ? <Empty title="이 달 예정된 반복 항목이 없습니다" detail="모두 기록됐거나 항목이 쉬는 중입니다." /> : (
              <Table minWidth="34rem">
                <thead><tr><Th>항목</Th><Th width="7rem">지급일</Th><Th width="9rem" align="right">금액</Th><Th width="8rem" align="right">처리</Th></tr></thead>
                <tbody>
                  {due.map((d) => (
                    <tr key={d.item.id}>
                      <Td><span className="font-semibold text-gray-900">{d.item.name}</span><span className="block text-[12px] text-gray-500">{d.item.category}</span></Td>
                      <Td className="text-[12px] text-gray-600 whitespace-nowrap">{d.due_on ? `${Number(d.due_on.slice(5, 7))}/${Number(d.due_on.slice(8))}` : "미정"}{d.overdue && <span className="ml-1.5"><Chip tone="red" dot>미기록</Chip></span>}</Td>
                      <Td align="right" numeric className="font-semibold text-gray-900">{d.amount === null ? <Chip tone="amber">{d.item.amount === null ? "금액 미입력" : "식당 수 못 읽음"}</Chip> : won(d.amount)}{d.item.method === "PER_PAID_STORE" && d.item.amount !== null && d.count !== null && <span className="block text-[11px] font-normal text-gray-500">{won(d.item.amount)} × 유료 {d.count}곳</span>}</Td>
                      <Td align="right"><Button size="sm" variant="primary" icon={<IconCheck />} onClick={() => setEntryPanel({ item: d.item, period, due_on: d.due_on })}>지급 기록</Button></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card className="mb-4" flush title={`${Number(period.slice(5))}월 출금 내역`} description="돈이 나간 날 기준. 행을 누르면 고치거나 지울 수 있습니다.">
            {monthEntries.length === 0 ? <Empty title="이 달 출금 기록이 없습니다" detail="나간 돈이 있으면 「출금 기록」으로 적으세요." /> : (
              <Table minWidth="38rem">
                <thead><tr><Th width="5rem">날짜</Th><Th>내용</Th><Th width="7rem">분류</Th><Th width="9rem" align="right">금액</Th><Th width="6rem">기록</Th></tr></thead>
                <tbody>
                  {monthEntries.map((e) => (
                    <tr key={e.id} className={rowClickable} onClick={() => setEntryPanel({ entry: e })}>
                      <Td className="text-[12px] text-gray-600 whitespace-nowrap">{e.paid_on.slice(5).replace("-", "/")}</Td>
                      <Td><span className="font-semibold text-gray-900">{e.name}</span>{e.memo && <span className="block text-[12px] text-gray-500 truncate max-w-[28ch]">{e.memo}</span>}</Td>
                      <Td><Chip tone={e.item_id ? "navy" : "gray"}>{e.category}</Chip></Td>
                      <Td align="right" numeric className="font-semibold text-gray-900">{won(e.amount)}</Td>
                      <Td className="text-[12px] text-gray-500">{e.created_by ?? "-"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card flush title="반복 항목" description="매달(또는 매년) 나가는 비용의 목록. 성격(고정 · 변동 · 준변동 · 일회성)과 회계 위치는 항목에만 매깁니다.">
            {f.items.length === 0 ? <Empty title="항목이 없습니다" /> : (
              <Table minWidth="54rem">
                <thead><tr><Th>항목</Th><Th width="7rem">분류</Th><Th width="8rem">성격</Th><Th width="8rem">주기</Th><Th width="11rem">출금 방식</Th><Th width="9rem" align="right">금액</Th></tr></thead>
                <tbody>
                  {f.items.map((i) => (
                    <tr key={i.id} className={`${rowClickable} ${i.active ? "" : "opacity-60"}`} onClick={() => setItemPanel({ item: i })}>
                      <Td><span className="font-semibold text-gray-900">{i.name}</span>{i.is_default && <span className="ml-1.5"><Chip tone="gray">기본</Chip></span>}{!i.active && <span className="ml-1.5"><Chip tone="amber">쉬는 중</Chip></span>}</Td>
                      <Td className="text-[12px] text-gray-600">{i.category}</Td>
                      <Td className="text-[12px] text-gray-600 whitespace-nowrap">{i.behavior || i.account ? `${i.behavior ? BEHAVIOR_LABEL[i.behavior] : "—"} · ${i.account ?? "—"}` : <Chip tone="amber">미분류</Chip>}</Td>
                      <Td className="text-[12px] text-gray-600 whitespace-nowrap">{CYCLE_LABEL[i.cycle]}{i.pay_day ? ` · ${i.pay_day}일` : ""}</Td>
                      <Td className="text-[12px] text-gray-600">{METHOD_LABEL[i.method ?? "FIXED"]}</Td>
                      <Td align="right" numeric className="font-semibold text-gray-900">{i.amount === null ? <Chip tone="amber">금액 미입력</Chip> : i.method === "PER_PAID_STORE" ? <>{paidCount === null ? <span className="text-[12px] font-normal text-gray-500">곳당 {won(i.amount)}</span> : won(i.amount * paidCount)}<span className="block text-[11px] font-normal text-gray-500">곳당 {won(i.amount)}{paidCount !== null && ` × ${paidCount}곳`}</span></> : won(i.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <p className="text-[12px] text-gray-500 mt-3">식사권 대금의 사용 장수는 <button type="button" className="text-navy font-medium hover:underline" onClick={() => onGo?.("probe-mileage")}>Probe › 마일리지 추첨</button>에서 확인합니다.</p>
        </>
      )}

      {entryPanel && <EntryForm key={"entry" in entryPanel ? entryPanel.entry.id : (entryPanel.item?.id ?? "new")} panel={entryPanel} today={today} paidCount={paidCount} f={f} onClose={() => setEntryPanel(null)} />}
      {itemPanel && <ItemForm key={itemPanel.item?.id ?? "new"} panel={itemPanel} paidCount={paidCount} period={period} f={f} onClose={() => setItemPanel(null)} />}
    </>
  );
}

const METHODS: ExpenseMethod[] = ["FIXED", "PER_PAID_STORE"];
const num = (v: string): number | null => { const n = Number(v.replace(/[,\s원]/g, "")); return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null; };

/** 출금 방식 드롭다운 — 항목 패널과 기록 패널이 같이 쓴다. */
function MethodSelect({ value, onChange }: { value: ExpenseMethod; onChange: (m: ExpenseMethod) => void }) {
  return (
    <Field label="출금 방식" hint={METHOD_HINT[value]}>
      <Select value={value} onChange={(e) => onChange(e.target.value as ExpenseMethod)}>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</Select>
    </Field>
  );
}

/** 출금 기록 패널 — 새로 적기(항목의 지급 포함) · 고치기 · 지우기. */
function EntryForm({ panel, today, paidCount, f, onClose }: { panel: NonNullable<EntryPanel>; today: string; paidCount: number | null; f: ReturnType<typeof useFinance>; onClose: () => void }) {
  const editing = "entry" in panel ? panel.entry : null;
  const item = "item" in panel ? panel.item : null;
  const dueOn = "due_on" in panel ? panel.due_on : null;
  // 지급일이 이미 지났으면 그날로, 아직이면(또는 모르면) 오늘로 — 나간 날은 오늘 이후가 될 수 없다
  const [paidOn, setPaidOn] = useState(editing?.paid_on ?? (dueOn && dueOn <= today ? dueOn : today));
  const [period, setPeriod] = useState(editing?.period ?? ("period" in panel ? panel.period : today.slice(0, 7)));
  const [name, setName] = useState(editing?.name ?? item?.name ?? "");
  const [category, setCategory] = useState<string>(editing?.category ?? item?.category ?? "기타");
  // 출금 방식 — 기록에는 계산된 금액만 남는다(방식은 이 패널에서 금액을 만드는 도구). 항목에서 왔으면 그 항목의 방식을 따른다.
  const [method, setMethod] = useState<ExpenseMethod>(item?.method ?? "FIXED");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : item && item.method === "FIXED" && item.amount != null ? String(item.amount) : "");
  const [unit, setUnit] = useState(item && item.method === "PER_PAID_STORE" && item.amount != null ? String(item.amount) : "");
  const [stores, setStores] = useState(paidCount !== null ? String(paidCount) : "");
  const [memo, setMemo] = useState(editing?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 귀속 월을 사람이 건드리기 전까지는 나간 달을 따라간다 — 대부분 같은 달이다
  const [periodTouched, setPeriodTouched] = useState(Boolean(editing) || Boolean(item));
  useEffect(() => { if (!periodTouched && /^\d{4}-\d{2}-\d{2}$/.test(paidOn)) setPeriod(paidOn.slice(0, 7)); }, [paidOn, periodTouched]);

  const perStore = !editing && method === "PER_PAID_STORE";
  const u = num(unit), n = num(stores);
  const computed = u !== null && n !== null ? u * n : null;

  async function save() {
    setBusy(true); setError(null);
    if (perStore && computed === null) { setBusy(false); setError("단가와 유료 식당 수를 숫자로 적으세요."); return; }
    // 곱해서 만든 금액은 기록에 그대로 박힌다 — 나중에 유료 식당이 늘고 줄어도 이 기록은 변하지 않는다. 어떻게 나온 금액인지는 메모에 남긴다.
    const note = perStore && !memo.trim() ? `유료 식당 ${n}곳 × ${won(u ?? 0)}` : memo;
    const body = { paid_on: paidOn, period, name, category, amount: perStore ? computed ?? 0 : amount, memo: note, item_id: editing ? editing.item_id : (item?.id ?? null) };
    const err = editing ? await f.patchEntry(editing.id, body) : await f.addEntry(body);
    setBusy(false);
    if (err) setError(err); else onClose();
  }
  async function remove() {
    if (!editing || !window.confirm(`「${editing.name}」 ${won(editing.amount)} 기록을 지울까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true); setError(null);
    const err = await f.deleteEntry(editing.id);
    setBusy(false);
    if (err) setError(err); else onClose();
  }

  return (
    <SlideOver open onClose={onClose} title={editing ? "출금 기록 고치기" : item ? `${item.name} 지급 기록` : "출금 기록"} subtitle={editing ? `${editing.created_by ?? ""} 기록` : item ? "반복 항목의 지급을 기록합니다" : "한 번 나간 비용이나 항목에 없는 지출을 적습니다"}
      footer={<><Button variant="primary" icon={<IconCheck />} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>{editing && <Button variant="danger" icon={<IconTrash />} onClick={remove} disabled={busy}>지우기</Button>}<Button variant="ghost" onClick={onClose}>닫기</Button></>}>
      {error && <Notice tone="red" title={error} />}
      <Field label="내용" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="예: 11월 식사권 대금" /></Field>
      {!editing && <MethodSelect value={method} onChange={setMethod} />}
      {perStore ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="식당 1곳당 단가(원)" required><Input inputMode="numeric" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="예: 3000" /></Field>
            <Field label="유료 식당 수(곳)" required hint={paidCount === null ? "유료 식당 수를 읽지 못해 직접 적어야 합니다." : `${period.slice(5)}월 기준 현재 ${paidCount}곳. 다르면 고치세요.`}><Input inputMode="numeric" value={stores} onChange={(e) => setStores(e.target.value)} /></Field>
          </div>
          <div className="rounded-xl bg-navy/[0.04] px-3.5 py-3 text-[13px] text-gray-700" aria-live="polite">나갈 돈 <b className="text-gray-900 tabular-nums text-[15px]">{computed === null ? "-" : won(computed)}</b>{computed !== null && <span className="text-gray-500"> = {won(u ?? 0)} × {n}곳</span>}</div>
        </>
      ) : (
        <Field label="금액(원)" required hint={item && item.method === "FIXED" && item.amount === null ? "이 항목은 금액이 비어 있습니다. 여기서 적은 금액은 이 기록에만 들어갑니다." : undefined}><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 150000" /></Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="나간 날" required hint="오늘 이후는 적을 수 없습니다."><Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="어느 달 몫" hint="나간 달과 다르면 바꾸세요."><Input type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setPeriodTouched(true); }} /></Field>
      </div>
      <Field label="분류"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      <Field label="메모"><Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={300} placeholder={perStore ? "비워 두면 「유료 식당 N곳 × 단가」가 남습니다" : "청구서 번호, 계좌이체 메모 등"} /></Field>
      {!editing && !item && <p className="text-[12px] text-gray-500">항목 없이 적은 출금은 성격을 몰라 운영 번에도 들어갑니다. 일회성으로 빼려면 행동 방식이 「일회성」인 항목에서 기록하세요.</p>}
    </SlideOver>
  );
}

/** 반복 항목 패널 — 추가 · 고치기 · 쉬게 하기 · (직접 추가한 것만) 지우기. */
function ItemForm({ panel, paidCount, period, f, onClose }: { panel: NonNullable<ItemPanel>; paidCount: number | null; period: string; f: ReturnType<typeof useFinance>; onClose: () => void }) {
  const it = panel.item;
  const [name, setName] = useState(it?.name ?? "");
  const [category, setCategory] = useState<string>(it?.category ?? "기타");
  const [method, setMethod] = useState<ExpenseMethod>(it?.method ?? "FIXED");
  const [amount, setAmount] = useState(it?.amount != null ? String(it.amount) : "");
  const [cycle, setCycle] = useState<string>(it?.cycle ?? "MONTHLY");
  const [payDay, setPayDay] = useState(it?.pay_day ? String(it.pay_day) : "");
  const [start, setStart] = useState(it?.start_period ?? periodLocal());
  const [end, setEnd] = useState(it?.end_period ?? "");
  const [memo, setMemo] = useState(it?.memo ?? "");
  const [active, setActive] = useState(it?.active ?? true);
  const [behavior, setBehavior] = useState<string>(it?.behavior ?? "");
  const [account, setAccount] = useState<string>(it?.account ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perStore = method === "PER_PAID_STORE";
  const preview = resolveAmount({ method, amount: num(amount) }, paidCount);

  async function save() {
    setBusy(true); setError(null);
    const body = { name, category, method, amount: amount.trim() === "" ? null : amount, cycle, pay_day: payDay.trim() === "" ? null : payDay, start_period: start, end_period: end || null, behavior: behavior || null, account: account || null, memo, active };
    const err = it ? await f.patchItem(it.id, body) : await f.addItem(body);
    setBusy(false);
    if (err) setError(err); else onClose();
  }
  async function remove() {
    if (!it || !window.confirm(`「${it.name}」 항목을 지울까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true); setError(null);
    const err = await f.deleteItem(it.id);
    setBusy(false);
    if (err) setError(err); else onClose();
  }

  return (
    <SlideOver open onClose={onClose} title={it ? "반복 항목" : "항목 추가"} subtitle={it?.is_default ? "기본 항목" : "새로 나가는 비용을 목록에 올립니다"}
      footer={<><Button variant="primary" icon={<IconCheck />} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>{it && !it.is_default && <Button variant="danger" icon={<IconTrash />} onClick={remove} disabled={busy}>지우기</Button>}<Button variant="ghost" onClick={onClose}>닫기</Button></>}>
      {error && <Notice tone="red" title={error} />}
      <Field label="항목 이름" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="예: 디자인 툴 구독" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="분류"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="주기"><Select value={cycle} onChange={(e) => setCycle(e.target.value)}><option value="MONTHLY">매월</option><option value="YEARLY">매년</option></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="행동 방식" hint="매출이 0이면 이 비용도 0인가? 두 배면 두 배인가?"><Select value={behavior} onChange={(e) => setBehavior(e.target.value)}><option value="">미분류</option>{BEHAVIORS.map((b) => <option key={b} value={b}>{BEHAVIOR_LABEL[b]}</option>)}</Select></Field>
        <Field label="회계 위치" hint="안 쓰면 점주가 서비스를 못 받는가? 그러면 COGS"><Select value={account} onChange={(e) => setAccount(e.target.value)}><option value="">미분류</option>{ACCOUNTS.map((a) => <option key={a} value={a}>{ACCOUNT_LABEL[a]}</option>)}</Select></Field>
      </div>
      <MethodSelect value={method} onChange={setMethod} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={perStore ? "식당 1곳당 단가(원)" : "금액(원)"} hint="모르면 비워 두세요. 0원이 아니라 「미입력」으로 보입니다."><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={perStore ? "예: 3000" : "예: 150000"} /></Field>
        <Field label="지급일(일)" hint="1~31, 모르면 비움"><Input inputMode="numeric" value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder="예: 10" /></Field>
      </div>
      {perStore && (
        <div className="rounded-xl bg-navy/[0.04] px-3.5 py-3 text-[13px] text-gray-700" aria-live="polite">
          {paidCount === null ? "유료 식당 수를 읽지 못해 나갈 돈을 계산할 수 없습니다." : <>{Number(period.slice(5))}월 유료 식당 <b className="text-gray-900">{paidCount}곳</b>{preview !== null && <> → 나갈 돈 <b className="text-gray-900 tabular-nums text-[15px]">{won(preview)}</b></>}</>}
          <span className="block text-[12px] text-gray-500 mt-1">유료 식당은 입금 현황과 같은 기준입니다(제휴 중 · Boost/Premium · 테스트 매장 제외). 달마다 수가 바뀌면 나갈 돈도 따라 바뀝니다.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작 월" required><Input type="month" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="종료 월" hint="비우면 계속"><Input type="month" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="메모"><Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={300} /></Field>
      <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer"><input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} className="w-4 h-4 accent-[#050072]" />이 항목은 쉬는 중 (예정에 올리지 않음)</label>
      {it?.is_default && <p className="text-[12px] text-gray-500">기본 항목은 지우지 않고 쉬게만 합니다 — 지우면 다음에 열 때 다시 깔립니다.</p>}
    </SlideOver>
  );
}
