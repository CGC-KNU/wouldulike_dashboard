"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCamera } from "@tabler/icons-react";
import { Button } from "../_shared/ui";

/**
 * 월별 스냅샷 카드 — **말일이 지나면 그 달은 영영 못 되돌린다.**
 *
 * 백엔드는 `*_this_month` 만 준다. 다음 달 1일이 되는 순간 9월 숫자를 물어볼 자리가 없어진다.
 * 그래서 남은 날을 세어 보여 주고, 말일이 가까울수록 눈에 띄게 한다.
 * 이미 떴으면 조용히 접힌다 — 늘 떠 있는 배너는 아무도 안 본다.
 */

interface Status {
  ok: boolean; reason?: string; period: string; taken: number; days_left: number;
  periods: { period: string; stores: number }[]; last_at: string | null;
}

export default function MonthlySnapshot() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/astro/snapshot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j: Status | null) => setSt(j)).catch(() => setSt(null));
  }, []);
  useEffect(load, [load]);

  const take = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/astro/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await r.json().catch(() => ({}))) as { written?: number; failed?: string[]; total?: number; detail?: string };
      if (!r.ok) throw new Error(j.detail ?? `실패 (${r.status})`);
      setMsg(`${j.written}곳 기록했습니다${j.failed?.length ? ` · 지표를 못 읽은 ${j.failed.length}곳: ${j.failed.join(", ")}` : ""}.`);
      load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  if (!st?.ok) return null;
  const urgent = st.taken === 0 && st.days_left <= 7;
  // 이미 떴고 급하지도 않으면 안 그린다
  if (st.taken > 0 && !msg) return null;

  return (
    <div className={`mb-3 rounded-xl border px-3 py-2.5 ${urgent ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className={`text-[13px] font-semibold ${urgent ? "text-amber-900" : "text-gray-900"}`}>
            {st.taken > 0 ? `${st.period} 스냅샷 · ${st.taken}곳 기록됨` : `${st.period} 스냅샷을 아직 안 떴습니다`}
          </p>
          {st.taken === 0 && (
            <p className={`text-[12px] mt-0.5 ${urgent ? "text-amber-800" : "text-gray-600"}`}>
              쿠폰 사용·스탬프 적립·재방문·단골 수를 매장별로 박아 둡니다. 백엔드는 <b>이번 달 값만</b> 주기 때문에,
              달이 넘어가면 {st.period} 숫자는 되돌릴 수 없습니다 — 다음 달 리포트의 &ldquo;전월 대비&rdquo;가 사라집니다.
              {st.days_left === 0 ? <b> 오늘이 말일입니다.</b> : <> 말일까지 <b>{st.days_left}일</b> 남았습니다.</>}
            </p>
          )}
        </div>
        <Button size="sm" variant={urgent ? "primary" : "secondary"} icon={<IconCamera size={15} />} disabled={busy} onClick={take}>
          {busy ? "뜨는 중…" : st.taken > 0 ? "다시 뜨기" : "지금 뜨기"}
        </Button>
      </div>
      {msg && <p className="text-[12px] text-gray-700 mt-1.5">{msg}</p>}
      {st.taken === 0 && st.days_left > 0 && (
        <p className="text-[11px] text-gray-400 mt-1">말일에 다시 뜨면 그 값이 쓰입니다 — 미리 떠 두셔도 손해가 없습니다.</p>
      )}
    </div>
  );
}
