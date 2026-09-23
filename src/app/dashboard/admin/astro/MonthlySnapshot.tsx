"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 월별 스냅샷 상태 — **떠 있는지만 본다. 여기서 뜨지 않는다.**
 *
 * 굳히는 일은 백엔드가 한다(`dashboard/services/metric_snapshots.py`, GitHub Actions 가 매일 호출).
 * 0923 에 내가 시트로 같은 걸 만들었다가 지웠다 — 같은 숫자를 두 곳에서 세면 언젠가 갈라진다.
 *
 * 그럼 이 카드는 왜 남기나: **자동이 멈춘 걸 아무도 모르는 게 제일 위험하다.** 달이 넘어가면
 * 그 달 숫자는 되살릴 수 없는데, 크론이 조용히 죽어 있으면 다음 달 리포트를 만들 때서야 안다.
 * 그래서 이번 달이 안 굳어 있으면 말한다. 굳어 있으면 조용히 접힌다.
 */

interface Snap { period: string; complete: boolean; counted_at: string }
interface Resp { current?: Snap | null; previous?: Snap | null; detail?: string }

const seoulPeriod = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);

export default function MonthlySnapshot() {
  const [state, setState] = useState<{ ok: boolean; snap: Snap | null } | null>(null);

  const load = useCallback(() => {
    const period = seoulPeriod();
    fetch(`/api/dashboard/metric-snapshots?period=${period}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Resp | null) => setState({ ok: Boolean(j), snap: j?.current ?? null }))
      .catch(() => setState(null));
  }, []);
  useEffect(load, [load]);

  // 못 읽었으면 아무 말도 하지 않는다 — 백엔드가 잠깐 안 될 때마다 경고를 띄우면 아무도 안 본다
  if (!state?.ok) return null;
  const snap = state.snap;
  const period = seoulPeriod();

  // 굳어 있으면 조용히
  if (snap && snap.counted_at) {
    const hours = (Date.now() - Date.parse(snap.counted_at)) / 3_600_000;
    if (hours < 48) return null;
    return (
      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
        <b>{period} 스냅샷이 {Math.floor(hours / 24)}일째 갱신되지 않았습니다.</b> 매일 도는 자동 집계가 멈췄을 수 있습니다 —
        GitHub Actions 의 <code>metric-snapshots</code> 워크플로를 확인해 주세요. 달이 넘어가면 이 달 숫자는 되살릴 수 없습니다.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
      <p className="text-[13px] font-semibold text-amber-900">{period} 지표 스냅샷이 아직 없습니다</p>
      <p className="text-[12px] text-amber-800 mt-0.5">
        쿠폰·스탬프·재방문·단골 수는 <b>이번 달 누계만</b> 조회됩니다. 달이 넘어가면 {period} 값을 되살릴 수 없어
        다음 달 리포트의 &ldquo;전월 대비&rdquo;가 비어 버립니다. 매일 도는 자동 집계
        (<code>metric-snapshots</code> 워크플로)가 멈췄는지 확인해 주세요.
      </p>
    </div>
  );
}
