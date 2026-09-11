"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconCopy, IconExternalLink, IconLink, IconRefresh, IconTrash } from "@tabler/icons-react";
import { METRIC_LABEL, checkText, reportAllText } from "@/lib/draft/report";
import type { ReportStatus, StoreReport } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Kpi, Notice, PageHeader, PanelSection, Skeleton, SlideOver, Table, Td, Textarea, Th, agoLabel, rowClickable, type ChipTone } from "../_shared/ui";

/**
 * Probe · 매장 리포트 — 점주에게 보내는 공개 링크의 편집실.
 *
 * 만들기(홍보 인사이트에서) → 여기서 검토·문구 수정 → 승인(금지 표현·지어낸 숫자 검사, 걸리면 차단) → 링크 발급 → 카톡은 사람 → 열람 표시.
 * 스냅샷 숫자는 읽기 전용. 문구를 고치면 승인은 무효가 되고 다시 승인해야 한다.
 */

const S_LABEL: Record<ReportStatus, string> = { DRAFT: "초안", APPROVED: "승인됨", LINKED: "링크 발급 · 미전송", SENT: "보냄", REVOKED: "회수됨" };
const S_TONE: Record<ReportStatus, ChipTone> = { DRAFT: "gray", APPROVED: "blue", LINKED: "amber", SENT: "green", REVOKED: "red" };

export default function Reports({ onGo }: { onGo?: (tab: string) => void }) {
  const [list, setList] = useState<StoreReport[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [filter, setFilter] = useState<"todo" | "sent" | "all">("todo");
  const [openId, setOpenId] = useState<string | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림에서 바로 이 항목을 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);

  const load = useCallback(() => { fetch("/api/probe/reports").then((r) => r.json()).then((d) => { setList(d.reports ?? []); setNote(d.draft_note); }).catch(() => setList([])); }, []);
  useEffect(load, [load]);

  const visible = useMemo(() => (list ?? []).filter((r) => filter === "all" || (filter === "todo" ? r.status === "DRAFT" || r.status === "APPROVED" || r.status === "LINKED" : r.status === "SENT")), [list, filter]);
  const counts = useMemo(() => ({ draft: (list ?? []).filter((r) => r.status === "DRAFT").length, approved: (list ?? []).filter((r) => r.status === "APPROVED").length, linked: (list ?? []).filter((r) => r.status === "LINKED").length, sent: (list ?? []).filter((r) => r.status === "SENT").length, viewed: (list ?? []).filter((r) => r.status === "SENT" && r.views.count > 0).length }), [list]);
  const open = (list ?? []).find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageHeader title="매장 리포트" description="점주에게 카톡으로 보내는 링크. 스냅샷 숫자는 고정, 문구는 사람이 다듬고, 승인해야 링크가 나옵니다."
        actions={<>{note && <DraftBadge note={note} />}<Button icon={<IconRefresh />} onClick={load}>다시 읽기</Button>{onGo && <Button variant="primary" onClick={() => onGo("probe-insights")}>홍보 인사이트에서 만들기</Button>}</>}>
        <FilterPills label="상태" value={filter} onChange={setFilter} options={[{ key: "todo", label: "검토 · 승인 · 미전송", count: counts.draft + counts.approved + counts.linked }, { key: "sent", label: "보낸 것", count: counts.sent }, { key: "all", label: "전체", count: list?.length }]} />
      </PageHeader>

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="검토 대기" value={list ? counts.draft : "-"} tone="alert" hint="문구 확인 · 제안 승인" />
        <Kpi label="발급했는데 안 보냄" value={list ? counts.linked : "-"} tone="alert" hint="링크 복사 후 '보냈음' 체크" />
        <Kpi label="보낸 링크" value={list ? counts.sent : "-"} hint={`승인만 된 것 ${counts.approved}`} />
        <Kpi label="열람됨" value={list ? counts.viewed : "-"} tone="good" hint="점주가 한 번이라도 연 링크" />
      </div>

      {!list ? <Card flush><Skeleton rows={5} cols={5} /></Card> : visible.length === 0 ? (
        <Card><Empty title={filter === "todo" ? "검토할 리포트가 없습니다" : "리포트가 없습니다"} detail="홍보 인사이트에서 게시물을 골라 '리포트 만들기'를 누르면 여기로 옵니다." action={onGo ? <Button variant="primary" onClick={() => onGo("probe-insights")}>홍보 인사이트</Button> : undefined} /></Card>
      ) : (
        <Card flush>
          <Table minWidth="48rem">
            <thead><tr><Th>매장 · 게시물</Th><Th width="7rem">상태</Th><Th width="6rem" align="right">저장</Th><Th width="6rem" align="right">도달</Th><Th width="5rem" align="center">제안</Th><Th width="5rem" align="right">열람</Th><Th width="7rem" align="right">만든 때</Th></tr></thead>
            <tbody>
              {visible.map((r) => {
                const m = (k: string) => r.snapshot.metrics.find((x) => x.key === k);
                return (
                  <tr key={r.id} className={rowClickable} onClick={() => setOpenId(r.id)}>
                    <Td><span className="font-semibold text-gray-900">{r.snapshot.store.name}</span><span className="block text-[11px] text-gray-400 truncate max-w-[18rem]">{r.snapshot.post.topic}</span></Td>
                    <Td><Chip tone={S_TONE[r.status]} dot={r.status === "DRAFT"}>{S_LABEL[r.status]}</Chip></Td>
                    <Td align="right" numeric>{m("saved")?.value.toLocaleString() ?? <span className="text-gray-300">—</span>}</Td>
                    <Td align="right" numeric>{m("reach")?.value.toLocaleString() ?? <span className="text-gray-300">—</span>}</Td>
                    <Td align="center" className="text-[12px] text-gray-600">{r.proposals.filter((p) => p.approved).length} / {r.proposals.length}</Td>
                    <Td align="right" numeric className={r.views.count ? "text-emerald-700 font-semibold" : "text-gray-300"}>{r.views.count}</Td>
                    <Td align="right" className="text-[12px] text-gray-500">{agoLabel(r.created_at)}<span className="block text-[11px] text-gray-400">{r.created_by}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">링크는 40자 토큰이라 추측이 안 되고, 검색엔진에 잡히지 않으며, 회수하면 즉시 닫힙니다. 스냅샷에는 매장 이름과 게시물·지표만 들어갑니다 — 연락처·사업자번호·PIN 은 절대 실리지 않습니다.</p>

      {open && <ReportEditor r={open} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

export function ReportEditor({ r, onClose, onChanged }: { r: StoreReport; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(r.title);
  const [summary, setSummary] = useState(r.summary);
  const [interp, setInterp] = useState(r.interpretation.join("\n"));
  const [props, setProps] = useState(r.proposals.map((p) => ({ rule: p.rule, title: p.title, text: p.text, approved: p.approved })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "blue" | "red" | "green"; text: string; problems?: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setTitle(r.title); setSummary(r.summary); setInterp(r.interpretation.join("\n")); setProps(r.proposals.map((p) => ({ rule: p.rule, title: p.title, text: p.text, approved: p.approved }))); setMsg(null); }, [r]);

  const editable = r.status === "DRAFT" || r.status === "APPROVED";
  const dirty = title !== r.title || summary !== r.summary || interp !== r.interpretation.join("\n") || JSON.stringify(props) !== JSON.stringify(r.proposals.map((p) => ({ rule: p.rule, title: p.title, text: p.text, approved: p.approved })));
  // 저장 전에도 클라이언트에서 같은 검사를 돌려 미리 보여준다 (최종 판정은 서버)
  const precheck = useMemo(() => checkText(reportAllText({ title, summary, interpretation: interp.split("\n").filter(Boolean), proposals: props.map((p) => ({ ...p, generated_text: "", edited_by: null, edited_at: null })) }), r.snapshot), [title, summary, interp, props, r.snapshot]);
  const url = r.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${r.token}` : null;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/probe/reports/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, summary, interpretation: interp.split("\n").filter(Boolean), proposals: props }) });
      const d = await res.json(); if (!res.ok) { setMsg({ tone: "red", text: d.detail }); return; }
      setMsg({ tone: "blue", text: "저장했습니다. 승인은 다시 받아야 합니다." }); onChanged();
    } finally { setBusy(false); }
  }
  async function act(action: "approve" | "link" | "sent" | "revoke") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/probe/reports/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await res.json(); if (!res.ok) { setMsg({ tone: "red", text: d.detail, problems: d.problems }); return; }
      setMsg({ tone: "green", text: action === "approve" ? "승인했습니다. 이제 링크를 만들 수 있습니다." : action === "link" ? "링크를 만들었습니다. 복사해서 카톡으로 보낸 뒤 '보냈음'을 눌러 주세요." : action === "sent" ? "보냈음으로 표시했습니다." : "링크를 회수했습니다." }); onChanged();
    } finally { setBusy(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 무시 */ } }

  const s = r.snapshot;
  return (
    <SlideOver open onClose={onClose} title={s.store.name} subtitle={`'${s.post.topic}' · ${new Date(s.as_of).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준 스냅샷`} badge={<Chip tone={S_TONE[r.status]}>{S_LABEL[r.status]}</Chip>} width="lg"
      footer={
        <>
          {editable && dirty && <Button variant="primary" onClick={save} disabled={busy}>문구 저장</Button>}
          {r.status === "DRAFT" && !dirty && <Button variant="primary" icon={<IconCheck />} onClick={() => act("approve")} disabled={busy || !precheck.ok}>승인</Button>}
          {r.status === "APPROVED" && !dirty && <Button variant="primary" icon={<IconLink />} onClick={() => act("link")} disabled={busy}>링크 만들기</Button>}
          {(r.status === "LINKED" || r.status === "SENT") && url && <Button variant={r.status === "SENT" ? "primary" : "secondary"} icon={<IconCopy />} onClick={() => copy(url)}>{copied ? "복사했습니다" : "링크 복사"}</Button>}
          {r.status === "LINKED" && <Button variant="primary" icon={<IconCheck />} onClick={() => act("sent")} disabled={busy}>카톡으로 보냈음</Button>}
          <a href={r.token && (r.status === "LINKED" || r.status === "SENT") ? `/r/${r.token}` : `/r/preview-${r.id}`} target="_blank" rel="noreferrer"><Button icon={<IconExternalLink />}>{r.token ? "열어보기" : "미리보기"}</Button></a>
          {(r.status === "LINKED" || r.status === "SENT") && <Button variant="ghost" icon={<IconTrash />} onClick={() => act("revoke")} disabled={busy}>회수</Button>}
          <span className="ml-auto text-[12px] text-gray-400">{r.token ? `열람 ${r.views.count}회${r.views.last_at ? ` · ${agoLabel(r.views.last_at)}` : ""}` : r.approved_by ? `${r.approved_by} 승인` : `${r.created_by} 작성`}</span>
        </>
      }>
      {msg && <Notice tone={msg.tone === "green" ? "blue" : msg.tone} title={msg.text}>{msg.problems && <ul className="list-disc pl-4 mt-1">{msg.problems.map((p) => <li key={p}>{p}</li>)}</ul>}</Notice>}
      {!precheck.ok && <Notice tone="amber" title="이대로는 승인되지 않습니다"><ul className="list-disc pl-4">{precheck.problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice>}

      <PanelSection title="스냅샷 (읽기 전용)">
        <div className="grid grid-cols-3 gap-2">
          {s.metrics.filter((m) => ["saved", "reach", "views", "shares", "likes", "comments"].includes(m.key)).map((m) => (
            <div key={m.key} className="rounded-lg border border-gray-200 px-3 py-2"><p className="text-[11px] text-gray-500">{METRIC_LABEL[m.key]}</p><p className="text-[16px] font-bold tabular-nums">{m.value.toLocaleString()}</p><p className="text-[11px] text-gray-400">{m.delta_pct !== null ? `중앙값 대비 ${m.delta_pct >= 0 ? "+" : ""}${m.delta_pct}% (n=${m.n})` : m.hidden || m.n < 5 ? `표본 부족 (n=${m.n})` : "기준 없음"}</p></div>
          ))}
          {s.metrics.length === 0 && <p className="col-span-3 text-[13px] text-gray-500">인스타그램 수치가 없습니다. 공개 페이지에는 '—' 로 나갑니다.</p>}
        </div>
        {s.app && <p className="text-[12px] text-gray-600 mt-2">앱 {s.app.month}: 쿠폰 {s.app.coupon_redeemed} · 스탬프 {s.app.stamp_earned} · 재방문 {s.app.revisit} · 단골 {s.app.loyal_total}{s.app.coupon_redeemed + s.app.stamp_earned + s.app.revisit + s.app.loyal_total === 0 ? " — 전부 0 이라 공개 페이지에서는 블록을 숨깁니다" : ""}</p>}
        {s.post.co_stores > 1 && <p className="text-[12px] text-amber-700 mt-1">{s.post.co_stores}곳을 함께 소개한 게시물입니다. 수치는 게시물 전체 것이고, 공개 페이지가 그렇게 말합니다.</p>}
      </PanelSection>

      <PanelSection title="문구">
        <Field label="제목"><Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} /></Field>
        <Field label="한 줄 요약 (카톡 미리보기에 보입니다)"><Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!editable} /></Field>
        <Field label="비교 해석 (줄마다 한 문장 · 지표 이름으로 시작)" hint="스냅샷에 없는 숫자, 금지 표현('보장' '상위권' '덕분에' 등)은 승인이 막힙니다."><Textarea rows={3} value={interp} onChange={(e) => setInterp(e.target.value)} disabled={!editable} /></Field>
      </PanelSection>

      <PanelSection title={`다음 제안 (${props.filter((p) => p.approved).length} 승인 / ${props.length})`}>
        {props.length === 0 ? <p className="text-[13px] text-gray-500">조건에 걸린 제안이 없습니다. 억지로 채우지 않습니다 — 제안 섹션은 공개 페이지에서 숨겨집니다.</p> : (
          <ul className="space-y-3">
            {props.map((p, i) => (
              <li key={p.rule} className="rounded-lg border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 cursor-pointer"><input type="checkbox" checked={p.approved} disabled={!editable} onChange={(e) => setProps((ps) => ps.map((x, k) => (k === i ? { ...x, approved: e.target.checked } : x)))} className="w-4 h-4 accent-[#050072]" />{p.title}<span className="text-[11px] text-gray-400 font-normal">{p.rule}</span></label>
                <Textarea rows={2} value={p.text} disabled={!editable} onChange={(e) => setProps((ps) => ps.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} className="mt-2" />
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      {(r.status === "LINKED" || r.status === "SENT") && url && (
        <PanelSection title="링크">
          <div className="flex items-center gap-2"><Input value={url} readOnly className="font-mono text-[12px]" /><Button icon={<IconCopy />} onClick={() => copy(url)}>{copied ? "복사했습니다" : "복사"}</Button></div>
          <p className="text-[12px] text-gray-500 mt-2">함께 보낼 인사말: "사장님, 안녕하세요. 우주라이크입니다. 지난 게시물 성과를 정리한 페이지입니다. 링크를 눌러 보시면 됩니다."</p>
        </PanelSection>
      )}
    </SlideOver>
  );
}
