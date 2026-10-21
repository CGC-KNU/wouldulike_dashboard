"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconBrandSlack, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { PanelSection, Unknown, daysBetween, md, openDateOf, weekdayOf } from "./kit";
import { Button, Card, Chip, DraftBadge, Field, FilterPills, Input, Kpi, Notice, PageHeader, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, rowClickable, todayLocal, type ChipTone } from "../_shared/ui";

/**
 * Probe · 마일리지 추첨 운영.
 *
 * 민열님 0902: "마일리지는 재민이랑 싱크하거나 예산 풀 바뀌지 않는 한 결재까지 민찬 전담".
 * 0920 확인: 9/2·9/4 는 래플이 아예 없었고(회차 미생성), 9/9 는 오히려 응모 7건에 당첨 2명이 나왔다 —
 * 사람이 손으로 적은 기록이 실제와 달랐다. 그래서 이 화면은 앱 DB 실측을 먼저 보여 준다. 마감은 11:00 KST 다. 봇(Libra)이 알림은 보내는데 **응모풀을 어디서 가져오는지**가
 * 정해지지 않아서다(0909 민찬 "어디서 캡쳐하면 돼?"). 이 화면은 그 빈 자리를 먼저 보이게 하고, 회차마다 사람이 확인한 기록을 남긴다.
 * 시트(우주라이크_마일리지_운영)가 정본이고 여기는 운영 기록이다.
 */

interface Round { id: string; date: string; weekday: "수" | "금"; seats: { fixed: number; random: number }; prizes: string; pool_auto?: boolean; result_auto?: boolean; pool_count: number | null; pool_checked_by: string | null; pool_checked_at: string | null; result: "scheduled" | "drawn" | "held" | "skipped"; note: string | null; updated_by: string | null; updated_at: string | null }
interface Raffle { id: number; title: string; prize_amount: number; winner_count: number; status: string; entries: number; winners: number; drawn_at: string | null }
interface Voucher { user_id: number; coupon_code: string | null; status: "REDEEMED" | "EXPIRED" | "ISSUED" | null; expires_at: string | null; redeemed_at: string | null; restaurant_id: number | null; restaurant_name: string | null }
interface VoucherSummary { issued: number; redeemed: number; expired: number; waiting: number; none: number }
interface DayProgress { entries: number; people: number; winners: number; vouchers: Voucher[]; raffles: Raffle[] }
interface Payload { rounds: Round[]; progress?: Record<string, DayProgress> | null; vouchers?: VoucherSummary | null; rules: Record<string, string | string[]>; sheet_url: string; slack_channel: string; pool_source: string; draft?: boolean; draft_note?: string }

const R_LABEL: Record<Round["result"], string> = { scheduled: "예정", drawn: "추첨 완료", held: "보류", skipped: "미운용" };
const R_TONE: Record<Round["result"], ChipTone> = { scheduled: "navy", drawn: "green", held: "red", skipped: "gray" };

export default function MileageOps({ actor }: { actor: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림 · 홈 「오늘 할 일」에서 바로 이 항목을 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);

  const load = useCallback(() => { setLoading(true); fetch("/api/probe/mileage").then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);

  const today = todayLocal();
  const rounds = data?.rounds ?? [];
  const next = useMemo(() => rounds.find((r) => r.date >= today && r.result === "scheduled") ?? null, [rounds, today]);
  const todayRound = rounds.find((r) => r.date === today) ?? null;
  // 표는 한 달씩 — 서버는 9월과 이번 달을 같이 준다. 이번 달이 없으면(아직 못 읽음) 마지막 달
  const months = useMemo(() => [...new Set(rounds.map((r) => r.date.slice(0, 7)))].sort(), [rounds]);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? (months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[months.length - 1] ?? today.slice(0, 7));
  const monthNo = Number(month.slice(5, 7));
  const monthRounds = rounds.filter((r) => r.date.startsWith(month));
  const held = monthRounds.filter((r) => r.result === "held").length;
  const drawn = monthRounds.filter((r) => r.result === "drawn").length;
  const wins = monthRounds.reduce((a, r) => a + (r.result === "drawn" ? data?.progress?.[r.date]?.winners ?? 0 : 0), 0);
  const progress = data?.progress ?? null;
  const v = data?.vouchers ?? null;
  /** 이 회차에 실제로 무슨 일이 있었나 — 앱 DB. 못 읽었으면 null. */
  const prog = (r: Round): DayProgress | null => progress?.[r.date] ?? null;
  /** 앱 기록을 못 읽었는가 — 그러면 응모 · 당첨 · 식사권 칸은 0 이 아니라 모름 */
  const lost = !loading && data !== null && !progress;
  // 응모가 7일 안에 열려야 하는데 앱에 회차가 없는 예정 회차. 앱 기록을 못 읽으면 알 수 없어 빈 목록
  const missing = useMemo(() => (progress ? rounds.filter((r) => r.result === "scheduled" && !progress[r.date] && daysBetween(today, openDateOf(r.date)) <= 7) : []), [rounds, progress, today]);
  const missingIds = new Set(missing.map((r) => r.id));
  const open = rounds.find((r) => r.id === openId) ?? null;

  // 식사권 — 회차마다 달린 목록을 합친다(쿠폰 코드로 중복 제거). 이번 달 사용 장 수 · 매장 수, 7일 안 만료
  const allVouchers = useMemo(() => { const m = new Map<string, Voucher>(); for (const d of Object.values(progress ?? {})) for (const x of d.vouchers) m.set(x.coupon_code ?? `u${x.user_id}-${x.expires_at}`, x); return [...m.values()]; }, [progress]);
  const usedInMonth = allVouchers.filter((x) => x.status === "REDEEMED" && x.redeemed_at?.startsWith(month));
  const usedStores = new Set(usedInMonth.map((x) => x.restaurant_id ?? x.restaurant_name)).size;
  const expiring = allVouchers.filter((x) => x.status === "ISSUED" && x.expires_at && daysBetween(today, x.expires_at) >= 0 && daysBetween(today, x.expires_at) <= 7);
  const payDate = (() => { const [y, m] = month.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-10`; })();

  async function patch(id: string, body: Partial<Pick<Round, "pool_count" | "result" | "note">>) {
    const res = await fetch("/api/probe/mileage", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body, by: actor }) });
    // 저장한 뒤 다시 읽는다 — 백엔드가 돌려준 회차를 그대로 끼우면 앱 실측(응모·추첨 완료)과 좌석 규칙이 빠진 채 보였다(1013)
    if (res.ok) load();
  }

  const np = next ? prog(next) : null;
  const tp = todayRound ? prog(todayRound) : null;
  const dash = <span className="text-gray-500">—</span>;

  return (
    <>
      <PageHeader title="마일리지 추첨" description="수 · 금 11시 마감 · 마감 직후 추첨. 응모는 마감 3일 전에 열리고, 응모가 비면 추첨이 보류됩니다."
        actions={<>{data?.draft && <DraftBadge note={data.draft_note} />}{data && <a href={data.sheet_url} target="_blank" rel="noreferrer"><Button icon={<IconExternalLink />}>운영 시트</Button></a>}{data && <a href={`https://slack.com/app_redirect?channel=${data.slack_channel}`} target="_blank" rel="noreferrer"><Button icon={<IconBrandSlack />}>#{data.slack_channel}</Button></a>}<Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 읽기</Button></>} />

      {/* 응모·당첨은 앱 DB 실측으로 채운다. 그걸 못 읽었을 때만 사람이 시트를 본다 (1013 — 전에는 이 경고가 늘 떴다) */}
      {data && data.pool_source === "manual" && (
        <div className="mb-4">
          <Notice tone="amber" title="앱 기록(응모·당첨)을 읽지 못했습니다">
            「미확인」은 0 이 아니라 모름입니다. 이번 회차는 운영 시트의 &apos;응모풀&apos; 탭을 직접 확인해 회차 패널의 사람 확인 칸에 적어 주세요.
          </Notice>
        </div>
      )}

      {/* 이번 회차 — 예전에는 회차 표의 한 행일 뿐이라 「앱에 회차 만들기」 같은 할 일이 눈에 안 띄었다(1022 목업) */}
      {next && (
        <section className="bg-white rounded-[18px] border border-black/[0.05] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-24px_rgba(5,0,114,0.25)] p-4 mb-4" aria-label="이번 회차">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-gray-500">이번 회차</p>
              <p className="flex items-center gap-2 flex-wrap text-[20px] font-bold text-gray-900 tracking-[-0.02em] mt-1">{md(next.date)}({next.weekday}) 11:00 마감 <Chip tone="navy">D-{daysBetween(today, next.date)}</Chip></p>
              <p className="text-[13px] text-gray-600 mt-1">응모 {np ? <><b className="text-gray-900 tabular-nums">{np.entries}건</b> · {np.people}명</> : next.pool_count !== null ? `${next.pool_count}명(사람 확인)` : <Unknown />} · 확정 {next.seats.fixed} · 랜덤 {next.seats.random} · {next.prizes}</p>
              {todayRound && todayRound.id !== next.id && (
                <p className="flex items-center gap-1.5 flex-wrap text-[13px] text-gray-600 mt-1">오늘 {md(todayRound.date)}({todayRound.weekday}) <Chip tone={R_TONE[todayRound.result]}>{R_LABEL[todayRound.result]}</Chip> {tp ? `응모 ${tp.entries}건 · 당첨 ${tp.winners}명` : <>응모 <Unknown /></>}<button type="button" className="text-[#5558DD] font-medium hover:underline" onClick={() => setOpenId(todayRound.id)}>오늘 회차 보기</button></p>
              )}
            </div>
            <Button variant="primary" onClick={() => setOpenId(next.id)}>회차 열기</Button>
          </div>
          {np && np.entries === 0 && <WarnRow>응모가 0건입니다 — 이대로면 11시 마감 때 뽑을 게 없습니다</WarnRow>}
          {missing.map((r) => <WarnRow key={r.id} action={<Button size="sm" onClick={() => setOpenId(r.id)}>앱에 만들기</Button>}>{md(r.date)}({r.weekday}) 회차가 앱에 없습니다 — {md(openDateOf(r.date))}({weekdayOf(openDateOf(r.date))})에 응모가 열려야 합니다</WarnRow>)}
          {lost && <WarnRow action={data ? <a href={data.sheet_url} target="_blank" rel="noreferrer"><Button size="sm" icon={<IconExternalLink />}>운영 시트</Button></a> : undefined}>앱 기록을 못 읽어 다음 회차들이 앱에 있는지 확인할 수 없습니다</WarnRow>}
        </section>
      )}

      <div className="sat-stagger grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
        <Kpi label={`${monthNo}월 식사권 사용`} value={loading ? "-" : v ? usedInMonth.length : "미확인"} suffix={v ? `장 · ${usedStores}곳` : undefined}
          hint={!v ? "앱 기록을 못 읽었습니다" : `${md(payDate)} 정산 대상 · 시작부터 ${v.redeemed}/${v.issued}장 사용${v.issued ? `(${Math.round((v.redeemed / v.issued) * 100)}%)` : ""} · 안 쓰고 만료 ${v.expired}`} />
        <Kpi label="보류된 회차" value={loading ? "-" : held} tone="alert" hint={`${monthNo}월 · 응모가 비어 추첨 못 함`} />
        <Kpi label="7일 안 만료 식사권" value={loading ? "-" : v ? expiring.length : "미확인"} suffix={v ? "장" : undefined}
          hint={!v ? "앱 기록을 못 읽었습니다" : expiring.length ? `${md(expiring.map((x) => x.expires_at as string).sort()[0])}까지 · 당첨자에게 알리면 살릴 수 있습니다` : "지금 미사용 식사권은 모두 7일 넘게 남았습니다"} />
      </div>

      <Card flush className="mb-4" title={`${monthNo}월 회차`}
        description={`${month === "2026-09" ? "1주차 없음 · 4주차는 추석 적립분 몰아 방출 + 상품 2배 (0902 확정)" : "수 · 금 11:00 마감 · 행을 누르면 응모 · 식사권 · 결과를 봅니다"} · ${monthNo}월 추첨 완료 ${drawn}회${progress ? ` · 당첨 ${wins}명` : ""}`}
        actions={months.length > 1 ? <FilterPills soft label="달" value={month} onChange={setPickedMonth} options={months.map((m) => ({ key: m, label: `${Number(m.slice(5, 7))}월` }))} /> : undefined}>
        {loading ? <Skeleton rows={8} cols={5} /> : (
          <Table minWidth="44rem">
            <thead><tr><Th width="6rem">회차</Th><Th width="8rem">좌석</Th><Th width="11rem">상품</Th><Th width="7rem" align="right">응모 (앱)</Th><Th width="5rem" align="right">당첨</Th><Th width="5rem" align="right">사람 확인</Th><Th width="6.5rem">결과</Th><Th>메모</Th></tr></thead>
            <tbody>
              {monthRounds.map((r) => {
                const p = prog(r);
                const isNext = r.id === next?.id, isToday = r.date === today;
                const unreadable = lost && r.result !== "skipped";
                return (
                  <tr key={r.id} className={`${rowClickable} ${isNext || isToday ? "bg-navy/[0.03]" : ""}`} onClick={() => setOpenId(r.id)}>
                    <Td><span className="font-semibold text-gray-900 whitespace-nowrap">{md(r.date)} ({r.weekday})</span>{(isToday || isNext) && <span className="block text-[11px] text-navy font-semibold">{isToday ? "오늘" : "다음"}</span>}</Td>
                    <Td className="text-[12px] text-gray-600 whitespace-nowrap">확정 {r.seats.fixed} · 랜덤 {r.seats.random}</Td>
                    <Td className="text-[12px] text-gray-600 whitespace-nowrap">{r.result === "skipped" ? "—" : r.prizes}</Td>
                    {/* 앱 DB 실측 — 못 읽으면 「미확인」(모름), 읽었는데 없으면 0 · 「앱에 없음」. 사람이 적은 숫자와 섞지 않는다. */}
                    <Td align="right" numeric>
                      {p ? <><span className="font-semibold text-gray-900">{p.entries}</span>{p.people > 0 && <span className="block text-[11px] text-gray-500 font-normal">{p.people}명</span>}</>
                        : unreadable ? <Unknown why="앱 마일리지 기록을 읽지 못했습니다" /> : r.result === "scheduled" ? <Chip tone={missingIds.has(r.id) ? "amber" : "gray"}>앱에 없음</Chip> : dash}
                    </Td>
                    <Td align="right" numeric className="text-gray-700">{p ? p.winners : unreadable ? <Unknown /> : dash}</Td>
                    <Td align="right" numeric className="text-gray-600">{r.pool_count !== null ? r.pool_count : unreadable ? <Unknown /> : dash}</Td>
                    <Td><Chip tone={R_TONE[r.result]} dot={r.result === "held"}>{R_LABEL[r.result]}</Chip></Td>
                    <Td className="text-[12px] text-gray-500 truncate max-w-[16rem]">{r.note ?? ""}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <details className="group mb-4">
        <summary className="cursor-pointer text-[13px] font-semibold text-gray-800 py-2 select-none">규칙 <span className="font-normal text-gray-500">— 계약 v6 제8~10조 · #ops-mileage 결정</span></summary>
        <Card className="mt-2">
          {loading || !data ? <Skeleton rows={5} cols={1} /> : (
            <dl className="space-y-2.5 text-[12px]">
              {[["주기", data.rules.cadence], ["상품", data.rules.prizes], ["월 좌석", data.rules.seats_month], ["확정석", data.rules.fixed_rule], ["랜덤석", data.rules.random_rule], ["정산", data.rules.settle]].map(([k, val]) => (
                <div key={k as string}><dt className="text-gray-500">{k}</dt><dd className="text-gray-800 leading-relaxed">{val as string}</dd></div>
              ))}
              <div><dt className="text-gray-500">금지 표현</dt><dd className="flex flex-wrap gap-1 mt-1">{(data.rules.banned as string[]).map((b) => <span key={b} className="bg-red-50 text-red-700 rounded px-1.5 py-0.5">{b}</span>)}</dd></div>
            </dl>
          )}
        </Card>
      </details>
      <p className="text-[12px] text-gray-600 leading-relaxed">식사권 정산표(매장별 5,000원권 · 10,000원권 · 지급 완료 표시)는 <Chip tone="gray">개발 중</Chip> — 지금은 위 「식사권 사용」 장 수 · 매장 수와 운영 시트의 정산 탭으로 봅니다.</p>

      {open && <RoundPanel r={open} prog={prog(open)} onClose={() => setOpenId(null)} onPatch={patch} onCreated={load} />}
    </>
  );
}

/** 이번 회차 카드 안의 경고 줄 — 응모 0건 · 앱에 회차 없음 · 앱 기록 못 읽음. 할 일이 있으면 오른쪽에 버튼 */
function WarnRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-3 py-2 rounded-[10px] bg-amber-400/15 text-[13px] text-amber-900">
      <span className="inline-flex items-center gap-2"><IconAlertTriangle size={16} aria-hidden="true" />{children}</span>
      {action}
    </div>
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
    // 앱이 채우는 칸(응모 인원·추첨 완료)은 보내지 않는다 — 앱 값이 저장값을 덮어쓰지 않게
    try { await onPatch(r.id, { ...(r.pool_auto ? {} : { pool_count: pool.trim() === "" ? null : Math.max(0, parseInt(pool, 10) || 0) }), ...(r.result_auto ? {} : { result }), note: note.trim() || null }); onClose(); } finally { setSaving(false); }
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
        {r.pool_auto
          ? <Field label="응모 인원 (앱 자동 집계)" hint="앱 DB 에서 그날 응모한 사람 수를 자동으로 셉니다. 따로 확인하지 않아도 됩니다."><Input type="number" value={pool} readOnly disabled /></Field>
          : <Field label="응모 인원 (사람 확인 · 시트 기준)" hint="앱 기록을 못 읽을 때만 직접 적습니다. 비어 있으면 '미확인', 0 은 확인했는데 없다는 뜻입니다."><Input type="number" inputMode="numeric" value={pool} onChange={(e) => setPool(e.target.value)} placeholder="예: 42" /></Field>}
        {r.pool_checked_at && !r.pool_auto && <p className="text-[12px] text-gray-500">{r.pool_checked_by} 가 {new Date(r.pool_checked_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 에 확인</p>}
      </PanelSection>
      {prog && prog.vouchers.length > 0 && (
        <PanelSection title={`식사권 ${prog.vouchers.filter((x) => x.status === "REDEEMED").length}/${prog.vouchers.length} 사용`}>
          <ul className="space-y-1 text-[13px]">
            {prog.vouchers.map((x, i) => (
              <li key={x.coupon_code ?? i} className="flex items-center gap-2">
                <Chip tone={x.status === "REDEEMED" ? "green" : x.status === "EXPIRED" ? "red" : x.status === "ISSUED" ? "blue" : "gray"}>
                  {x.status === "REDEEMED" ? "사용" : x.status === "EXPIRED" ? "만료" : x.status === "ISSUED" ? "미사용" : "쿠폰 없음"}
                </Chip>
                <span className="text-gray-700 truncate">
                  {x.status === "REDEEMED"
                    ? `${x.restaurant_name ?? (x.restaurant_id ? `매장 ${x.restaurant_id}` : "매장 미상")}${x.redeemed_at ? ` · ${new Date(x.redeemed_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}` : ""}`
                    : x.expires_at ? `${new Date(x.expires_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 까지` : ""}
                </span>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
      <PanelSection title="결과">
        <Field label="회차 결과" hint={r.result_auto ? "앱에서 추첨이 끝나 당첨자가 생겨 자동으로 '추첨 완료'가 됐습니다." : undefined}><Select value={result} disabled={r.result_auto} onChange={(e) => setResult(e.target.value as Round["result"])}><option value="scheduled">예정</option><option value="drawn">추첨 완료</option><option value="held">보류 (응모풀 비어 있음 등)</option><option value="skipped">미운용 (정책상 없음)</option></Select></Field>
        <Field label="메모"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 당첨 2명, 시트 추첨기록 탭 반영" /></Field>
      </PanelSection>
      <p className="text-[12px] text-gray-500">응모 인원과 '추첨 완료'는 앱 DB 에서 자동으로 채워집니다. 앱 기록을 못 읽을 때만 직접 적습니다.</p>
    </SlideOver>
  );
}
