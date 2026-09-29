"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBuildingStore, IconPlus, IconRefresh, IconSearch } from "@tabler/icons-react";
import { Button, Card, Chip, Empty, FilterPills, Input, PageHeader, Segmented, Skeleton, Table, Td, Th, type ChipTone } from "../_shared/ui";
import { allCampuses } from "./CampusPicker";
import OnboardLink from "./OnboardLink";
import OnboardReconcile from "./OnboardReconcile";
import SpecialApprovals from "./SpecialApprovals";
import CampusMark from "./CampusMark";
import NewStorePanel from "./NewStorePanel";
import EndContractButton from "./EndContractButton";

/**
 * 파트너 계약 — **매장 추가 → 링크 발급 → 계약 → 반영** 한 사이클을 한 화면에서.
 *
 * 파트너 매장 탭에도 발급 버튼은 그대로 둔다(매장 하나를 붙들고 일할 때는 거기가 맞다).
 * 여기는 **사이클이 어디서 멈춰 있는지**를 보는 자리다 — 링크를 냈는데 안 들어오신 사장님,
 * 동의만 하고 혜택을 안 넣은 매장, 끝났는데 매장에 반영이 안 된 건.
 *
 * 상태를 저장하는 곳이 없어 흔적으로 되짚는다(api/onboard/board 머리말).
 * 원장(시트) 조회가 느려 **이 화면에서만** 읽는다.
 */

type Stage = "후보" | "미발급" | "대기" | "동의" | "완료" | "승인대기" | "종이계약";

interface Row {
  rid: number | null; name: string; campus: string | null; tier: string | null; fee: number | null;
  owner_phone: string | null; stage: Stage; at: string | null; todo: string | null; blocked: string | null;
  lead_id: string | null; lead_stage: string | null; is_test?: boolean;
  conflicts?: { field: string; label: string; ours: string; theirs: string }[];
  check?: Check | null;
  entered_email?: string | null;
}
interface Check { pin: boolean; photos: string[]; stamp: { on: boolean; target: number | null; steps: { at: number; reward: string }[]; notes?: string }; coupons: { title: string; subtitle: string }[]; special: { title: string; subtitle: string; active?: boolean }[] }

/** 등록 현황 칩 — 한눈에 무엇이 비었는지 (민열님 0929) */
function CheckChips({ c, email }: { c: Check; email?: string | null }) {
  const items: [string, boolean, string][] = [
    ["PIN", c.pin, ""],
    ["사진", c.photos.length > 0, c.photos.length ? `${c.photos.length}장` : ""],
    ["스탬프", c.stamp.on, c.stamp.steps.length ? `${c.stamp.steps.length}단계` : ""],
    ["쿠폰", c.coupons.length > 0, c.coupons.length ? `${c.coupons.length}개` : ""],
    ["특별쿠폰", c.special.length > 0, c.special.length ? `${c.special.length}개` : ""],
    ["이메일", Boolean(email), ""],
  ];
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map(([k, ok, n]) => (
        <span key={k} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>{ok ? "✓" : "–"} {k}{n ? ` ${n}` : ""}</span>
      ))}
    </div>
  );
}

/** [상세] 팝업 — 사장님이 적은 값과 등록한 혜택·사진 전부 */
function DetailModal({ rid, name, onClose }: { rid: number; name: string; onClose: () => void }) {
  const [d, setD] = useState<{ entered: Record<string, string | number | null> | null; check: Check } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/onboard/detail?rid=${rid}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr(`불러오지 못했습니다 (${e})`));
  }, [rid]);
  const e = d?.entered;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (<div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0"><span className="w-24 shrink-0 text-gray-500">{k}</span><span className="text-gray-900 break-all">{v || <span className="text-gray-300">—</span>}</span></div>);
  const when = (x: unknown) => (x ? new Date(String(x)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`${name} 온보딩 상세`} onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 text-[13px]" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between mb-3"><p className="text-[16px] font-bold text-gray-900">{name}</p><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-[13px]">닫기</button></div>
        {err && <p className="text-red-600">{err}</p>}
        {!d && !err && <p className="text-gray-400">불러오는 중…</p>}
        {d && (<>
          <p className="text-[12px] font-semibold text-gray-500 mb-1">사장님이 적은 값</p>
          {e ? (<div className="mb-4">
            <Row k="대표자" v={e.owner_name as string} /><Row k="사업자번호" v={e.biz_no as string} /><Row k="휴대폰" v={e.phone as string} /><Row k="이메일" v={e.email as string} />
            <Row k="플랜" v={`${e.plan ?? ""}${e.fee ? ` · 월 ${Number(e.fee).toLocaleString()}원` : ""}`} /><Row k="개시일" v={e.starts_on as string} />
            <Row k="키트 받을 곳" v={e.kit_address as string} /><Row k="서명" v={e.signature as string} />
            <Row k="동의 시각" v={when(e.consent_at)} /><Row k="완료 시각" v={when(e.done_at)} />
          </div>) : <p className="text-gray-400 mb-4">아직 동의 기록이 없습니다.</p>}
          <p className="text-[12px] font-semibold text-gray-500 mb-1">등록한 것</p>
          <div className="mb-3"><CheckChips c={d.check} email={(e?.email as string) || null} /></div>
          <Row k="스탬프" v={d.check.stamp.on ? d.check.stamp.steps.map((x) => `${x.at}개 → ${x.reward}`).join(" · ") + (d.check.stamp.notes ? ` (${d.check.stamp.notes})` : "") : ""} />
          <Row k="쿠폰" v={d.check.coupons.map((c) => `${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}`).join(" · ")} />
          <Row k="특별 쿠폰" v={d.check.special.map((c) => `${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}${c.active === false ? " · 승인 대기" : ""}`).join(" · ")} />
          <div className="mt-3"><p className="text-gray-500 mb-1.5">사진 {d.check.photos.length}장</p>
            <div className="flex gap-2 flex-wrap">{d.check.photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-200" /></a>)}</div>
          </div>
        </>)}
      </div>
    </div>
  );
}

/** 후보 탭의 칩과 같은 색 — 두 탭에서 같은 단어가 다른 색이면 다른 뜻으로 읽힌다 */
const LEAD_TONE: Record<string, ChipTone> = { "구두 합의": "amber", "계약 완료": "green", 보류: "gray", 재컨택: "amber", 거절: "red" };

const TONE: Record<Stage, ChipTone> = { 승인대기: "amber", 완료: "green", 동의: "blue", 대기: "navy", 후보: "amber", 미발급: "gray", 종이계약: "gray" };
const HELP: Record<Stage, string> = {
  승인대기: "사장님 등록이 끝났습니다 — 확인하고 승인하면 매장에 들어갑니다",
  완료: "계약·혜택·키트까지 끝났습니다",
  동의: "계약에 동의하셨고 혜택 등록이 남았습니다",
  대기: "링크를 냈고 사장님이 아직 안 여셨습니다",
  후보: "매장을 아직 안 만들었습니다 — 만들면 바로 링크를 낼 수 있습니다",
  미발급: "아직 링크를 내지 않았습니다",
  종이계약: "온보딩 이전에 종이로 계약한 매장입니다",
};

export default function ContractBoard({ actor, onGo }: { actor: string; onGo?: (tab: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ledgerOn, setLedgerOn] = useState(true);
  const [filter, setFilter] = useState<Stage | "all">("all");
  /**
   * 캠퍼스 필터 + 검색 (민열님 0928). 캠퍼스 목록은 행에 실제로 있는 값에서 만든다 —
   * 상권이 하나 늘면 필터도 저절로 는다. 후보·매장 탭과 같은 규칙(allCampuses).
   */
  const [campus, setCampus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * 매장 추가를 **이 탭 안에서** 한다 (민열님 0923 인계 §3).
   * 전에는 파트너 매장 탭으로 보냈다 — 거기서 만들고 다시 여기로 돌아와 그 매장을 찾아야 했다.
   * 팀원이 실제로 하는 일은 "추가 → 링크 발급 → 문안 전달" 한 줄인데 화면이 그 줄을 끊고 있었다.
   */
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState<{ rid: number; name: string } | null>(null);
  /** '후보' 행에서 매장 만들기 — 후보 탭의 "계약·매장 탭으로 보내기" 와 같은 경로(convert) */
  const [making, setMaking] = useState<string | null>(null);
  const [makeErr, setMakeErr] = useState<Record<string, string>>({});
  /**
   * 행 단위 반영 (민열님 0929: "승인대기에 반영하는 버튼이 없고 일괄 반영밖에 안 되잖아").
   * 빈 칸 채우기·제휴/플랜·후보 단계는 [반영하기] 한 번. 값이 다른 칸은 칸마다 고른다 — 기계가 덮지 않는다.
   */
  const [applying, setApplying] = useState<number | null>(null);
  const [detailOf, setDetailOf] = useState<{ rid: number; name: string } | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<number, { ok: boolean; text: string }>>({});
  async function applyRow(r: Row) {
    if (r.rid === null) return;
    setApplying(r.rid);
    try {
      const res = await fetch("/api/onboard/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rids: [r.rid] }) });
      const j = (await res.json().catch(() => ({}))) as { applied?: { summary: string }[]; failed?: { detail: string }[]; detail?: string };
      const f = j.failed?.[0];
      setRowMsg((m) => ({ ...m, [r.rid!]: f ? { ok: false, text: `승인하지 못했습니다 — ${f.detail}` } : res.ok ? { ok: true, text: j.applied?.[0]?.summary ? `승인했습니다 — ${j.applied[0].summary}` : "승인할 것이 없었습니다." } : { ok: false, text: j.detail ?? `실패 (${res.status})` } }));
      load();
    } catch { setRowMsg((m) => ({ ...m, [r.rid!]: { ok: false, text: "서버에 연결하지 못했습니다." } })); }
    finally { setApplying(null); }
  }
  async function takeOwnerValue(r: Row, c: { field: string; label: string; ours: string }) {
    if (r.rid === null) return;
    const v = c.field === "monthly_fee" ? Number(c.ours) : c.ours;
    const res = await fetch(`/api/astro/stores/${r.rid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [c.field]: v, updated_by: `${actor} · 온보딩 값 채택` }) });
    setRowMsg((m) => ({ ...m, [r.rid!]: res.ok ? { ok: true, text: `${c.label}을(를) 사장님 값으로 바꿨습니다.` } : { ok: false, text: `${c.label} 을(를) 바꾸지 못했습니다 (${res.status}).` } }));
    load();
  }

  async function makeStore(r: Row) {
    if (!r.lead_id) return;
    setMaking(r.lead_id); setMakeErr((m) => ({ ...m, [r.lead_id!]: "" }));
    try {
      const res = await fetch("/api/astro/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: r.lead_id, tier: r.tier, updated_by: actor }) });
      const d = (await res.json().catch(() => ({}))) as { detail?: string; restaurant_id?: number };
      if (!res.ok) { setMakeErr((m) => ({ ...m, [r.lead_id!]: d.detail ?? `만들지 못했습니다 (${res.status}).` })); return; }
      if (d.restaurant_id) setJustAdded({ rid: d.restaurant_id, name: r.name });
      load();
    } catch { setMakeErr((m) => ({ ...m, [r.lead_id!]: "서버에 연결하지 못했습니다." })); }
    finally { setMaking(null); }
  }

  const load = useCallback(() => {
    setBusy(true);
    fetch("/api/onboard/board", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: Row[]; count?: Record<string, number>; ledger_on?: boolean } | null) => {
        setRows(j?.rows ?? []); setLedgerOn(j?.ledger_on !== false);
      })
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const campuses = useMemo(() => allCampuses((rows ?? []).map((r) => r.campus)), [rows]);
  const countIn = (c: string) => (rows ?? []).filter((r) => (r.campus ?? "") === c).length;
  const scoped = useMemo(() => {
    const q = search.trim();
    return (rows ?? []).filter((r) => (campus === "all" || (r.campus ?? "") === campus) && (!q || [r.name, r.owner_phone, r.lead_stage, r.stage, r.tier].some((v) => v?.includes(q))));
  }, [rows, campus, search]);
  const visible = useMemo(() => scoped.filter((r) => filter === "all" || r.stage === filter), [scoped, filter]);
  const countOf = (st: Stage) => scoped.filter((r) => r.stage === st).length;
  const stages: Stage[] = ["승인대기", "대기", "동의", "완료", "후보", "미발급", "종이계약"];

  return (
    <>
      <PageHeader
        title="파트너 계약"
        description="매장을 추가하고, 링크를 내고, 사장님이 계약·혜택 등록을 마치기까지. 어디서 멈춰 있는지 봅니다."
        actions={
          <>
            <Button icon={<IconRefresh size={16} />} disabled={busy} onClick={load}>{busy ? "읽는 중…" : "새로고침"}</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>매장 추가</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<string> label="캠퍼스" value={campus} onChange={setCampus} options={[...campuses.map((c) => ({ key: c, label: `${c} ${countIn(c)}`, icon: <CampusMark campus={c} size={15} /> })), { key: "all", label: "전체" }]} />
          <div className="relative flex-1 min-w-[12rem] max-w-xs ml-auto">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="매장, 연락처, 단계" aria-label="계약 현황 검색" className="pl-8" />
          </div>
        </div>
      </PageHeader>

      {!ledgerOn && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <b>온보딩 원장(시트)이 설정되지 않았습니다.</b> 동의·완료 여부를 읽을 수 없어 링크 발급 여부만 보입니다.
        </div>
      )}

      {/* 승인이 먼저다 — 사장님은 등록했다고 생각하는데 앱에는 안 나가고 있는 상태라 제일 급하다 */}
      <SpecialApprovals onDone={load} />
      <OnboardReconcile onDone={load} />

      <Card flush title={`매장 ${visible.length}곳`}
        actions={
          <FilterPills
            label="단계"
            value={filter}
            onChange={(v) => setFilter(v as Stage | "all")}
            options={[{ key: "all", label: "전체", count: scoped.length }, ...stages.filter((s) => countOf(s)).map((s) => ({ key: s, label: s, count: countOf(s) }))]}
          />
        }>
        {rows === null ? <Skeleton rows={6} cols={5} /> : visible.length === 0 ? (
          <Empty
            title={search.trim() ? `'${search.trim()}' 에 맞는 매장이 없습니다` : filter === "all" ? (campus === "all" ? "계약 사이클에 올라온 매장이 없습니다" : `${campus} 에는 아직 없습니다`) : `'${filter}' 단계인 매장이 없습니다`}
            detail={search.trim() ? "검색어를 지우거나 다른 캠퍼스를 눌러 보세요." : filter === "all" ? "파트너 후보에서 구두 합의가 되거나, 여기서 매장을 추가하고 링크를 내면 나타납니다." : "다른 단계를 눌러 보세요."}
          />
        ) : (
          <Table minWidth="48rem">
            <thead>
              <tr><Th>매장</Th><Th width="7rem">영업</Th><Th width="7rem">온보딩</Th><Th width="8rem">플랜</Th><Th width="10rem">대표자 연락처</Th><Th>다음 할 일</Th><Th width="6.5rem" align="right"><span className="sr-only">동작</span></Th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.rid ?? `lead:${r.lead_id}`} className="border-t border-gray-100 align-top">
                  <Td>
                    <div className="flex items-center gap-1.5 min-w-[9rem]">
                      {r.campus && <CampusMark campus={r.campus} size={14} />}
                      <span className="font-semibold text-gray-900 break-keep">{r.name}</span>
                      {r.is_test && <Chip tone="gray">테스트</Chip>}
                      {r.rid !== null && <span className="text-gray-400 text-[11.5px]">{r.rid}</span>}
                    </div>
                    {r.at && <span className="block text-[11.5px] text-gray-400 mt-0.5">{new Date(r.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                  </Td>
                  {/* 영업 단계(후보 탭)와 온보딩 단계(이 탭)를 나란히 — "후보에선 계약 완료인데 여긴 미발급" 이 그대로 보인다 */}
                  <Td>{r.lead_stage ? <Chip tone={LEAD_TONE[r.lead_stage] ?? "gray"}>{r.lead_stage}</Chip> : <span className="text-gray-300" title="파트너 후보에 이어진 건이 없습니다">-</span>}</Td>
                  <Td><Chip tone={TONE[r.stage]}>{r.stage}</Chip></Td>
                  <Td>{r.tier === "FREE" ? <span className="text-gray-500">무료</span> : <span className="font-semibold text-gray-900">{r.tier === "CONTENT" ? "Premium" : r.tier ?? "-"}{r.fee ? ` · ${r.fee.toLocaleString()}원` : ""}</span>}</Td>
                  <Td>{r.owner_phone ?? <span className="text-amber-700 text-[12px]">대표자 휴대폰 없음<span className="block text-gray-400">번호 확인 없이 발급됩니다</span></span>}</Td>
                  <Td>
                    <p className="text-[12.5px] text-gray-600">{r.todo ?? HELP[r.stage]}</p>
                    {r.blocked && <p className="text-[11.5px] text-gray-400 mt-0.5">{r.blocked}</p>}
                    {r.check && <CheckChips c={r.check} email={r.entered_email} />}
                    {r.rid !== null && (r.stage === "동의" || r.stage === "완료" || r.stage === "승인대기") && (
                      <button type="button" className="mt-1 text-[12px] text-navy font-semibold underline" onClick={() => setDetailOf({ rid: r.rid!, name: r.name })}>상세 — 사장님이 적은 값·등록한 혜택 보기</button>
                    )}
                    {r.rid !== null && (r.stage === "승인대기" || (r.conflicts?.length ?? 0) > 0) && (
                      <div className="mt-1.5 space-y-1.5">
                        {r.stage === "승인대기" && <Button size="sm" variant="primary" disabled={applying === r.rid} onClick={() => applyRow(r)}>{applying === r.rid ? "승인 중…" : "승인"}</Button>}
                        {(r.conflicts ?? []).map((c) => (
                          <div key={c.field} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">
                            <b>{c.label}</b> — 지금 <span className="font-mono">{c.theirs}</span> · 사장님 <span className="font-mono">{c.ours}</span>
                            <button type="button" className="ml-2 underline font-semibold" onClick={() => takeOwnerValue(r, c)}>사장님 값으로</button>
                          </div>
                        ))}
                        {rowMsg[r.rid] && <p className={`text-[11.5px] ${rowMsg[r.rid].ok ? "text-navy" : "text-red-600"}`} role="status">{rowMsg[r.rid].text}</p>}
                      </div>
                    )}
                    {r.stage === "후보" && (
                      <div className="mt-1.5">
                        <Button size="sm" variant="primary" icon={<IconBuildingStore size={13} />} disabled={making === r.lead_id} onClick={() => makeStore(r)}>{making === r.lead_id ? "만드는 중…" : "매장 만들기"}</Button>
                        {r.lead_id && makeErr[r.lead_id] && <p className="text-[11.5px] text-red-600 mt-1">{makeErr[r.lead_id]}</p>}
                      </div>
                    )}
                    {r.rid !== null && (r.stage === "미발급" || r.stage === "대기") && (
                      <div className="mt-1.5">
                        {/* lid 를 실어 보내야 사장님이 온보딩을 마칠 때 후보 단계가 '계약 완료' 로 올라간다 */}
                        <OnboardLink rid={r.rid} lid={r.lead_id} name={r.name} campus={r.campus ?? "경북대"} tier={r.tier} fee={r.fee} ownerPhone={r.owner_phone} actor={actor} autoOpen={justAdded?.rid === r.rid} />
                      </div>
                    )}
                  </Td>
                  <Td align="right">{r.rid !== null && <EndContractButton rid={r.rid} name={r.name} actor={actor} onDone={load} compact />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {justAdded && (
        <p className="text-[12px] text-navy font-semibold mt-2">
          「{justAdded.name}」 을(를) 추가했습니다 — 아래 목록에서 링크 발급 칸이 열려 있습니다.
        </p>
      )}
      <p className="text-[11.5px] text-gray-400 mt-2">
        <b>영업</b>은 파트너 후보의 단계이고 <b>온보딩</b>은 이 탭이 흔적으로 되짚은 것입니다 — 임시 PIN 이 남아 있으면 <b>대기</b>, 온보딩 원장에 기록이 있으면 <b>동의·완료</b>. 사장님이 온보딩을 마치면 영업 단계도 <b>계약 완료</b>로 올라갑니다.
        <b>종료</b>는 제휴를 끄고 종료일을 남깁니다(삭제가 아닙니다 — 파트너 매장의 '계약 종료' 칸에서 되돌립니다).
        매장 정보 수정과 발급은 <button type="button" className="underline" onClick={() => onGo?.("astro-ops")}>파트너 매장</button> 에서도 그대로 됩니다. · {actor}
      </p>
      {detailOf && <DetailModal rid={detailOf.rid} name={detailOf.name} onClose={() => setDetailOf(null)} />}
      {adding && (
        <NewStorePanel
          actor={actor}
          campus="경북대"
          campusOptions={["경북대", "영남대", "계명대"]}
          onClose={() => setAdding(false)}
          onCreated={(made) => { setJustAdded(made); load(); }}
        />
      )}
    </>
  );
}
