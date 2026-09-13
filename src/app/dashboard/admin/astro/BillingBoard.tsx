"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconCopy, IconFileInvoice, IconMessage2, IconPlus } from "@tabler/icons-react";
import { TAX_STATUS_LABEL, isPaidTier, type StoreRow, type TaxInvoice } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Notice, PageHeader, Select, Skeleton, StepTiles, Table, Td, Th, focusRing, rowClickable, periodLocal, type ChipTone } from "../_shared/ui";
import MessageComposer from "./MessageComposer";
import type { MsgContext } from "@/lib/draft/message";

/**
 * Astro · 입금 현황 — **월별** 장부.
 *
 * 0911 정리(민열님): 매달 받으니 월별로 정리. 매장에 하나 붙은 '입금 상태'로는 9월 받았는지 10월 받았는지 모른다.
 * 그래서 이 화면의 행은 **매장 × 월**이고, 그 실체는 세금계산서 건(TaxInvoice)이다 — 청구(품의) → 발행 → 입금이
 * 한 줄에서 흐른다. 월 이용료가 있는 유료·월납 매장인데 그 달 청구가 없으면 "청구 안 됨"으로 먼저 보인다.
 *
 * 매장 현황의 '이번 달 입금' 열도 같은 데이터를 본다. 두 화면이 다른 숫자를 말하지 않는다.
 */

const won = (n: number) => `${n.toLocaleString()}원`;
const thisPeriod = () => periodLocal();
const label = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;

type Row = { store: StoreRow; inv: TaxInvoice | null; bucket: "none" | "pending" | "issued" | "paid" | "skip" };

export default function BillingBoard({ actor, onGo }: { actor: string; onGo?: (tab: string) => void }) {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [storeSource, setStoreSource] = useState<string | null>(null);
  const [period, setPeriod] = useState(thisPeriod());
  const [bucket, setBucket] = useState<Row["bucket"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 문자 팔로업 — 청구·미납·입금 감사 (민열님 0911)
  const [sms, setSms] = useState<{ ctx: MsgContext; overdue: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetch("/api/astro/stores").then((r) => r.json()).catch(() => ({})), fetch("/api/astro/invoices").then((r) => r.json()).catch(() => ({}))])
      .then(([s, i]) => { setStores(s.stores ?? []); setStoreSource(s.restaurants_source ?? null); setDraft({ on: Boolean(s.draft), note: s.draft_note }); setInvoices(i.invoices ?? []); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const paid = useMemo(() => stores.filter((s) => s.is_affiliate && isPaidTier(s.tier) && !s.ops?.is_test), [stores]);
  /**
   * 행은 **유료 매장 ∪ 이 달 청구 건** 이다 (민열님 0913: "입금 현황에 식당이 비어 있다").
   * 매장 목록을 못 읽으면 예전에는 표가 통째로 비었다 — 청구 건은 있는데 이름을 붙일 매장이 없어서였다.
   * 이제 청구 건에 적힌 이름으로 행을 세우고, 매장 목록에서 못 찾았다고 화면이 말한다.
   */
  const rows: Row[] = useMemo(() => {
    const byId = new Map(paid.map((s) => [s.restaurant_id, s]));
    const base: Row[] = paid.map((store) => {
      const inv = invoices.find((i) => i.restaurant_id === store.restaurant_id && i.period === period && !["CANCELED", "REJECTED"].includes(i.status)) ?? null;
      const fee = store.ops?.monthly_fee ?? null;
      const bucket: Row["bucket"] = !fee || store.ops?.pay_cycle === "LUMP" ? "skip" : !inv ? "none" : inv.paid_at ? "paid" : inv.status === "ISSUED" ? "issued" : "pending";
      return { store, inv, bucket };
    });
    // 매장 목록에 없는 청구 건 — 이름은 청구 건이 들고 있다
    const orphans: Row[] = invoices
      .filter((i) => i.period === period && !["CANCELED", "REJECTED"].includes(i.status) && !byId.has(i.restaurant_id))
      .map((inv) => ({
        store: { restaurant_id: inv.restaurant_id, name: inv.name, tier: null, is_affiliate: true, ops: null, missing: true } as StoreRow & { missing?: boolean },
        inv,
        bucket: (inv.paid_at ? "paid" : inv.status === "ISSUED" ? "issued" : "pending") as Row["bucket"],
      }));
    const ORDER: Row["bucket"][] = ["none", "pending", "issued", "paid", "skip"];
    return [...base, ...orphans].sort((a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket) || a.store.name.localeCompare(b.store.name, "ko"));
  }, [paid, invoices, period]);
  const counts = useMemo(() => ({ none: rows.filter((r) => r.bucket === "none").length, pending: rows.filter((r) => r.bucket === "pending").length, issued: rows.filter((r) => r.bucket === "issued").length, paid: rows.filter((r) => r.bucket === "paid").length, skip: rows.filter((r) => r.bucket === "skip").length }), [rows]);
  const sums = useMemo(() => ({ expected: rows.filter((r) => r.bucket !== "skip").reduce((a, r) => a + (r.inv?.total ?? r.store.ops?.monthly_fee ?? 0), 0), paid: rows.filter((r) => r.bucket === "paid").reduce((a, r) => a + (r.inv?.total ?? 0), 0) }), [rows]);
  const periods = useMemo(() => { const set = new Set([thisPeriod(), ...invoices.map((i) => i.period)]); const d = new Date(); for (let k = 1; k <= 2; k++) set.add(periodLocal(-k)); return [...set].sort().reverse(); }, [invoices]);
  const visible = bucket ? rows.filter((r) => r.bucket === bucket) : rows.filter((r) => r.bucket !== "skip");

  /** 최근 6개월 — 청구 대비 입금. 막대는 장식이 아니라 '어느 달이 비었나'를 본다. */
  const history = useMemo(() => {
    const d = new Date(); const out: { p: string; billed: number; paid: number }[] = [];
    for (let k = 5; k >= 0; k--) { const p = periodLocal(-k); const inv = invoices.filter((i) => i.period === p && !["CANCELED", "REJECTED"].includes(i.status)); out.push({ p, billed: inv.reduce((a, i) => a + i.total, 0), paid: inv.filter((i) => i.paid_at).reduce((a, i) => a + i.total, 0) }); }
    return out;
  }, [invoices]);

  async function generate() {
    if (busy) return; setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/astro/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, requested_by: actor }) });
      const d = await res.json(); if (!res.ok) { setMsg(d.detail); return; }
      setMsg(`${label(period)} 청구 ${d.created}건 생성${d.skipped?.length ? ` · 건너뜀 ${d.skipped.join(", ")}` : ""}`); load();
    } finally { setBusy(false); }
  }
  async function markPaid(inv: TaxInvoice) {
    // 입금은 입금대로 찍는다. 발행은 세금계산서 탭에서 승인번호와 함께 — 입금 버튼이 발행을 '만들지' 않는다.
    const res = await fetch(`/api/astro/invoices/${inv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-paid", by: actor }) });
    if (!res.ok) setMsg((await res.json()).detail); load();
  }
  async function copyReport() {
    const names = (b: Row["bucket"]) => rows.filter((r) => r.bucket === b).map((r) => r.store.name).join(", ") || "없음";
    const text = [`[${label(period)} 입금 현황] 유료 ${paid.length}곳 · 입금 ${won(sums.paid)} / 청구 ${won(sums.expected)}`, `입금 확인 ${counts.paid}: ${names("paid")}`, `발행·입금 대기 ${counts.issued}: ${names("issued")}`, `품의·승인 중 ${counts.pending}: ${names("pending")}`, `청구 안 됨 ${counts.none}: ${names("none")}`].join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 무시 */ }
  }

  const TONE: Record<Row["bucket"], ChipTone> = { none: "red", pending: "amber", issued: "blue", paid: "green", skip: "gray" };
  const LABEL: Record<Row["bucket"], string> = { none: "청구 안 됨", pending: "품의 · 승인", issued: "발행 · 입금 대기", paid: "입금 확인", skip: "해당 없음" };

  return (
    <>
      <PageHeader title="입금 현황" description="매장 × 월. 청구가 나갔는지, 발행됐는지, 돈이 들어왔는지가 한 줄입니다."
        actions={<>{draft.on && <DraftBadge note={draft.note} />}<Button icon={<IconCopy />} onClick={copyReport} aria-live="polite">{copied ? "복사했습니다" : "보고 문구 복사"}</Button><Button variant="primary" icon={<IconPlus />} onClick={generate} disabled={busy || counts.none === 0}>{busy ? "생성 중…" : `${Number(period.slice(5))}월 청구 생성 (${counts.none})`}</Button></>}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-40"><Select value={period} onChange={(e) => { setPeriod(e.target.value); setBucket(null); }} aria-label="월">{periods.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select></div>
          <span className="text-[13px] text-gray-600">입금 <b className="text-gray-900 tabular-nums">{won(sums.paid)}</b> / 청구 예정 <b className="text-gray-900 tabular-nums">{won(sums.expected)}</b></span>
        </div>
      </PageHeader>

      {msg && <div className="mb-4"><Notice tone="blue" title={msg} /></div>}

      {/* 표가 비는 진짜 이유를 말한다 — 유료 매장이 없어서인지, 매장 목록을 못 읽어서인지 (민열님 0913) */}
      {!loading && storeSource === "unavailable" && (
        <div className="mb-4">
          <Notice tone="red" title="매장 목록을 읽지 못했습니다">
            파트너 매장과 같은 목록(백엔드 식당 데이터)을 못 읽었습니다. 아래 표는 <strong>청구 건에 적힌 이름</strong>으로만 세운 것이라
            플랜·납부 방식 같은 매장 정보가 비어 있습니다. 백엔드 연결을 확인하세요.
          </Notice>
        </div>
      )}

      <div className="mb-5">
        <StepTiles active={bucket} onSelect={(k) => setBucket(bucket === k ? null : (k as Row["bucket"]))} steps={[
          { key: "none", label: "청구 안 됨", count: counts.none, hint: "우리가 만들어야 함", tone: counts.none ? "alert" : "plain" },
          { key: "pending", label: "품의 · 승인", count: counts.pending, hint: "발행 전" },
          { key: "issued", label: "발행 · 입금 대기", count: counts.issued, hint: "점주가 보낼 차례" },
          { key: "paid", label: "입금 확인", count: counts.paid, hint: won(sums.paid), tone: "good" },
        ]} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-4 items-start">
        <Card flush title={`${label(period)} · ${visible.length}곳`} description={counts.skip ? `일시납·이용료 미입력 ${counts.skip}곳은 뺐습니다.` : undefined}>
          {loading ? <Skeleton rows={6} cols={5} /> : rows.length === 0 ? (
            storeSource === "unavailable"
              ? <Empty title="매장 목록을 못 읽었습니다" detail="비어 있는 것이 아니라 못 읽은 것입니다. 파트너 매장 탭도 같은 목록을 씁니다 — 거기서도 0곳이면 백엔드 연결 문제입니다." />
              : <Empty title="유료 매장이 없습니다" detail="파트너 매장 상세의 '식당 관리' 블록에서 플랜을 먼저 지정하세요. 플랜이 BOOST·CONTENT 인 매장만 청구 대상입니다." />
          ) : visible.length === 0 ? <Empty title="이 칸은 비었습니다" /> : (
            <Table minWidth="38rem">
              <thead><tr><Th>매장</Th><Th width="6.5rem" align="right">금액</Th><Th width="8.5rem">상태</Th><Th width="5rem">입금일</Th><Th width="7.5rem" align="right">처리</Th></tr></thead>
              <tbody>
                {visible.map(({ store, inv, bucket: b }) => (
                  <tr key={store.restaurant_id} className={inv ? rowClickable : ""} onClick={() => inv && onGo?.("astro-tax")}>
                    <Td><span className="font-semibold text-gray-900 whitespace-nowrap">{store.name}</span><span className="block text-[11px] text-gray-400 whitespace-nowrap">{(store as StoreRow & { missing?: boolean }).missing ? "매장 목록에서 못 찾음 · 청구 건 기준" : `${store.tier ?? "플랜 미지정"}${store.ops?.pay_cycle === "MONTHLY" ? " · 월납" : ""}${store.ops?.district ? ` · ${store.ops.district}` : ""}`}</span></Td>
                    <Td align="right" numeric className="font-semibold text-gray-900">{won(inv?.total ?? store.ops?.monthly_fee ?? 0)}</Td>
                    <Td><Chip tone={TONE[b]} dot={b === "none"}>{LABEL[b]}</Chip>{inv && <span className="block text-[11px] text-gray-400 mt-0.5">{TAX_STATUS_LABEL[inv.status]}{inv.nts_no ? ` · ${inv.nts_no}` : ""}</span>}</Td>
                    <Td className="text-[12px] text-gray-600">{inv?.paid_at ? inv.paid_at.slice(5, 10).replace("-", "/") : "-"}</Td>
                    <Td align="right">
                      <div className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {b === "none" && <Button size="sm" onClick={generate} disabled={busy} icon={<IconFileInvoice />}>청구 생성</Button>}
                        {inv && b !== "paid" && <Button size="sm" variant="primary" icon={<IconCheck />} onClick={() => markPaid(inv)}>입금 확인</Button>}
                        {b === "paid" && <span className="text-[12px] text-emerald-700 font-semibold">{inv?.status === "ISSUED" ? "완료" : "입금 · 발행 필요"}</span>}
                        <button type="button" aria-label={`${store.name} 문자 보내기`} title="문자 보내기"
                          onClick={() => setSms({ ctx: { name: store.name, targetType: "store", targetId: String(store.restaurant_id), owner: store.ops?.owner_name, phone: store.ops?.owner_phone, fee: inv?.total ?? store.ops?.monthly_fee ?? null, period, sender: actor }, overdue: b !== "paid" && b !== "none" })}
                          className={`w-8 h-8 rounded-lg text-gray-400 hover:text-navy hover:bg-navy/[0.06] flex items-center justify-center ${focusRing}`}>
                          <IconMessage2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="최근 6개월" description="청구 대비 입금. 비어 있는 달이 보이면 그 달을 고르세요.">
          <ol className="space-y-2.5">
            {history.map((h) => {
              const pct = h.billed ? Math.round((h.paid / h.billed) * 100) : 0;
              return (
                <li key={h.p}>
                  <button type="button" onClick={() => { setPeriod(h.p); setBucket(null); }} className={`w-full text-left rounded-lg px-2 py-1.5 hover:bg-navy/[0.04] ${period === h.p ? "bg-navy/[0.06]" : ""}`}>
                    <div className="flex items-center justify-between text-[12px]"><span className={`font-semibold ${period === h.p ? "text-navy" : "text-gray-700"}`}>{label(h.p)}</span><span className="text-gray-500 tabular-nums">{h.billed ? `${won(h.paid)} / ${won(h.billed)}` : "청구 없음"}</span></div>
                    <div className="h-1.5 mt-1.5 rounded-full bg-black/[0.06] overflow-hidden"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-navy/70"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="text-[12px] text-gray-500 mt-3">세금계산서 탭과 같은 데이터입니다. 발행·승인번호는 거기서 다룹니다.</p>
        </Card>
      </div>

      {sms && <MessageComposer open ctx={sms.ctx} event={{ kind: "payment", overdue: sms.overdue }} onClose={() => setSms(null)} onSent={load} />}
    </>
  );
}
