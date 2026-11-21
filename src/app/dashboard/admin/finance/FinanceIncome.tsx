"use client";

import { useMemo, useState } from "react";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { periodOf, recentPeriods, won } from "@/lib/finance/calc";
import { INCOME_SOURCE_LABEL, type IncomeSource } from "@/lib/finance/types";
import { Button, Card, Chip, DraftBadge, Empty, FilterPills, Kpi, Notice, PageHeader, Select, Skeleton, Table, Td, Th, periodLocal } from "../_shared/ui";
import { useFinance } from "./useFinance";

/**
 * 재무 · 입금 내역 — **읽기 전용**.
 *
 * 입금을 찍는 곳은 Astro 하나다: 월 이용료는 「입금 현황」, 스팟 제작비는 「스팟 제작」.
 * 거기서 입금을 확인하면 이 목록에 그대로 올라온다. 여기서 새로 입금을 적는 길은 일부러 없다 —
 * 두 화면이 다른 숫자를 말하지 않게. 고칠 일이 있으면 아래 버튼으로 Astro 로 간다.
 */

const monthLabel = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;
type SourceFilter = "all" | IncomeSource;

export default function FinanceIncome({ onGo }: { onGo?: (tab: string) => void }) {
  const f = useFinance();
  const [period, setPeriod] = useState<string>("all");
  const [source, setSource] = useState<SourceFilter>("all");

  const periods = useMemo(() => recentPeriods(periodLocal(), 12).reverse(), []);
  const inPeriod = useMemo(() => f.income.filter((i) => period === "all" || periodOf(i.paid_on) === period), [f.income, period]);
  const rows = useMemo(() => inPeriod.filter((i) => source === "all" || i.source === source), [inPeriod, source]);
  const known = rows.filter((r) => r.amount !== null);
  const total = known.reduce((a, r) => a + (r.amount ?? 0), 0);
  // 매출은 공급가로 센다 — 받은 부가세는 다음 납부 때 나갈 돈이다
  const supply = known.reduce((a, r) => a + (r.supply ?? 0), 0);
  const tax = known.reduce((a, r) => a + (r.tax ?? 0), 0);
  const unknown = rows.length - known.length;
  const count = (s: SourceFilter) => (s === "all" ? inPeriod.length : inPeriod.filter((i) => i.source === s).length);

  return (
    <>
      <PageHeader
        title="입금 내역"
        description="Astro에서 입금을 확인하면 여기에 자동으로 올라옵니다. 이 화면에서는 고치지 않고 보기만 합니다."
        actions={<>{f.draft && <DraftBadge note="Astro 백엔드 기록이 아니라 임시 저장소를 보고 있습니다." />}<Button icon={<IconRefresh />} onClick={f.reload} disabled={f.loading}>다시 읽기</Button></>}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44"><Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="월"><option value="all">전체 기간</option>{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</Select></div>
          <FilterPills<SourceFilter> label="구분" value={source} onChange={setSource} soft options={[{ key: "all", label: "전체", count: count("all") }, { key: "invoice", label: INCOME_SOURCE_LABEL.invoice, count: count("invoice") }, { key: "spot", label: INCOME_SOURCE_LABEL.spot, count: count("spot") }]} />
        </div>
      </PageHeader>

      {f.incomeError && <div className="mb-4"><Notice tone="red" title="입금 내역을 읽지 못했습니다">{f.incomeError} 비어 있는 것이 아니라 못 읽은 것입니다.</Notice></div>}

      <div className="sat-stagger grid grid-cols-2 xl:grid-cols-4 gap-2.5 mb-4">
        <Kpi label="입금(공급가)" value={f.incomeError ? "-" : won(supply)} hint={f.incomeError ? undefined : `통장 합계 ${won(total)} · ${period === "all" ? "전체 기간" : monthLabel(period)}`} />
        <Kpi label="받은 부가세" value={f.incomeError ? "-" : won(tax)} hint="매출이 아니라 납부할 돈(예수금)" />
        <Kpi label="입금 건수" value={f.incomeError ? "-" : rows.length} suffix="건" hint={known.length === rows.length ? undefined : `금액을 아는 ${known.length}건만 합산`} />
        <Kpi label="금액 미정" value={f.incomeError ? "-" : unknown} suffix="건" tone="alert" hint={unknown ? "스팟 제작 가격이 비어 있음" : "모든 입금의 금액을 압니다"} />
      </div>

      {unknown > 0 && (
        <div className="mb-4"><Notice tone="amber" title={`금액을 모르는 입금 ${unknown}건은 합계에 넣지 않았습니다`}>스팟 제작 건에 가격이 비어 있으면 정가가 매장(파트너 여부)에 따라 달라 여기서는 알 수 없습니다. 스팟 제작에서 가격을 적으면 합계에 들어옵니다.</Notice></div>
      )}

      <Card flush title={`입금 ${rows.length}건`} actions={<div className="flex gap-1.5"><Button size="sm" icon={<IconExternalLink />} onClick={() => onGo?.("astro-billing")}>입금 현황</Button><Button size="sm" icon={<IconExternalLink />} onClick={() => onGo?.("astro-spots")}>스팟 제작</Button></div>}>
        {f.loading && !f.income.length ? <Skeleton rows={6} cols={4} /> : rows.length === 0 ? (
          <Empty title="이 조건의 입금이 없습니다" detail="Astro에서 입금을 확인한 건만 올라옵니다. 청구는 나갔는데 입금이 안 찍혔다면 입금 현황에서 확인하세요." />
        ) : (
          <Table minWidth="44rem">
            <thead><tr><Th width="5rem">날짜</Th><Th>내용</Th><Th width="7rem">구분</Th><Th width="8rem" align="right">공급가</Th><Th width="7rem" align="right">세액</Th><Th width="9rem" align="right">입금액</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="text-[12px] text-gray-600 whitespace-nowrap">{r.paid_on.slice(2).replace(/-/g, ".")}</Td>
                  <Td><span className="font-semibold text-gray-900">{r.name}</span>{r.detail && <span className="block text-[12px] text-gray-500">{r.detail}</span>}</Td>
                  <Td><Chip tone={r.source === "invoice" ? "blue" : "navy"}>{INCOME_SOURCE_LABEL[r.source]}</Chip></Td>
                  <Td align="right" numeric className="text-gray-700">{r.supply === null ? "—" : won(r.supply)}</Td>
                  <Td align="right" numeric className="text-gray-500">{r.tax === null ? "—" : won(r.tax)}</Td>
                  <Td align="right" numeric className="font-semibold text-gray-900">{r.amount === null ? <Chip tone="amber">금액 미정</Chip> : won(r.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
