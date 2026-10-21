"use client";

import { useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Button, PageHeader } from "../_shared/ui";
import InsightsSummary from "./InsightsSummary";

/**
 * Probe · 인스타 추이 — 채널 전체 지표라 리포트 작업(매장 리포트)과 떼어 「지표」 묶음에 둔다(1022 목업, 기획팀 검토 1017 D3).
 * 예전에는 매장 리포트 화면 맨 아래에 붙어 있어 리포트 담당자가 안 보는 영역을 스크롤해야 했다.
 */
export default function InstaTrend() {
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);
  return (
    <>
      <PageHeader title="인스타 성과 추이" description="우주라이크 인스타 채널 전체의 발행 수 · 계정 도달 · 게시물 한 편 조회수입니다. 매장별 성과는 「매장 리포트」에서 봅니다."
        actions={<Button icon={<IconRefresh />} onClick={() => setKey((k) => k + 1)} disabled={loading}>다시 읽기</Button>} />
      <InsightsSummary reloadKey={key} onLoading={setLoading} />
    </>
  );
}
