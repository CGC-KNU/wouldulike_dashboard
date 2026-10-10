"use client";

import { useEffect, useMemo, useState } from "react";
import type { CampusesDoc, ChangeKind, ChangesDoc } from "@/lib/hubble";
import { Card, Chip, type ChipTone, FilterPills, Input, Notice, PageHeader, Select, Skeleton, Table, Td, Th } from "../_shared/ui";

/**
 * 허블 · 이번 주 변동 (1011). 주간 갱신(일요일 03:00, 백엔드 .github/workflows/hubble-weekly.yml)이
 * 지난주와 비교해 `hubble:changes` 에 쌓은 신규 오픈 · 폐업 · 상호 변경을 보여 준다. 아래는 데이터 상태판.
 */
const TONE: Record<ChangeKind, ChipTone> = {
  "신규 오픈": "green", "새로 잡힘": "blue", 폐업: "red", 빠짐: "amber", "상호 변경": "navy", "업태 변경": "gray",
  "기준 통과": "green", "기준 미달": "amber", "정문 보정": "gray",
};
const ORDER: ChangeKind[] = ["신규 오픈", "폐업", "상호 변경", "업태 변경", "빠짐", "새로 잡힘", "기준 통과", "기준 미달", "정문 보정"];

/** 다음 일요일 03:00 KST */
function nextRun() {
  const now = new Date(Date.now() + 9 * 3600e3);
  const dow = now.getUTCDay();
  const add = dow === 0 && now.getUTCHours() < 3 ? 0 : 7 - dow;
  const d = new Date(now.getTime() + add * 864e5);
  return `${d.getUTCMonth() + 1}-${String(d.getUTCDate()).padStart(2, "0")}(일) 03:00`;
}

export default function HubbleWatch() {
  const [m, setM] = useState<CampusesDoc | null | undefined>(undefined);
  const [ch, setCh] = useState<ChangesDoc | null | undefined>(undefined);
  const [wi, setWi] = useState(0);
  const [kind, setKind] = useState<ChangeKind | "all">("all");
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/hubble/campuses", { cache: "no-store" }).then((r) => r.json()).then((d) => setM(d.data ?? null)).catch(() => setM(null));
    fetch("/api/hubble/changes", { cache: "no-store" }).then((r) => r.json()).then((d) => setCh(d.data ?? null)).catch(() => setCh(null));
  }, []);
  const week = ch?.weeks?.[wi];
  const rows = useMemo(() => (week?.items ?? []).filter((x) => (kind === "all" || x.kind === kind) && (!q.trim() || (x.cn + x.n).includes(q.trim()))), [week, kind, q]);
  if (m === undefined || ch === undefined) return <Skeleton rows={6} cols={4} />;
  if (!m) return <Notice tone="amber" title="허블 데이터가 아직 없습니다">수집 배치가 처음 한 번 돌아야 합니다.</Notice>;
  const pass = m.items.filter((c) => !c.below), below = m.items.filter((c) => c.below);

  return (
    <>
      <PageHeader title="이번 주 변동" description="매주 일요일 03:00에 행안부 인허가를 다시 받아 지난주와 비교합니다. 새로 연 곳 · 닫은 곳 · 이름 바꾼 곳이 여기 쌓입니다." />
      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Card title="마지막 갱신"><p className="text-[20px] font-extrabold tabular-nums">{m.built_at}</p><p className="text-[12px] text-gray-500">다음 {nextRun()}</p></Card>
        <Card title="이번 변동"><p className="text-[20px] font-extrabold tabular-nums">{week ? week.total.toLocaleString() : "—"}</p><p className="text-[12px] text-gray-500">{week ? `신규 오픈 ${week.count["신규 오픈"] ?? 0} · 폐업 ${week.count["폐업"] ?? 0}` : "첫 주간 갱신 전"}</p></Card>
        <Card title="파트너 상권"><p className="text-[20px] font-extrabold tabular-nums">{pass.length}</p><p className="text-[12px] text-gray-500">정문 1km 영업 중 {m.cut}곳 이상 · 미달 {below.length}</p></Card>
        <Card title="좌표 없는 캠퍼스"><p className="text-[20px] font-extrabold tabular-nums">{m.no_coord.length}</p><p className="text-[12px] text-gray-500">주소로 위치를 못 찾음 — 정문 보정 대기</p></Card>
      </div>

      {!week ? (
        <Notice tone="blue" title="아직 쌓인 변동이 없습니다">첫 주간 갱신({nextRun()})이 돌면 지난주와 비교한 목록이 여기 나옵니다.</Notice>
      ) : week.first ? (
        <Notice tone="blue" title={`${week.built_at} 첫 적재`}>비교할 지난주 데이터가 없어 변동을 세지 않았습니다. 다음 주부터 쌓입니다.</Notice>
      ) : (
        <Card title={`${week.built_at} 갱신 · 변동 ${week.total.toLocaleString()}건${week.cut ? ` (화면엔 앞 ${week.items.length.toLocaleString()}건)` : ""}`} flush>
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-black/[0.05]">
            {ch && ch.weeks.length > 1 && (
              <Select aria-label="주" value={String(wi)} onChange={(e) => { setWi(Number(e.target.value)); setKind("all"); }} className="w-auto">
                {ch.weeks.map((w, i) => <option key={w.built_at} value={i}>{w.built_at}</option>)}
              </Select>
            )}
            <FilterPills label="변화 종류" value={kind} onChange={setKind}
              options={[{ key: "all" as const, label: "전체", count: week.total }, ...ORDER.filter((k) => week.count[k]).map((k) => ({ key: k, label: k, count: week.count[k] }))]} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상권 · 매장 이름" className="ml-auto w-48" />
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <Table minWidth="40rem"><thead><tr><Th>변화</Th><Th>상권</Th><Th>매장</Th><Th>업태</Th><Th align="right">정문</Th><Th>비고</Th></tr></thead><tbody>
              {rows.slice(0, 500).map((x, i) => (
                <tr key={`${x.c}${x.id}${x.kind}${i}`}>
                  <Td><Chip tone={TONE[x.kind] ?? "gray"}>{x.kind}</Chip></Td>
                  <Td className="text-[12.5px]">{x.cn}</Td>
                  <Td className="font-semibold">{x.n}</Td>
                  <Td className="text-[12px] text-gray-500">{x.cat || "—"}</Td>
                  <Td align="right" numeric>{x.d != null ? `${x.d}m` : ""}</Td>
                  <Td className="text-[12px] text-gray-500">{x.prev ? `이전: ${x.prev}` : x.at ? `폐업일 ${x.at}` : x.kind === "빠짐" ? "폐업 기록 없이 빠짐(휴업 · 좌표 삭제 등)" : ""}</Td>
                </tr>))}
              {rows.length === 0 && <tr><Td className="text-gray-400">조건에 맞는 변동이 없습니다.</Td></tr>}
            </tbody></Table>
          </div>
          {rows.length > 500 && <p className="text-[12px] text-gray-500 p-3">앞 500건만 보입니다 — 종류나 이름으로 좁히세요.</p>}
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2 mt-4">
        <Card title={`좌표를 못 찾은 캠퍼스 ${m.no_coord.length}곳`} flush>
          <Table minWidth="28rem"><thead><tr><Th>학교</Th><Th>캠퍼스</Th><Th>주소</Th></tr></thead><tbody>
            {m.no_coord.map((c) => <tr key={c.id}><Td>{c.name}</Td><Td>{c.branch}</Td><Td className="text-[12px] text-gray-500">{c.addr}</Td></tr>)}
            {m.no_coord.length === 0 && <tr><Td className="text-gray-400">모두 찾았습니다.</Td></tr>}
          </tbody></Table>
        </Card>
        <Card title={`기준 미달 ${below.length}곳 (식당 적은 순)`} flush>
          <div className="max-h-96 overflow-auto"><Table minWidth="24rem"><thead><tr><Th>학교</Th><Th>시도</Th><Th align="right">영업 중</Th></tr></thead><tbody>
            {[...below].sort((a, b) => a.n - b.n).map((c) => <tr key={c.key}><Td>{c.name} {c.branch !== "본교" && <Chip tone="gray">{c.branch}</Chip>}</Td><Td className="text-[12px] text-gray-500">{c.sido}</Td><Td align="right" numeric>{c.n}</Td></tr>)}
          </tbody></Table></div>
        </Card>
      </div>
      <p className="text-[11.5px] text-gray-400 mt-3">출처: {m.sources.join(" · ")}</p>
    </>
  );
}
