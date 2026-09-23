"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, Empty, FilterPills, PageHeader, Skeleton, Table, Td, Th, type ChipTone } from "../_shared/ui";
import OnboardLink from "./OnboardLink";
import OnboardReconcile from "./OnboardReconcile";
import SpecialApprovals from "./SpecialApprovals";
import CampusMark from "./CampusMark";

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

type Stage = "미발급" | "대기" | "동의" | "완료" | "반영대기" | "종이계약";

interface Row {
  rid: number; name: string; campus: string | null; tier: string | null; fee: number | null;
  owner_phone: string | null; stage: Stage; at: string | null; todo: string | null; blocked: string | null;
}

const TONE: Record<Stage, ChipTone> = { 반영대기: "amber", 완료: "green", 동의: "blue", 대기: "navy", 미발급: "gray", 종이계약: "gray" };
const HELP: Record<Stage, string> = {
  반영대기: "등록은 끝났는데 매장에 값이 안 들어갔습니다",
  완료: "계약·혜택·키트까지 끝났습니다",
  동의: "계약에 동의하셨고 혜택 등록이 남았습니다",
  대기: "링크를 냈고 사장님이 아직 안 여셨습니다",
  미발급: "아직 링크를 내지 않았습니다",
  종이계약: "온보딩 이전에 종이로 계약한 매장입니다",
};

export default function ContractBoard({ actor, onGo }: { actor: string; onGo?: (tab: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [count, setCount] = useState<Record<string, number>>({});
  const [ledgerOn, setLedgerOn] = useState(true);
  const [filter, setFilter] = useState<Stage | "all">("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    fetch("/api/onboard/board", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: Row[]; count?: Record<string, number>; ledger_on?: boolean } | null) => {
        setRows(j?.rows ?? []); setCount(j?.count ?? {}); setLedgerOn(j?.ledger_on !== false);
      })
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const visible = useMemo(() => (rows ?? []).filter((r) => filter === "all" || r.stage === filter), [rows, filter]);
  const stages: Stage[] = ["반영대기", "대기", "동의", "완료", "미발급", "종이계약"];

  return (
    <>
      <PageHeader
        title="파트너 계약"
        description="매장을 추가하고, 링크를 내고, 사장님이 계약·혜택 등록을 마치기까지. 어디서 멈춰 있는지 봅니다."
        actions={
          <>
            <Button icon={<IconRefresh size={16} />} disabled={busy} onClick={load}>{busy ? "읽는 중…" : "새로고침"}</Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => onGo?.("astro-ops")}>매장 추가</Button>
          </>
        }
      />

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
            options={[{ key: "all", label: "전체", count: rows?.length ?? 0 }, ...stages.filter((s) => count[s]).map((s) => ({ key: s, label: s, count: count[s] }))]}
          />
        }>
        {rows === null ? <Skeleton rows={6} cols={5} /> : visible.length === 0 ? (
          <Empty
            title={filter === "all" ? "계약 사이클에 올라온 매장이 없습니다" : `'${filter}' 단계인 매장이 없습니다`}
            detail={filter === "all" ? "파트너 매장에서 매장을 추가하고 온보딩 링크를 내면 여기에 나타납니다." : "다른 단계를 눌러 보세요."}
          />
        ) : (
          <Table minWidth="48rem">
            <thead>
              <tr><Th>매장</Th><Th width="7rem">단계</Th><Th width="8rem">플랜</Th><Th width="10rem">대표자 연락처</Th><Th>다음 할 일</Th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.rid} className="border-t border-gray-100 align-top">
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {r.campus && <CampusMark campus={r.campus} size={14} />}
                      <span className="font-semibold text-gray-900">{r.name}</span>
                      <span className="text-gray-400 text-[11.5px]">{r.rid}</span>
                    </div>
                    {r.at && <span className="block text-[11.5px] text-gray-400 mt-0.5">{new Date(r.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                  </Td>
                  <Td><Chip tone={TONE[r.stage]}>{r.stage}</Chip></Td>
                  <Td>{r.tier === "FREE" ? <span className="text-gray-500">무료</span> : <span className="font-semibold text-gray-900">{r.tier === "CONTENT" ? "Premium" : r.tier ?? "-"}{r.fee ? ` · ${r.fee.toLocaleString()}원` : ""}</span>}</Td>
                  <Td>{r.owner_phone ?? <span className="text-amber-700">없음 — 본인 확인 불가</span>}</Td>
                  <Td>
                    <p className="text-[12.5px] text-gray-600">{r.todo ?? HELP[r.stage]}</p>
                    {r.blocked && <p className="text-[11.5px] text-gray-400 mt-0.5">{r.blocked}</p>}
                    {(r.stage === "미발급" || r.stage === "대기") && (
                      <div className="mt-1.5">
                        <OnboardLink rid={r.rid} name={r.name} campus={r.campus ?? "경북대"} tier={r.tier} fee={r.fee} ownerPhone={r.owner_phone} actor={actor} />
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-[11.5px] text-gray-400 mt-2">
        단계는 저장된 값이 아니라 흔적으로 되짚은 것입니다 — 임시 PIN 이 남아 있으면 <b>대기</b>, 온보딩 원장에 기록이 있으면 <b>동의·완료</b>.
        매장 정보 수정과 발급은 <button type="button" className="underline" onClick={() => onGo?.("astro-ops")}>파트너 매장</button> 에서도 그대로 됩니다. · {actor}
      </p>
    </>
  );
}
