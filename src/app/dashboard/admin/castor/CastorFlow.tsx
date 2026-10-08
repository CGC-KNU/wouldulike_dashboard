"use client";

import { Card, Chip, Notice, PageHeader, Skeleton } from "../_shared/ui";
import { useCastorHealth } from "./useCastor";

/**
 * Castor · 흐름 (1단계, 1008). 과업 = 퍼널. GA4 최근 7일(확정 테이블), **기기 단위**.
 * 단계 k = 앞 단계를 모두 거치고, 직전 단계보다 늦게 이 이벤트가 있었던 기기 수.
 * 쿠폰 사용 · 스탬프 같은 드문 전환은 A/B 대신 이 막대를 주 단위로 보고, 배포 전후로 비교한다(기획안 6절).
 */
export default function CastorFlow() {
  const h = useCastorHealth();

  return (
    <>
      <PageHeader title="흐름" description="과업 하나 = 퍼널 하나. GA4 최근 7일, 기기 단위로 셉니다." />
      {h === undefined ? <Skeleton rows={5} cols={4} /> : !h?.ok ? (
        <Notice tone="amber" title="GA4 를 아직 못 읽었습니다">{h?.reason ?? "BigQuery 연결을 확인해 주세요."}</Notice>
      ) : (
        <>
          <p className="text-[12.5px] text-gray-500 mb-3">{h.window?.from} ~ {h.window?.to} (확정 테이블) · 출시본은 setUserId 를 안 불러 기기 단위로만 이어집니다(이벤트의 {h.user_id_share ?? 0}% 에 user_id).</p>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
            {h.flows.map((f) => {
              const top = Math.max(1, f.steps[0]?.devices ?? 0);
              const worst = f.steps.slice(1).reduce<{ i: number; r: number } | null>((acc, s, i) => {
                const prev = f.steps[i].devices; const r = prev ? s.devices / prev : 0;
                return !acc || r < acc.r ? { i: i + 1, r } : acc;
              }, null);
              return (
                <Card key={f.key} title={f.title} description={worst && f.steps[0].devices ? `가장 크게 빠지는 곳: ${f.steps[worst.i - 1].label} → ${f.steps[worst.i].label} (${Math.round(worst.r * 100)}%)` : "이 기간 시작 단계가 없습니다"}>
                  <ol className="space-y-2.5">
                    {f.steps.map((s, i) => {
                      const prev = i ? f.steps[i - 1].devices : null;
                      const rate = prev ? Math.round((s.devices / prev) * 100) : null;
                      return (
                        <li key={s.event}>
                          <div className="flex items-baseline justify-between gap-2 text-[13px]">
                            <span className="font-semibold text-gray-900">{i + 1}. {s.label}</span>
                            <span className="tabular-nums text-gray-700">{s.devices.toLocaleString()}대{rate !== null && <span className={`ml-1.5 text-[12px] ${rate < 30 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{rate}%</span>}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-navy" style={{ width: `${Math.max(2, (s.devices / top) * 100)}%` }} /></div>
                          <span className="font-mono text-[10.5px] text-gray-400">{s.event}</span>
                        </li>
                      );
                    })}
                  </ol>
                </Card>
              );
            })}
          </div>
          <Card title="화면 기록(screen_view)" description="라우트 이름이 있어야 화면 이동을 셉니다. '(이름 없음)'이 많으면 지도 이동량을 못 그립니다 — 0단계 재민 인계 항목.">
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
              {h.screen_views.map((s) => <li key={s.screen} className="flex justify-between gap-2"><span className={s.screen === "(이름 없음)" ? "text-red-600 font-semibold" : "font-mono text-gray-800"}>{s.screen}</span><span className="tabular-nums text-gray-600">{s.views.toLocaleString()}</span></li>)}
              {h.screen_views.length === 0 && <li className="text-gray-500"><Chip tone="red">0건</Chip> 이 기간 screen_view 가 하나도 없습니다.</li>}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
