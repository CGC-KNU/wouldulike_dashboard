"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBrandSlack, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, DraftBadge, Field, Input, Kpi, Notice, PageHeader, PanelSection, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, rowClickable, todayLocal, type ChipTone } from "../_shared/ui";

/**
 * Probe · 마일리지 추첨 운영.
 *
 * 민열님 0902: "마일리지는 재민이랑 싱크하거나 예산 풀 바뀌지 않는 한 결재까지 민찬 전담".
 * 0920 확인: 9/2·9/4 는 래플이 아예 없었고(회차 미생성), 9/9 는 오히려 응모 7건에 당첨 2명이 나왔다 —
 * 사람이 손으로 적은 기록이 실제와 달랐다. 그래서 이 화면은 앱 DB 실측을 먼저 보여 준다. 마감은 11:00 KST 다. 봇(Libra)이 알림은 보내는데 **응모풀을 어디서 가져오는지**가
 * 정해지지 않아서다(0909 민찬 "어디서 캡쳐하면 돼?"). 이 화면은 그 빈 자리를 먼저 보이게 하고, 회차마다 사람이 확인한 기록을 남긴다.
 * 시트(우주라이크_마일리지_운영)가 정본이고 여기는 운영 기록이다.
 */

interface Round { id: string; date: string; weekday: "수" | "금"; seats: { fixed: number; random: number }; prizes: string; pool_count: number | null; pool_checked_by: string | null; pool_checked_at: string | null; result: "scheduled" | "drawn" | "held" | "skipped"; note: string | null; updated_by: string | null; updated_at: string | null }
interface Raffle { id: number; title: string; prize_amount: number; winner_count: number; status: string; entries: number; winners: number; drawn_at: string | null }
interface DayProgress { entries: number; people: number; winners: number; raffles: Raffle[] }
interface Payload { rounds: Round[]; progress?: Record<string, DayProgress> | null; rules: Record<string, string | string[]>; sheet_url: string; slack_channel: string; pool_source: string; draft?: boolean; draft_note?: string }

const R_LABEL: Record<Round["result"], string> = { scheduled: "예정", drawn: "추첨 완료", held: "보류", skipped: "미운용" };
const R_TONE: Record<Round["result"], ChipTone> = { scheduled: "blue", drawn: "green", held: "red", skipped: "gray" };

export default function MileageOps({ actor }: { actor: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림에서 바로 이 항목을 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);

  const load = useCallback(() => { setLoading(true); fetch("/api/probe/mileage").then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);

  const today = todayLocal();
  const rounds = data?.rounds ?? [];
  const next = useMemo(() => rounds.find((r) => r.date >= today && r.result === "scheduled") ?? null, [rounds, today]);
  const held = rounds.filter((r) => r.result === "held").length;
  const drawn = rounds.filter((r) => r.result === "drawn").length;
  const progress = data?.progress ?? null;
  /** 이 회차에 실제로 무슨 일이 있었나 — 앱 DB. 못 읽었으면 null. */
  const prog = (r: Round): DayProgress | null => progress?.[r.date] ?? null;
  // 응모가 실제로 0 이면 11시 마감 때 뽑을 게 없다 — 사람 확인을 기다리지 않고 먼저 말한다
  const nextEmpty = next ? prog(next)?.entries === 0 : false;
  const poolUnknown = next ? next.pool_count === null && !prog(next) : false;
  const open = rounds.find((r) => r.id === openId) ?? null;

  async function patch(id: string, body: Partial<Pick<Round, "pool_count" | "result" | "note">>) {
    const res = await fetch("/api/probe/mileage", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body, by: actor }) });
    if (res.ok) { const d = await res.json(); setData((prev) => prev && { ...prev, rounds: prev.rounds.map((r) => (r.id === id ? d.round : r)) }); }
  }

  return (
    <>
      <PageHeader title="마일리지 추첨" description="수 · 금 11시 마감 · 마감 직후 추첨. 응모풀이 비면 추첨이 보류됩니다. 회차마다 응모풀을 확인하고 결과를 남깁니다."
        actions={<>{data?.draft && <DraftBadge note={data.draft_note} />}{data && <a href={data.sheet_url} target="_blank" rel="noreferrer"><Button icon={<IconExternalLink />}>운영 시트</Button></a>}{data && <a href={`https://slack.com/app_redirect?channel=${data.slack_channel}`} target="_blank" rel="noreferrer"><Button icon={<IconBrandSlack />}>#{data.slack_channel}</Button></a>}<Button variant="primary" icon={<IconRefresh />} onClick={load} disabled={loading}>다시 읽기</Button></>} />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="다음 회차" value={loading ? "-" : next ? `${Number(next.date.slice(5, 7))}/${Number(next.date.slice(8))} ${next.weekday}` : "없음"} hint={next ? `20:00 · 확정 ${next.seats.fixed} · 랜덤 ${next.seats.random}` : "이번 달 남은 회차 없음"} />
        {/* 다음 회차 응모 — 앱 DB 실측이 있으면 그걸 먼저 보여 준다(사람이 시트에서 세던 숫자를 대신한다) */}
        <Kpi label="다음 회차 응모" value={loading ? "-" : !next ? "-" : prog(next) ? prog(next)!.entries : next.pool_count === null ? "미확인" : next.pool_count}
          tone={nextEmpty || poolUnknown ? "alert" : "plain"}
          hint={!next ? "" : prog(next) ? `${prog(next)!.people}명 · 앱 기록${nextEmpty ? " · 이대로면 11시 마감 때 뽑을 게 없다" : ""}` : next.pool_checked_at ? `${next.pool_checked_by ?? ""} 확인` : "앱 기록을 못 읽었습니다 — 시트 확인"}
          onClick={next ? () => setOpenId(next.id) : undefined} />
        <Kpi label="보류된 회차" value={loading ? "-" : held} tone="alert" hint="응모풀 비어 추첨 못 함" />
        <Kpi label="추첨 완료" value={loading ? "-" : drawn} hint={`이번 달 ${rounds.filter((r) => r.result !== "skipped").length}회차 중`} tone="good" />
      </div>

      {data && data.pool_source === "manual" && (
        <div className="mb-4">
          <Notice tone="amber" title="응모풀 정본 소스가 아직 없습니다">
            회차마다 앱 DB 스냅샷을 사람이 시트 '응모풀' 탭에 붙여넣고 <code className="bg-black/[0.05] px-1 rounded text-[12px]">mileageDrawManual</code> 을 돌립니다.
            9/2 · 9/4 · 9/9 가 이래서 보류됐습니다. <strong>앱 DB → 시트 자동 적재</strong>(재민)가 붙으면 이 알림은 사라집니다.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-4 items-start">
        <Card flush title="9월 회차" description="1주차 없음 · 4주차는 추석 적립분 몰아 방출 + 상품 2배 (0902 확정)">
          {loading ? <Skeleton rows={8} cols={5} /> : (
            <Table minWidth="40rem">
              <thead><tr><Th width="6rem">회차</Th><Th width="8rem">좌석</Th><Th width="11rem">상품</Th><Th width="7rem" align="right">응모 (앱)</Th><Th width="5rem" align="right">당첨</Th><Th width="5rem" align="right">사람 확인</Th><Th width="6.5rem">결과</Th><Th>메모</Th></tr></thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.id} className={`${rowClickable} ${r.id === next?.id ? "bg-navy/[0.03]" : ""}`} onClick={() => setOpenId(r.id)}>
                    <Td><span className="font-semibold text-gray-900 whitespace-nowrap">{Number(r.date.slice(5, 7))}/{Number(r.date.slice(8))} ({r.weekday})</span>{r.id === next?.id && <span className="block text-[11px] text-navy font-semibold">다음</span>}</Td>
                    <Td className="text-[12px] text-gray-600 whitespace-nowrap">확정 {r.seats.fixed} · 랜덤 {r.seats.random}</Td>
                    <Td className="text-[12px] text-gray-600 whitespace-nowrap">{r.result === "skipped" ? "-" : r.prizes}</Td>
                    {/* 앱 DB 실측 — 못 읽으면 '—'(모름), 읽었는데 없으면 0. 사람이 적은 숫자와 섞지 않는다. */}
                    <Td align="right" numeric className={!prog(r) ? "text-gray-300" : prog(r)!.entries === 0 ? "text-red-600 font-semibold" : "text-gray-900 font-semibold"}>
                      {!prog(r) ? "—" : <>{prog(r)!.entries}{prog(r)!.people > 0 && <span className="block text-[11px] text-gray-400 font-normal">{prog(r)!.people}명</span>}</>}
                    </Td>
                    <Td align="right" numeric className="text-gray-700">{!prog(r) ? "—" : prog(r)!.winners}</Td>
                    <Td align="right" numeric className={r.pool_count === null ? "text-gray-300" : "text-gray-600"}>{r.pool_count === null ? "?" : r.pool_count}</Td>
                    <Td><Chip tone={R_TONE[r.result]} dot={r.result === "held"}>{R_LABEL[r.result]}</Chip></Td>
                    <Td className="text-[12px] text-gray-500 truncate max-w-[16rem]">{r.note ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="규칙 (계약 v6 제8~10조 · #ops-mileage 결정)">
          {loading || !data ? <Skeleton rows={5} cols={1} /> : (
            <dl className="space-y-2.5 text-[12px]">
              {[["주기", data.rules.cadence], ["상품", data.rules.prizes], ["월 좌석", data.rules.seats_month], ["확정석", data.rules.fixed_rule], ["랜덤석", data.rules.random_rule], ["정산", data.rules.settle]].map(([k, v]) => (
                <div key={k as string}><dt className="text-gray-500">{k}</dt><dd className="text-gray-800 leading-relaxed">{v as string}</dd></div>
              ))}
              <div><dt className="text-gray-500">금지 표현</dt><dd className="flex flex-wrap gap-1 mt-1">{(data.rules.banned as string[]).map((b) => <span key={b} className="bg-red-50 text-red-700 rounded px-1.5 py-0.5">{b}</span>)}</dd></div>
            </dl>
          )}
        </Card>
      </div>

      {open && <RoundPanel r={open} prog={prog(open)} onClose={() => setOpenId(null)} onPatch={patch} onCreated={load} />}
    </>
  );
}

type PickMode = "random" | "top_entries";
/** 회차 기본값 — 9월은 전부 랜덤, 10월부터 5,000원은 확정권(0920 운영 방침) */
function defaultItems(date: string): { prize_amount: number; winner_count: number; pick_mode: PickMode }[] {
  const oct = date >= "2026-10-01";
  return [
    { prize_amount: 5000, winner_count: 1, pick_mode: oct ? "top_entries" : "random" },
    { prize_amount: 10000, winner_count: 1, pick_mode: "random" },
  ];
}

function RoundPanel({ r, prog, onClose, onPatch, onCreated }: { r: Round; prog: DayProgress | null; onClose: () => void; onPatch: (id: string, body: Partial<Pick<Round, "pool_count" | "result" | "note">>) => Promise<void>; onCreated: () => void }) {
  const [items, setItems] = useState(defaultItems(r.date));
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  async function create() {
    if (creating) return; setCreating(true); setCreateMsg(null);
    try {
      const res = await fetch("/api/probe/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: r.date, items }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateMsg(d.detail ?? "만들지 못했습니다."); return; }
      const made = (d.created ?? []).length;
      setCreateMsg(made ? `${made}건 만들었습니다. 앱 상점에 바로 뜹니다.` : "이미 있는 회차라 새로 만들지 않았습니다.");
      onCreated();
    } finally { setCreating(false); }
  }
  const [pool, setPool] = useState(r.pool_count === null ? "" : String(r.pool_count));
  const [note, setNote] = useState(r.note ?? "");
  const [result, setResult] = useState<Round["result"]>(r.result);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPool(r.pool_count === null ? "" : String(r.pool_count)); setNote(r.note ?? ""); setResult(r.result); setItems(defaultItems(r.date)); setCreateMsg(null); }, [r]);
  async function save() {
    if (saving) return; setSaving(true);
    try { await onPatch(r.id, { pool_count: pool.trim() === "" ? null : Math.max(0, parseInt(pool, 10) || 0), result, note: note.trim() || null }); onClose(); } finally { setSaving(false); }
  }
  return (
    <SlideOver open onClose={onClose} title={`${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8))} (${r.weekday}) 11:00 마감 회차`} subtitle={`확정 ${r.seats.fixed} · 랜덤 ${r.seats.random} · ${r.prizes}`} badge={<Chip tone={R_TONE[r.result]}>{R_LABEL[r.result]}</Chip>}
      footer={<><Button variant="primary" onClick={save} disabled={saving}>{saving ? "저장 중…" : "기록 저장"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{r.updated_at && <span className="ml-auto text-[12px] text-gray-400">{r.updated_by} · {new Date(r.updated_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}</>}>
      {/* 앱에 응모(래플)가 없으면 여기서 손으로 만든다. 자동 생성은 두지 않는다(0920) — 상품이 걸린 자리라서. */}
      {!prog && (
        <PanelSection title="이 회차 응모 만들기" actions={<span className="text-[12px] text-gray-400">앱에 아직 없습니다</span>}>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={it.prize_amount} className="flex items-center gap-2">
                <span className="w-[5.5rem] text-[13px] font-semibold text-gray-800">{it.prize_amount.toLocaleString()}원</span>
                <Select value={it.pick_mode} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, pick_mode: e.target.value as PickMode } : x)))}>
                  <option value="random">랜덤 (응모권 비례)</option>
                  <option value="top_entries">확정 (최다 응모자)</option>
                </Select>
                <Input type="number" inputMode="numeric" min={1} max={50} value={it.winner_count} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, winner_count: Number(e.target.value) } : x)))} className="w-[5rem]" />
                <span className="text-[12px] text-gray-500">명</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-gray-500 mt-2">마감은 그날 11:00, 응모 시작은 3일 전입니다. 9월은 전부 랜덤, 10월부터 5,000원은 확정권(그 회차에 가장 많이 응모한 사람)입니다.</p>
          <Button variant="primary" onClick={create} disabled={creating} className="mt-2">{creating ? "만드는 중…" : "앱에 회차 만들기"}</Button>
          {createMsg && <p className="text-[12px] text-gray-600 mt-2">{createMsg}</p>}
        </PanelSection>
      )}
      <PanelSection title={prog ? "응모 (앱 실측)" : "응모풀"}>
        {prog && <p className="text-[13px] text-gray-800 mb-2">응모 <b>{prog.entries}건</b> · {prog.people}명 · 당첨 <b>{prog.winners}명</b>{prog.raffles.map((x) => ` · ${x.prize_amount.toLocaleString()}원 ${x.entries}건${x.status === "DRAWN" ? " (추첨 완료)" : ""}`).join("")}</p>}
        <Field label="응모 인원 (사람 확인 · 시트 기준)" hint="비어 있으면 '미확인'. 0 은 확인했는데 없다는 뜻입니다."><Input type="number" inputMode="numeric" value={pool} onChange={(e) => setPool(e.target.value)} placeholder="예: 42" /></Field>
        {r.pool_checked_at && <p className="text-[12px] text-gray-500">{r.pool_checked_by} 가 {new Date(r.pool_checked_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 에 확인</p>}
      </PanelSection>
      <PanelSection title="결과">
        <Field label="회차 결과"><Select value={result} onChange={(e) => setResult(e.target.value as Round["result"])}><option value="scheduled">예정</option><option value="drawn">추첨 완료</option><option value="held">보류 (응모풀 비어 있음 등)</option><option value="skipped">미운용 (정책상 없음)</option></Select></Field>
        <Field label="메모"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 당첨 2명, 시트 추첨기록 탭 반영" /></Field>
      </PanelSection>
      <p className="text-[12px] text-gray-500">추첨 자체는 시트의 <code className="bg-black/[0.05] px-1 rounded">mileageDrawManual</code> 이 합니다(시드 재현 가능). 여기는 그 결과를 사람이 옮겨 적는 자리입니다.</p>
    </SlideOver>
  );
}
