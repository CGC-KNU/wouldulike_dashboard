"use client";

import { useState } from "react";
import { IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { won, type BalanceSnapshot, type ReconcileState } from "@/lib/finance/calc";
import { FUNDING_KINDS, FUNDING_KIND_LABEL, FUNDING_STATUSES, FUNDING_STATUS_LABEL, type AccountBalance, type FundingEvent, type FundingKind, type FundingStatus } from "@/lib/finance/types";
import { Button, Card, Chip, Field, Input, Notice, Select, SlideOver, Textarea, rowClickable, todayLocal, type ChipTone } from "../_shared/ui";
import type { FinanceData } from "./useFinance";

/**
 * 재무 현황 아래의 입력 패널 둘 — 월말 잔고(대사) · 자금 조달.
 * 런웨이 카드가 쓰는 재료가 이 둘이라 같은 화면에 둔다. 카드가 「—」이면 여기서 채우면 된다.
 */

const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${won(Math.abs(n))}`;

/* ═══════════ 월말 잔고 · 대사 ═══════════ */

export function BalanceCard({ f, snap, rec }: { f: FinanceData; snap: BalanceSnapshot | null; rec: ReconcileState | null }) {
  const [panel, setPanel] = useState<{ row: AccountBalance | null } | null>(null);
  const accounts = [...new Set(f.balances.map((b) => b.account_name))];

  return (
    <Card flush title={snap ? `월말 잔고 · ${Number(snap.period.slice(5))}월` : "월말 잔고"} description="계좌별 월말 잔고 · 장부와 1만 원 넘게 다르면 대사 필요" actions={<Button size="sm" icon={<IconPlus />} onClick={() => setPanel({ row: null })}>잔고 입력</Button>}>
      {!snap ? (
        <p className="px-4 py-4 text-[13px] text-gray-500">아직 없습니다. 달마다 마지막 날 통장 잔고를 계좌별로 적으면 가용 현금 · 런웨이가 계산됩니다.</p>
      ) : (
        <>
          <ul>
            {snap.rows.map((b) => (
              <li key={b.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.05] ${rowClickable}`} onClick={() => setPanel({ row: b })}>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{b.account_name}{b.last4 && <span className="ml-1 font-normal text-gray-500">··{b.last4}</span>}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{short(b.as_of)} 기준{b.reconciled ? ` · 대사 ${b.reconciled_by ?? ""}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {b.reconciled ? <Chip tone="green">대사 완료</Chip> : <Chip tone="gray">대사 전</Chip>}
                  <span className="text-[13px] font-semibold tabular-nums text-gray-900">{won(b.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 text-[12px] text-gray-600 flex flex-wrap items-center justify-between gap-2">
            <span>합계 <b className="text-gray-900 tabular-nums">{won(snap.total)}</b></span>
            {rec?.state === "none" && <span className="text-gray-500">{rec.reason}</span>}
            {rec && rec.state !== "none" && (
              <span className="flex items-center gap-2">장부 계산 <span className="tabular-nums">{won(rec.ledger)}</span> · 차이 <span className="tabular-nums">{signed(rec.diff)}</span>{rec.state === "need" ? <Chip tone="red" dot>대사 필요</Chip> : <Chip tone="green">맞음</Chip>}</span>
            )}
          </div>
        </>
      )}
      {panel && <BalanceForm key={panel.row?.id ?? "new"} row={panel.row} accounts={accounts} f={f} onClose={() => setPanel(null)} />}
    </Card>
  );
}

/** 지난달 말일 — 월말 잔고는 보통 지난달 것을 적는다. */
function lastMonthEnd(): string {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth(), 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function BalanceForm({ row, accounts, f, onClose }: { row: AccountBalance | null; accounts: string[]; f: FinanceData; onClose: () => void }) {
  const today = todayLocal();
  const [name, setName] = useState(row?.account_name ?? "");
  const [last4, setLast4] = useState(row?.last4 ?? "");
  const [amount, setAmount] = useState(row ? String(row.amount) : "");
  const [asOf, setAsOf] = useState(row?.as_of ?? lastMonthEnd());
  const [reconciled, setReconciled] = useState(row?.reconciled ?? false);
  const [memo, setMemo] = useState(row?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    const body = { account_name: name, last4: last4.trim() || null, amount, as_of: asOf, reconciled, memo };
    const err = row ? await f.patchBalance(row.id, body) : await f.addBalance(body);
    setBusy(false);
    if (err) setError(err); else onClose();
  }
  async function remove() {
    if (!row || !window.confirm(`「${row.account_name}」 ${row.as_of} 잔고를 지울까요?`)) return;
    setBusy(true); setError(null);
    const err = await f.deleteBalance(row.id);
    setBusy(false);
    if (err) setError(err); else onClose();
  }

  return (
    <SlideOver open onClose={onClose} title={row ? "월말 잔고 고치기" : "월말 잔고 입력"} subtitle="통장 앱에 보이는 잔고를 그대로 적습니다"
      footer={<><Button variant="primary" icon={<IconCheck />} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>{row && <Button variant="danger" icon={<IconTrash />} onClick={remove} disabled={busy}>지우기</Button>}<Button variant="ghost" onClick={onClose}>닫기</Button></>}>
      {error && <Notice tone="red" title={error} />}
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="계좌 이름" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} list="finance-accounts" placeholder="예: 운영 계좌" /></Field>
        <Field label="끝 4자리"><Input inputMode="numeric" value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} /></Field>
      </div>
      <datalist id="finance-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
      <div className="grid grid-cols-2 gap-3">
        <Field label="잔고(원)" required hint="빈 통장이면 0"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="기준일" required hint="보통 그 달 마지막 날"><Input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer"><input type="checkbox" checked={reconciled} onChange={(e) => setReconciled(e.target.checked)} className="w-4 h-4 accent-[#050072]" />통장 거래와 장부를 맞춰 봤음 (대사 완료 — 이름이 남습니다)</label>
      <Field label="메모"><Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} maxLength={300} /></Field>
    </SlideOver>
  );
}

/* ═══════════ 자금 조달 ═══════════ */

const STATUS_TONE: Record<FundingStatus, ChipTone> = { PLANNED: "gray", CONFIRMED: "blue", RECEIVED: "green" };

export function FundingCard({ f }: { f: FinanceData }) {
  const [panel, setPanel] = useState<{ row: FundingEvent | null } | null>(null);
  const rows = [...f.fundings].sort((a, b) => (a.received_on ?? a.expected_on ?? "9999").localeCompare(b.received_on ?? b.expected_on ?? "9999"));

  return (
    <Card flush title="자금 조달" description="SAFE · 지원금 · 상금 · 대출 · 「입금」만 잔고에 넣음" actions={<Button size="sm" icon={<IconPlus />} onClick={() => setPanel({ row: null })}>조달 추가</Button>}>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-gray-500">아직 없습니다. 기다리는 SAFE · 지원금이 있으면 「예정」으로 올려 두고, 입금되면 상태를 바꿉니다.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.05] last:border-0 ${rowClickable}`} onClick={() => setPanel({ row: r })}>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{r.name} <span className="font-normal text-gray-500">{FUNDING_KIND_LABEL[r.kind]}</span></p>
                <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                  {r.status === "RECEIVED" ? (r.received_on ? `${short(r.received_on)} 입금` : "입금일 미정") : r.expected_on ? `${r.expected_on.slice(2).replace(/-/g, ".")} 예정` : "예정일 미정"}
                  {r.restricted && ` · 전용${r.restricted_left !== null ? ` 남은 ${won(r.restricted_left)}` : ""}${r.spend_deadline ? ` · 집행 마감 ${r.spend_deadline.slice(2).replace(/-/g, ".")}` : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Chip tone={STATUS_TONE[r.status]}>{FUNDING_STATUS_LABEL[r.status]}</Chip>
                {r.amount === null ? <Chip tone="amber">금액 미정</Chip> : <span className="text-[13px] font-semibold tabular-nums text-gray-900">{won(r.amount)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {panel && <FundingForm key={panel.row?.id ?? "new"} row={panel.row} f={f} onClose={() => setPanel(null)} />}
    </Card>
  );
}

function FundingForm({ row, f, onClose }: { row: FundingEvent | null; f: FinanceData; onClose: () => void }) {
  const today = todayLocal();
  const [kind, setKind] = useState<FundingKind>(row?.kind ?? "SAFE");
  const [status, setStatus] = useState<FundingStatus>(row?.status ?? "PLANNED");
  const [name, setName] = useState(row?.name ?? "");
  const [amount, setAmount] = useState(row?.amount != null ? String(row.amount) : "");
  const [expected, setExpected] = useState(row?.expected_on ?? "");
  const [received, setReceived] = useState(row?.received_on ?? "");
  const [restricted, setRestricted] = useState(row?.restricted ?? false);
  const [left, setLeft] = useState(row?.restricted_left != null ? String(row.restricted_left) : "");
  const [deadline, setDeadline] = useState(row?.spend_deadline ?? "");
  const [memo, setMemo] = useState(row?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새로 적을 때 지원금을 고르면 「전용」을 켠다 — 지원금은 대개 쓸 곳이 정해진 돈이다. 아니면 끄면 된다.
  function pickKind(k: FundingKind) {
    setKind(k);
    if (!row) setRestricted(k === "GRANT");
  }

  async function save() {
    setBusy(true); setError(null);
    const body = {
      kind, status, name, amount: amount.trim() === "" ? null : amount, expected_on: expected || null,
      received_on: status === "RECEIVED" ? received || null : null,
      restricted, restricted_left: restricted && left.trim() !== "" ? left : null, spend_deadline: restricted ? deadline || null : null, memo,
    };
    const err = row ? await f.patchFunding(row.id, body) : await f.addFunding(body);
    setBusy(false);
    if (err) setError(err); else onClose();
  }
  async function remove() {
    if (!row || !window.confirm(`「${row.name}」을 목록에서 뺄까요? 원장에는 취소로 남습니다.`)) return;
    setBusy(true); setError(null);
    const err = await f.deleteFunding(row.id);
    setBusy(false);
    if (err) setError(err); else onClose();
  }

  return (
    <SlideOver open onClose={onClose} title={row ? "자금 조달" : "조달 추가"} subtitle="영업으로 번 돈이 아니라 순번에는 넣지 않습니다"
      footer={<><Button variant="primary" icon={<IconCheck />} onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>{row && <Button variant="danger" icon={<IconTrash />} onClick={remove} disabled={busy}>취소로 빼기</Button>}<Button variant="ghost" onClick={onClose}>닫기</Button></>}>
      {error && <Notice tone="red" title={error} />}
      <Field label="이름" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="예: 예비창업패키지 1단계" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="종류"><Select value={kind} onChange={(e) => pickKind(e.target.value as FundingKind)}>{FUNDING_KINDS.map((k) => <option key={k} value={k}>{FUNDING_KIND_LABEL[k]}</option>)}</Select></Field>
        <Field label="상태" hint="입금만 잔고에 들어간 돈으로 봅니다"><Select value={status} onChange={(e) => setStatus(e.target.value as FundingStatus)}>{FUNDING_STATUSES.map((s) => <option key={s} value={s}>{FUNDING_STATUS_LABEL[s]}</option>)}</Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="금액(원)" required={status === "RECEIVED"} hint="모르면 비워 두세요"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {status === "RECEIVED"
          ? <Field label="입금일" required><Input type="date" value={received} max={today} onChange={(e) => setReceived(e.target.value)} /></Field>
          : <Field label="예정일"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>}
      </div>
      <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer"><input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="w-4 h-4 accent-[#050072]" />쓸 곳이 정해진 돈 (지원금 전용 — 가용 현금에서 뺍니다)</label>
      {restricted && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="남은 전용 잔액(원)" hint="비우면 금액 전체를 묶인 돈으로 봅니다"><Input inputMode="numeric" value={left} onChange={(e) => setLeft(e.target.value)} /></Field>
          <Field label="집행 마감"><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        </div>
      )}
      <Field label="메모"><Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} maxLength={300} /></Field>
    </SlideOver>
  );
}
