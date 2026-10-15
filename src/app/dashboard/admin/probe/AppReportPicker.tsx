"use client";

import { useMemo, useState } from "react";
import { IconChartBar, IconTable } from "@tabler/icons-react";
import { Button, FilterPills, Input, Segmented, surface } from "../_shared/ui";
import { DATA_FROM, dashed, defaultRange, kstToday, parseDay, parseRange, rangeLabel, rangePresets, rangeQuery, UNIT_LABEL, type RangeUnit } from "@/lib/draft/appRange";

/**
 * 앱 지표 보고서 뽑기 — 기간과 단위를 고르고 보고서를 새 탭에서 연다(민찬 1015).
 *
 * 예전의 「주간 보고서」·「월간 보고서」 두 버튼을 대신한다. 주 단위 칸은 주간 보고서, 월 단위 칸은 월간 보고서와
 * 같은 숫자라, 지난 주·달을 끊김 없이 이어서 본다. 기간 → 칸 계산은 보고서 라우트와 같은 함수(appRange)라
 * 여기서 미리 보여 주는 「○칸」이 보고서와 어긋나지 않는다.
 */

type PresetKey = string;

const UNITS: { key: RangeUnit; label: string }[] = (["day", "week", "month"] as RangeUnit[]).map((u) => ({ key: u, label: UNIT_LABEL[u] }));

export default function AppReportPicker() {
  const today = kstToday();
  const presets = useMemo(() => rangePresets(today), [today]);
  const init = defaultRange(today);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [unit, setUnit] = useState<RangeUnit>(init.unit);
  const [preset, setPreset] = useState<PresetKey>("12w");

  const parsed = parseRange({ start, end, unit }, today);
  const q = rangeQuery({ start, end, unit });

  const choose = (key: PresetKey) => {
    const p = presets.find((x) => x.key === key);
    if (!p) return;
    setPreset(key);
    setStart(p.start);
    setEnd(p.end);
    setUnit(p.unit);
  };
  const custom = () => setPreset("custom");

  return (
    <section className={`${surface} px-4 py-3.5 mb-4`} aria-label="앱 지표 보고서 뽑기">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12px] font-semibold text-gray-700 w-14 shrink-0">보고서</span>
          <FilterPills label="빠른 선택" options={presets.map((p) => ({ key: p.key, label: p.label }))} value={preset} onChange={choose} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12px] font-semibold text-gray-700 w-14 shrink-0">기간</span>
          <Input type="date" aria-label="시작" className="!w-[9.5rem]" min={dashed(DATA_FROM)} max={dashed(today)} value={dashed(start)}
            onChange={(e) => { const d = parseDay(e.target.value); if (d) { setStart(d); custom(); } }} />
          <span className="text-gray-400">~</span>
          <Input type="date" aria-label="끝" className="!w-[9.5rem]" min={dashed(DATA_FROM)} max={dashed(today)} value={dashed(end)}
            onChange={(e) => { const d = parseDay(e.target.value); if (d) { setEnd(d); custom(); } }} />
          <Segmented label="단위" options={UNITS} value={unit} onChange={(u) => { setUnit(u); custom(); }} />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {/* 서버가 그 자리에서 칸마다 센다(스냅샷 없음) — 처음 뽑는 기간은 10~20초. 지난 칸은 캐시돼 다음부터 빠르다 */}
            {parsed.ok ? (
              <>
                <a href={`/r/app/key?${q}`} target="_blank" rel="noreferrer" title="중요한 지표만 그래프로 — 마지막 칸과 그 앞 칸 대비">
                  <Button variant="primary" icon={<IconChartBar />}>주요 지표 보고서</Button>
                </a>
                <a href={`/r/app/raw?${q}`} target="_blank" rel="noreferrer" title="모든 지표를 칸마다 늘어놓은 표 — CSV 로도 받습니다">
                  <Button icon={<IconTable />}>지표 보고서 원본</Button>
                </a>
              </>
            ) : (
              <>
                <Button variant="primary" icon={<IconChartBar />} disabled>주요 지표 보고서</Button>
                <Button icon={<IconTable />} disabled>지표 보고서 원본</Button>
              </>
            )}
          </div>
        </div>
        <p className={`text-[12px] ${parsed.ok ? "text-gray-500" : "text-red-600"}`} role={parsed.ok ? undefined : "alert"}>
          {parsed.ok
            ? `${rangeLabel(parsed.spec)}${parsed.spec.adjusted ? " — 단위의 경계(주 = 월~일, 월 = 1일~말일)로 맞췄습니다" : ""} · 주 단위 칸은 주간 보고서, 월 단위 칸은 월간 보고서와 같은 숫자입니다`
            : parsed.error}
        </p>
      </div>
    </section>
  );
}
