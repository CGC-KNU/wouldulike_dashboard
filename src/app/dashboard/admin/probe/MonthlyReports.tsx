"use client";

import { useEffect, useMemo, useState } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import { campusOfMetric, previousPeriod } from "@/lib/draft/storeMetrics";
import type { StoreMetric } from "@/lib/draft/types";
import { Button, Card, Chip, Empty, Skeleton, Table, Td, Th } from "../_shared/ui";
import { PlanTag, TagChip } from "./kit";

/**
 * Probe · 매장 리포트 · 매장 월간 보고서 탭 (1022 목업).
 *
 * 사장님께 보내는 지난달 앱 기록을 매장마다 여는 곳이다. 예전에는 매장 지표 표 안의 작은 링크였다.
 * 이 탭에서 하는 일은 「보냈나」 확인이라 숫자(쿠폰 · 스탬프)는 두지 않는다 — 사장님께 내보내는 자리에 22곳 숫자가 나란히 있으면
 * 캡처 한 장이 동종 매장 비교 자료가 된다(두 계약 모두 금지). 숫자는 보고서 본문과 매장 지표에서 본다.
 *
 * 「보냄 · 안 만듦」 상태와 계약 판(PDF · 전자 약관 v4)은 아직 기록이 없다(개발 중) — 못 읽은 값을 지어내지 않고 칸을 비워 둔다.
 */
export default function MonthlyReports() {
  const [stores, setStores] = useState<StoreMetric[] | null>(null);
  useEffect(() => { fetch("/api/probe/overview").then((r) => r.json()).then((d) => setStores(d.stores ?? [])).catch(() => setStores([])); }, []);
  const month = previousPeriod();
  const monthNo = Number(month.slice(5, 7));
  const list = useMemo(() => (stores ?? []).filter((s) => s.is_affiliate && !s.hidden_from_app).sort((a, b) => campusOfMetric(a).localeCompare(campusOfMetric(b), "ko") || a.name.localeCompare(b.name, "ko")), [stores]);
  return (
    <>
      <Card flush title={`${monthNo}월 매장 월간 보고서`}
        description={`사장님께 보내는 지난달 앱 기록입니다. 앱에서 숨긴 매장은 뺐습니다${stores ? ` · ${list.length}곳` : ""}`}
        actions={<a href="/r/partners" target="_blank" rel="noreferrer" title="모든 제휴 매장에 같은 내용으로 보내는 앱 전체 보고서"><Button size="sm" icon={<IconExternalLink />}>가게 공통 보고서</Button></a>}>
        {!stores ? <Skeleton rows={6} cols={4} /> : list.length === 0 ? <Empty title="보고서를 낼 매장이 없습니다" detail="매장 목록을 못 읽었거나 앱에 보이는 제휴 매장이 없습니다." /> : (
          <Table minWidth="40rem">
            <thead><tr><Th>매장</Th><Th width="6rem">캠퍼스</Th><Th width="7.5rem">상태</Th><Th width="9rem" align="right">보고서</Th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.restaurant_id}>
                  <Td><span className="inline-flex items-center gap-1.5"><span className="font-semibold text-gray-900">{s.name}</span><PlanTag tier={s.tier} /></span></Td>
                  <Td className="text-[12px] text-gray-600">{campusOfMetric(s)}</Td>
                  <Td><TagChip>보냄 기록 없음</TagChip></Td>
                  <Td align="right"><a href={`/r/store/${s.restaurant_id}?month=${month}`} target="_blank" rel="noreferrer" title="사장님께 보낼 지난달 앱 기록 — 미리보기 위 띠에서 PNG · HTML"><Button size="sm" icon={<IconExternalLink />}>{monthNo}월 보고서</Button></a></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-[12px] text-gray-600 mt-3 leading-relaxed">
        매장마다 숫자를 나란히 두지 않습니다 — 이 화면을 캡처하면 동종 매장 비교 자료가 됩니다(두 계약 모두 금지). 숫자는 보고서 본문과 매장 지표에서 봅니다. <Chip tone="gray">보냄 기록 · 계약 판 · 개발 중</Chip>
      </p>
    </>
  );
}
