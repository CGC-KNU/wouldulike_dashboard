"use client";

import { useEffect, useState } from "react";
import type { CampusesDoc } from "@/lib/hubble";
import { Card, Chip, Notice, PageHeader, Skeleton, Table, Td, Th } from "../_shared/ui";

/**
 * 허블 · 이번 주 변동 (1010). 첫 주간 수집 전까지는 데이터 상태판 — 무엇을 언제 어디서 받았고, 무엇이 빠졌는지.
 * 주간 갱신(일요일 03:00, 인허가 변동분)이 붙으면 신규 · 폐업 · 폐업 의심 목록이 여기 쌓인다(명세 C절).
 */
export default function HubbleWatch() {
  const [m, setM] = useState<CampusesDoc | null | undefined>(undefined);
  useEffect(() => { fetch("/api/hubble/campuses", { cache: "no-store" }).then((r) => r.json()).then((d) => setM(d.data ?? null)).catch(() => setM(null)); }, []);
  if (m === undefined) return <Skeleton rows={6} cols={4} />;
  if (!m) return <Notice tone="amber" title="허블 데이터가 아직 없습니다">수집 배치가 처음 한 번 돌아야 합니다.</Notice>;
  const pass = m.items.filter((c) => !c.below), below = m.items.filter((c) => c.below);
  return (
    <>
      <PageHeader title="이번 주 변동" description="매장 데이터를 언제 받았고 무엇이 바뀌었는지. 주간 자동 갱신(일요일 03:00)이 붙으면 신규 · 폐업이 여기 쌓입니다." />
      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Card title="마지막 수집"><p className="text-[20px] font-extrabold tabular-nums">{m.built_at}</p><p className="text-[12px] text-gray-500">전국 첫 적재 · 주간 변동분은 다음 단계</p></Card>
        <Card title="파트너 상권"><p className="text-[20px] font-extrabold tabular-nums">{pass.length}</p><p className="text-[12px] text-gray-500">정문 1km 영업 중 {m.cut}곳 이상</p></Card>
        <Card title="기준 미달"><p className="text-[20px] font-extrabold tabular-nums">{below.length}</p><p className="text-[12px] text-gray-500">지도에서 뺌 · 검색엔 회색 한 줄</p></Card>
        <Card title="좌표 없는 캠퍼스"><p className="text-[20px] font-extrabold tabular-nums">{m.no_coord.length}</p><p className="text-[12px] text-gray-500">주소로 위치를 못 찾음 — 사람 보정</p></Card>
      </div>
      <Card title="받은 곳"><ul className="text-[13px] text-gray-700 list-disc pl-5">{m.sources.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="text-[12px] text-gray-500 mt-2">정문 좌표는 아직 캠퍼스 대표 좌표(위키데이터 · OpenStreetMap)입니다. 정문으로 보정하면 1km 안 매장 수가 달라질 수 있습니다.</p></Card>
      <div className="grid gap-3 lg:grid-cols-2 mt-4">
        <Card title={`좌표를 못 찾은 캠퍼스 ${m.no_coord.length}곳`} flush>
          <Table minWidth="28rem"><thead><tr><Th>학교</Th><Th>캠퍼스</Th><Th>주소</Th></tr></thead><tbody>
            {m.no_coord.map((c) => <tr key={c.id}><Td>{c.name}</Td><Td>{c.branch}</Td><Td className="text-[12px] text-gray-500">{c.addr}</Td></tr>)}
          </tbody></Table>
        </Card>
        <Card title={`기준 미달 ${below.length}곳 (식당 적은 순)`} flush>
          <div className="max-h-96 overflow-auto"><Table minWidth="24rem"><thead><tr><Th>학교</Th><Th>시도</Th><Th align="right">영업 중</Th></tr></thead><tbody>
            {[...below].sort((a, b) => a.n - b.n).map((c) => <tr key={c.key}><Td>{c.name} {c.branch !== "본교" && <Chip tone="gray">{c.branch}</Chip>}</Td><Td className="text-[12px] text-gray-500">{c.sido}</Td><Td align="right" numeric>{c.n}</Td></tr>)}
          </tbody></Table></div>
        </Card>
      </div>
    </>
  );
}
