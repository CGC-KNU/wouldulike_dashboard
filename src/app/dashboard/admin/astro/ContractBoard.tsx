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

type Stage = "후보" | "미발급" | "대기" | "동의" | "완료" | "반영대기" | "종이계약";

interface Row {
  rid: number | null; name: string; campus: string | null; tier: string | null; fee: number | null;
  owner_phone: string | null; stage: Stage; at: string | null; todo: string | null; blocked: string | null;
  lead_id: string | null; lead_stage: string | null; is_test?: boolean;
}

/** 후보 탭의 칩과 같은 색 — 두 탭에서 같은 단어가 다른 색이면 다른 뜻으로 읽힌다 */
const LEAD_TONE: Record<string, ChipTone> = { "구두 합의": "amber", "계약 완료": "green", 보류: "gray", 재컨택: "amber", 거절: "red" };

const TONE: Record<Stage, ChipTone> = { 반영대기: "amber", 완료: "green", 동의: "blue", 대기: "navy", 후보: "amber", 미발급: "gray", 종이계약: "gray" };
const HELP: Record<Stage, string> = {
  반영대기: "등록은 끝났는데 매장에 값이 안 들어갔습니다",
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
  const stages: Stage[] = ["반영대기", "대기", "동의", "완료", "후보", "미발급", "종이계약"];

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
