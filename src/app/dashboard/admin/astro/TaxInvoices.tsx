"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconAlertTriangle, IconCheck, IconExternalLink, IconFileInvoice, IconPlus, IconRefresh, IconSearch, IconSettings, IconX } from "@tabler/icons-react";
import { TAX_STATUS_LABEL, type IssuerSettings, type TaxInvoice, type TaxInvoiceStatus } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Notice, PageHeader, PanelSection, Select, Skeleton, SlideOver, StepTiles, Stepper, Table, Td, Textarea, Th, agoLabel, rowClickable, type ChipTone } from "../_shared/ui";

/**
 * Astro · 세금계산서.
 *
 * 애딧 '세발'(sebal.adit.now)과 Console '세금계산서(볼타) 설정'을 합쳤다.
 *   · 상단: 발행 주체 카드(볼타 고객 · 공동인증서 만료) — Console 설정 화면
 *   · 단계 타일: 품의 → 승인 → 발행 중 → 발행 완료 · 실패/취소 — 세발 상태머신
 *   · 월납 일괄 생성 — 우리만의 축. 유료 매장 × 월 이용료를 한 번에 품의로
 *   · 상세: 계산서 정보 / 발행 처리 정보 / 버튼(승인 · 반려 · 발행 · 발행 완료로 표시 · 새로고침 · 취소 · 입금 처리)
 *
 * 볼타는 아직 연결되지 않았다. 그래서 '발행하기'는 막혀 있고, 홈택스/볼타에서 사람이 발행한 뒤
 * '발행 완료로 표시'(승인번호 입력)가 지금의 경로다. 연결되면 버튼만 살아난다.
 */

const TONE: Record<TaxInvoiceStatus, ChipTone> = {
  PENDING: "gray", APPROVED: "blue", ISSUING: "amber", ISSUED: "green", FAILED: "red", RESULT_UNKNOWN: "amber", REJECTED: "red", CANCELED: "gray",
};
const STEPS: TaxInvoiceStatus[] = ["PENDING", "APPROVED", "ISSUING", "ISSUED"];
const won = (n: number) => `${n.toLocaleString()}원`;
const thisPeriod = () => new Date().toISOString().slice(0, 7);

export default function TaxInvoices({ actor, isAdmin, onGo }: { actor: string; isAdmin: boolean; onGo?: (target: string) => void }) {
  const [items, setItems] = useState<TaxInvoice[]>([]);
  const [issuer, setIssuer] = useState<IssuerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(thisPeriod());
  const [status, setStatus] = useState<"all" | TaxInvoiceStatus | "open">("open");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림에서 바로 이 항목을 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/astro/invoices").then((r) => r.json()).catch(() => ({})),
      fetch("/api/astro/invoices/settings").then((r) => r.json()).catch(() => ({})),
    ]).then(([a, b]) => { setItems(a.invoices ?? []); setIssuer(b.issuer ?? null); }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const act = useCallback(async (id: string, body: Record<string, unknown>) => {
    setMsg(null);
    const res = await fetch(`/api/astro/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, by: actor }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(d.detail ?? "처리하지 못했습니다."); return false; }
    setItems((prev) => prev.map((i) => (i.id === id ? d.invoice : i)));
    return true;
  }, [actor]);

  async function generate() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/astro/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, requested_by: actor }) });
      const d = await res.json();
      if (!res.ok) { setMsg(d.detail); return; }
      setMsg(`${period} 품의 ${d.created}건 생성${d.skipped?.length ? ` · 건너뜀 ${d.skipped.length}건 (${d.skipped.join(", ")})` : ""}`);
      load();
    } finally { setBusy(false); }
  }

  const inPeriod = useMemo(() => items.filter((i) => i.period === period), [items, period]);
  const counts = useMemo(() => {
    const c = (s: TaxInvoiceStatus[]) => inPeriod.filter((i) => s.includes(i.status)).length;
    return { pending: c(["PENDING"]), approved: c(["APPROVED"]), issuing: c(["ISSUING", "RESULT_UNKNOWN"]), issued: c(["ISSUED"]), failed: c(["FAILED", "REJECTED", "CANCELED"]), paid: inPeriod.filter((i) => i.paid_at).length };
  }, [inPeriod]);
  const visible = useMemo(() => {
    const q = search.trim();
    return inPeriod
      .filter((i) => status === "all" ? true : status === "open" ? !["ISSUED", "REJECTED", "CANCELED"].includes(i.status) || (i.status === "ISSUED" && !i.paid_at) : i.status === status)
      .filter((i) => !q || i.name.includes(q) || i.title.includes(q) || i.requested_by.includes(q))
      .sort((a, b) => STEPS.indexOf(a.status) - STEPS.indexOf(b.status) || a.name.localeCompare(b.name, "ko"));
  }, [inPeriod, status, search]);
  const periods = useMemo(() => [...new Set([thisPeriod(), ...items.map((i) => i.period)])].sort().reverse(), [items]);
  const open = items.find((i) => i.id === openId) ?? null;
  const certDays = issuer?.cert_expires_at ? Math.floor((Date.parse(issuer.cert_expires_at) - Date.now()) / 86_400_000) : null;

  return (
    <>
      <PageHeader
        title="세금계산서"
        description="월납 매장의 전자세금계산서를 품의 → 승인 → 발행으로 처리합니다. 발행은 되돌리기 어려운 일이라 승인 단계를 하나 둡니다."
        actions={
          <>
            <DraftBadge note="볼타 미연결. 발행 완료는 사람이 표시합니다." />
            <Button icon={<IconSettings />} onClick={() => setSettings(true)}>발행 주체 설정</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={generate} disabled={busy}>{busy ? "생성 중…" : `${Number(period.slice(5))}월분 일괄 생성`}</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="청구 월" className="w-32">
            {periods.map((p) => <option key={p} value={p}>{p.replace("-", "년 ")}월</option>)}
          </Select>
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장, 제목, 요청자 검색" aria-label="계산서 검색" className="pl-8" />
          </div>
          <FilterPills label="상태" value={status} onChange={setStatus} options={[{ key: "open", label: "처리 중" }, { key: "all", label: "전체", count: inPeriod.length }, { key: "ISSUED", label: "발행 완료", count: counts.issued }, { key: "FAILED", label: "실패" }]} />
        </div>
      </PageHeader>

      {/* 발행 주체 — Console '세금계산서(볼타) 설정' */}
      <Card className="mb-4" flush>
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <span className="w-10 h-10 rounded-xl bg-navy/[0.07] text-navy flex items-center justify-center shrink-0"><IconFileInvoice size={20} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-gray-900">{issuer?.name ?? "발행 주체"} <span className="text-[12px] font-normal text-gray-500 ml-1">{issuer?.biz_no} · 대표 {issuer?.ceo}</span></p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {issuer?.bolta_ready
                ? <span className={issuer.bolta_test ? "text-amber-700 font-medium" : "text-emerald-700 font-medium"}>볼타 연결됨{issuer.bolta_test ? " (테스트 키)" : ""}</span>
                : <span className="text-amber-700 font-medium">볼타 열쇠 없음 — 서버에 BOLTA_API_KEY 필요</span>}
              {" · "}
              {issuer?.cert_expires_at ? <span className={certDays !== null && certDays < 30 ? "text-red-600 font-medium" : ""}>공동인증서 만료 {issuer.cert_expires_at}{certDays !== null ? ` (D-${certDays})` : ""}</span> : <span className="text-amber-700 font-medium">공동인증서 미등록</span>}
              {" · "}승인자 {issuer?.approver}
            </p>
          </div>
          <Button size="sm" onClick={() => setSettings(true)}>설정</Button>
        </div>
      </Card>

      {msg && <div className="mb-4"><Notice tone={msg.includes("생성") ? "blue" : "amber"} title={msg} /></div>}

      <div className="mb-5">
        <StepTiles
          active={status === "PENDING" || status === "APPROVED" || status === "ISSUED" ? status : null}
          onSelect={(k) => setStatus(status === k ? "open" : (k as TaxInvoiceStatus))}
          steps={[
            { key: "PENDING", label: "품의", count: counts.pending, hint: "승인 기다림", tone: counts.pending ? "alert" : "plain" },
            { key: "APPROVED", label: "승인", count: counts.approved, hint: "발행할 차례" },
            { key: "ISSUING", label: "발행 중 · 결과 불명", count: counts.issuing, hint: "볼타 확인 필요", tone: counts.issuing ? "alert" : "plain" },
            { key: "ISSUED", label: "발행 완료", count: counts.issued, hint: `입금 ${counts.paid}`, tone: "good" },
          ]}
        />
      </div>

      <Card flush title={`${period.replace("-", "년 ")}월 · ${visible.length}건`} description="행을 누르면 계산서 정보와 처리 이력이 열립니다.">
        {loading ? (
          <Skeleton rows={6} cols={6} />
        ) : inPeriod.length === 0 ? (
          <Empty title={`${Number(period.slice(5))}월분 계산서가 아직 없습니다`} detail="'일괄 생성'을 누르면 유료(월납) 매장마다 월 이용료로 품의가 만들어집니다. 월 이용료가 비어 있는 매장은 건너뜁니다." action={<Button variant="primary" icon={<IconPlus />} onClick={generate} disabled={busy}>일괄 생성</Button>} />
        ) : visible.length === 0 ? (
          <Empty title="이 조건에 해당하는 건이 없습니다" />
        ) : (
          <Table minWidth="52rem">
            <thead>
              <tr>
                <Th>매장 · 제목</Th>
                <Th width="9rem" align="right">공급가 / 세액</Th>
                <Th width="7rem" align="right">합계</Th>
                <Th width="7rem">상태</Th>
                <Th width="9rem">요청 → 승인</Th>
                <Th width="7rem">발행일</Th>
                <Th width="5rem" align="center">입금</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} className={rowClickable} onClick={() => setOpenId(i.id)}>
                  <Td><span className="font-semibold text-gray-900">{i.name}</span><span className="block text-[11px] text-gray-400 truncate max-w-[18rem]">{i.title}</span></Td>
                  <Td align="right" numeric className="text-gray-600 text-[12px]">{i.supply.toLocaleString()} / {i.tax.toLocaleString()}</Td>
                  <Td align="right" numeric className="font-semibold text-gray-900">{won(i.total)}</Td>
                  <Td><Chip tone={TONE[i.status]} dot={i.status === "RESULT_UNKNOWN" || i.status === "FAILED"}>{TAX_STATUS_LABEL[i.status]}</Chip></Td>
                  <Td className="text-[12px] text-gray-600">{i.requested_by}{i.approved_by ? ` → ${i.approved_by}` : ""}</Td>
                  <Td className="text-[12px] text-gray-600">{i.issued_at ? i.issued_at.slice(0, 10) : "-"}</Td>
                  <Td align="center">{i.paid_at ? <span className="text-emerald-700 font-semibold text-[12px]">확인</span> : <span className="text-gray-300">-</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {open && <InvoicePanel inv={open} issuer={issuer} actor={actor} isAdmin={isAdmin} onClose={() => setOpenId(null)} act={act} onGo={onGo} />}
      {settings && issuer && <IssuerPanel issuer={issuer} isAdmin={isAdmin} onClose={() => setSettings(false)} onSaved={load} />}
    </>
  );
}

/* ═══════════ 상세 — 세발 ?id=N 화면 ═══════════ */

function InvoicePanel({ inv, issuer, actor, isAdmin, onClose, act, onGo }: { inv: TaxInvoice; issuer: IssuerSettings | null; actor: string; isAdmin: boolean; onClose: () => void; act: (id: string, body: Record<string, unknown>) => Promise<boolean>; onGo?: (target: string) => void }) {
  const [reason, setReason] = useState("");
  const [nts, setNts] = useState("");
  const [url, setUrl] = useState("");
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>) => { setErr(null); const ok = await act(inv.id, body); if (!ok) setErr("처리하지 못했습니다. 상단 안내를 보세요."); return ok; };
  const step = Math.max(0, STEPS.indexOf(inv.status === "RESULT_UNKNOWN" || inv.status === "FAILED" ? "ISSUING" : inv.status));
  const dead = inv.status === "REJECTED" || inv.status === "CANCELED";
  const canApprove = isAdmin || actor === issuer?.approver;

  return (
    <SlideOver open onClose={onClose} title={inv.title} subtitle={`${inv.name} · ${inv.period.replace("-", "년 ")}월 · 요청 ${inv.requested_by} ${agoLabel(inv.requested_at)}`} badge={<Chip tone={TONE[inv.status]}>{TAX_STATUS_LABEL[inv.status]}</Chip>} width="lg"
      footer={
        <>
          {inv.status === "PENDING" && (
            <Button variant="primary" icon={<IconCheck />} onClick={() => run({ action: "approve" })} disabled={!canApprove} title={canApprove ? undefined : `승인자는 ${issuer?.approver}입니다`}>승인 (발행 요청)</Button>
          )}
          {(inv.status === "APPROVED" || inv.status === "FAILED") && !confirmIssue && (
            <Button variant="primary" icon={<IconFileInvoice />} onClick={() => setConfirmIssue(true)} disabled={!issuer?.bolta_ready} title={issuer?.bolta_ready ? undefined : "볼타 열쇠가 서버에 없습니다 (BOLTA_API_KEY)"}>{inv.status === "FAILED" ? "재시도 (발행)" : "발행하기"}</Button>
          )}
          {(inv.status === "ISSUING" || inv.status === "RESULT_UNKNOWN") && <Button icon={<IconRefresh />} onClick={() => run({ action: "sync" })}>상태 새로고침</Button>}
          {inv.status === "ISSUED" && !inv.paid_at && <Button variant="primary" icon={<IconCheck />} onClick={() => run({ action: "mark-paid" })}>입금 확인 처리</Button>}
          {inv.url && <a href={inv.url} target="_blank" rel="noreferrer"><Button icon={<IconExternalLink />}>세금계산서 보기</Button></a>}
          {!dead && inv.status !== "ISSUED" && <Button variant="ghost" className="ml-auto text-gray-500 hover:text-red-600" icon={<IconX />} onClick={() => run({ action: "cancel" })}>취소</Button>}
        </>
      }>
      {!dead && <Stepper steps={["품의", "승인", "발행 중", "발행 완료"]} current={step} />}
      {err && <Notice tone="red" title={err} />}

      {confirmIssue && (
        <Notice tone={issuer?.bolta_test ? "amber" : "red"} title={issuer?.bolta_test ? "테스트 키입니다 — 국세청으로 나가지 않습니다" : "이 버튼을 누르면 국세청으로 실제 발행됩니다"}>
          {issuer?.bolta_test
            ? "볼타 테스트 키(test_)로 연결돼 있어 실제 발행은 일어나지 않습니다. 흐름만 확인됩니다."
            : "아래 내용으로 전자세금계산서를 즉시 발행합니다. 취소 후 재제출은 어렵습니다."}
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="danger" onClick={async () => { await run({ action: "issue" }); setConfirmIssue(false); }}>발행 확정</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmIssue(false)}>돌아가기</Button>
          </div>
        </Notice>
      )}

      {(inv.status === "RESULT_UNKNOWN" || inv.status === "FAILED") && (
        <Notice tone="amber" title={inv.status === "FAILED" ? `발행 실패 · ${inv.fail_code ?? ""} · ${inv.attempts}회 시도` : "응답이 애매합니다 · 이중 발행 방지로 멈췄습니다"}>
          볼타 대시보드에서 실제 발행 여부를 확인한 뒤, 발행됐으면 아래 '발행 완료로 표시'를, 아니면 재시도를 누르세요.
        </Notice>
      )}

      <PanelSection title="계산서 정보">
        <dl className="divide-y divide-black/[0.05] rounded-xl bg-black/[0.03] text-[13px]">
          {[
            ["공급자", `${issuer?.name ?? "-"} · ${issuer?.biz_no ?? ""}`],
            ["공급받는자", `${inv.name}${inv.counterparty.biz_no ? ` · ${inv.counterparty.biz_no}` : " · 사업자번호 없음"}${inv.counterparty.ceo ? ` · 대표 ${inv.counterparty.ceo}` : ""}`],
            ["공급가액 / 세액", `${won(inv.supply)} / ${won(inv.tax)}`],
            ["합계", won(inv.total)],
            ["작성일자", inv.write_date],
            ["구분", `${inv.tax_type === "TAXABLE" ? "과세" : inv.tax_type === "TAX_FREE" ? "면세" : "영세"} · ${inv.receipt_type === "CLAIM" ? "청구" : "영수"}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-3 py-2"><dt className="text-gray-500 shrink-0">{k}</dt><dd className="text-gray-900 text-right">{v}</dd></div>
          ))}
        </dl>
        {/* 발행 전 상대 정보는 스냅숏이 아니라 매장에 지금 적힌 값이다 — 매장 상세에서 고치면 여기도 따라온다.
            이메일은 볼타가 **필수**로 요구해서, 비면 발행 자체가 거절된다 (0915). */}
        {(!inv.counterparty.biz_no || !inv.counterparty.email) && !["ISSUED", "ISSUING", "RESULT_UNKNOWN"].includes(inv.status) && (
          <p className="text-[12px] text-amber-700 mt-2">
            공급받는자 {[!inv.counterparty.biz_no && "사업자등록번호", !inv.counterparty.email && "이메일"].filter(Boolean).join("·")}이(가) 없습니다.
            {!inv.counterparty.email && " 이메일이 없으면 발행이 거절됩니다."}{" "}
            {onGo
              ? <button type="button" onClick={() => onGo(`astro-ops?open=${inv.restaurant_id}`)} className="font-semibold text-navy hover:underline">매장 상세에서 적기</button>
              : "파트너 매장 → 매장 상세에서 적으면 바로 반영됩니다."}
          </p>
        )}
      </PanelSection>

      <PanelSection title="발행 처리 정보">
        <dl className="divide-y divide-black/[0.05] rounded-xl bg-black/[0.03] text-[13px]">
          {[
            ["요청", `${inv.requested_by} · ${inv.requested_at.slice(0, 16).replace("T", " ")}`],
            ["승인", inv.approved_by ? `${inv.approved_by} · ${inv.approved_at?.slice(0, 16).replace("T", " ")}` : "-"],
            ["발행일시", inv.issued_at ? inv.issued_at.slice(0, 16).replace("T", " ") : "-"],
            ["승인번호", inv.nts_no ?? "-"],
            ["볼타 발행키", inv.bolta_key ?? "-"],
            ["입금 확인", inv.paid_at ? inv.paid_at.slice(0, 10) : "-"],
            ...(inv.reject_reason ? [["반려 사유", inv.reject_reason]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-3 py-2"><dt className="text-gray-500 shrink-0">{k}</dt><dd className="text-gray-900 text-right">{v}</dd></div>
          ))}
        </dl>
      </PanelSection>

      {inv.status !== "ISSUED" && !dead && (
        <PanelSection title="발행 완료로 표시 (홈택스에서 직접 발행한 경우)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="국세청 승인번호"><Input value={nts} onChange={(e) => setNts(e.target.value)} placeholder="2026091012345678-…" /></Field>
            <Field label="계산서 보기 링크"><Input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://" /></Field>
          </div>
          <Button size="sm" className="mt-2" icon={<IconCheck />} onClick={() => run({ action: "mark-issued", nts_no: nts, url })}>발행 완료로 표시</Button>
        </PanelSection>
      )}

      {inv.status === "PENDING" && canApprove && (
        <PanelSection title="반려">
          <Field label="반려 사유" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 월 이용료가 계약과 다름 (33,000 → 30,000)" /></Field>
          <Button size="sm" variant="danger" className="mt-2" onClick={() => run({ action: "reject", reason })} disabled={!reason.trim()}>반려</Button>
        </PanelSection>
      )}
    </SlideOver>
  );
}

/* ═══════════ 발행 주체 설정 — Console '세금계산서(볼타) 설정' ═══════════ */

function IssuerPanel({ issuer, isAdmin, onClose, onSaved }: { issuer: IssuerSettings; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...issuer, bolta_customer_key: issuer.bolta_customer_key ?? "", cert_expires_at: issuer.cert_expires_at ?? "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/astro/invoices/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.detail ?? "저장하지 못했습니다."); return; }
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  return (
    <SlideOver open onClose={onClose} title="발행 주체 설정" subtitle="발행 주체 1곳당 볼타 고객 1개. 공동인증서는 볼타에 등록해야 발행됩니다." footer={<><Button variant="primary" onClick={save} disabled={saving || !isAdmin}>{saving ? "저장하는 중…" : "저장"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{!isAdmin && <span className="text-[12px] text-gray-400 ml-auto">관리자만 바꿀 수 있습니다</span>}{err && <span className="text-[12px] text-red-600 ml-auto" role="alert">{err}</span>}</>}>
      <PanelSection title="공급자">
        <div className="grid grid-cols-2 gap-3">
          {/* 사업자등록증에 박힌 값이라 여기서 못 고친다 (민열님 0915). 오타 하나가
              국세청으로 나가면 수정세금계산서로만 되돌린다. 바꿔야 할 일이 생기면 서버에서 손댄다. */}
          <Field label="상호" hint="사업자등록증 기준 · 고정"><Input value={f.name} disabled /></Field>
          <Field label="사업자등록번호" hint="사업자등록증 기준 · 고정"><Input value={f.biz_no} disabled /></Field>
          <Field label="대표자"><Input value={f.ceo} onChange={set("ceo")} /></Field>
          {/* 계약 완료 안내 문자에 들어가는 계좌. 코드에 박지 않고 여기서만 관리한다(0914). */}
          <Field label="입금 은행" hint="계약 완료 안내 문자에 들어갑니다"><Input value={f.bank_name ?? ""} onChange={set("bank_name")} placeholder="토스뱅크" /></Field>
          <Field label="입금 계좌번호"><Input value={f.bank_account ?? ""} onChange={set("bank_account")} placeholder="1002-0000-0000" inputMode="numeric" /></Field>
          <Field label="예금주"><Input value={f.bank_holder ?? ""} onChange={set("bank_holder")} /></Field>
          <Field label="담당 이메일"><Input value={f.email} onChange={set("email")} type="email" /></Field>
        </div>
        <div className="mt-3"><Field label="주소"><Input value={f.address} onChange={set("address")} /></Field></div>
      </PanelSection>
      <PanelSection title="볼타 (전자세금계산서 API)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="볼타 고객 키" hint="참고용 메모입니다. 발행 열쇠는 서버 환경변수(BOLTA_API_KEY)에 둡니다 — 화면에 두지 않습니다."><Input value={f.bolta_customer_key} onChange={set("bolta_customer_key")} placeholder="선택" /></Field>
          <Field label="공동인증서 만료일" hint="만료 30일 전부터 빨갛게 표시"><Input value={f.cert_expires_at} onChange={set("cert_expires_at")} type="date" /></Field>
        </div>
        <div className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2.5 text-[12px] text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-800 mb-1 inline-flex items-center gap-1"><IconAlertTriangle size={14} aria-hidden="true" /> 안내</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>발행 주체 1곳(코끼리)당 볼타 고객 1개를 등록합니다. 개인사업자 지원 여부·요금은 볼타에 확인이 필요합니다 (0830 분석 Q1).</li>
            <li>공동인증서 등록은 볼타가 주는 5분 유효 URL 에서 합니다. 여기엔 만료일만 적습니다.</li>
            <li>연결 전에는 홈택스에서 발행하고 각 건에 '발행 완료로 표시'(승인번호)를 합니다. 흐름은 같습니다.</li>
          </ul>
        </div>
      </PanelSection>
      <PanelSection title="운영">
        <div className="grid grid-cols-2 gap-3">
          <Field label="품목 제목 템플릿" hint="{period} 자리에 '2026년 9월'"><Input value={f.item_template} onChange={set("item_template")} /></Field>
          <Field label="승인자" hint="품의를 승인할 수 있는 사람. 관리자는 항상 가능"><Input value={f.approver} onChange={set("approver")} /></Field>
        </div>
        <div className="mt-3"><Field label="슬랙 채널" hint="품의 📄 · 승인 🧾 · 발행 완료 ✅ 가 올라갑니다"><Input value={f.slack_channel} onChange={set("slack_channel")} /></Field></div>
      </PanelSection>
    </SlideOver>
  );
}
