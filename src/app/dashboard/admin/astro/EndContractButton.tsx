"use client";

import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { CHURN_REASONS, CHURN_REASON_LABEL, type ChurnReason } from "@/lib/finance/types";
import { Button, Select } from "../_shared/ui";

/**
 * 행에서 바로 계약 종료 (민열님 0928: "파트너 볼 수 있는 탭이면 어디서든").
 *
 * 앱에 바로 보이는 변화라 두 번 누르게 한다 — 누르면 같은 자리에 [종료] [취소] 가 열린다.
 * 브라우저 confirm 은 안 쓴다(화면을 막고, 자동화도 막는다).
 * 삭제가 아니다: 제휴를 끄고 종료일을 남길 뿐이라 파트너 매장 탭 '계약 종료' 칸에서 되돌릴 수 있다.
 * 해지 사유(폐업 · 자발 · 결제 실패 · 기타)를 같이 고른다(1122) — 재무 현황의 유지율 · 이탈이 여기서 나온다.
 */
export default function EndContractButton({ rid, name, actor, onDone, compact }: { rid: number; name: string; actor: string; onDone?: () => void; compact?: boolean }) {
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<ChurnReason | "">("");
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/astro/stores/${rid}/end-contract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor, reason }) });
      const d = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) { setErr(d.detail ?? `종료하지 못했습니다 (${res.status}).`); return; }
      setArm(false);
      onDone?.();
    } catch { setErr("서버에 연결하지 못했습니다."); }
    finally { setBusy(false); }
  }

  // 표 행 안에 있으므로 행 클릭(상세 열기)으로 새지 않게 막는다
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!arm) {
    return (
      <span onClick={stop} className="inline-flex flex-col items-end gap-0.5">
        <Button size="sm" variant="secondary" icon={<IconX size={13} />} onClick={() => setArm(true)} aria-label={`${name} 계약 종료`}>{compact ? "종료" : "계약 종료"}</Button>
        {err && <span className="text-[11px] text-red-600 text-right max-w-[14rem]">{err}</span>}
      </span>
    );
  }
  return (
    <span onClick={stop} className="inline-flex flex-col items-end gap-1">
      <span className="text-[11.5px] text-gray-700">앱에서 혜택이 바로 사라집니다.</span>
      <span className="inline-flex gap-1">
        <span className="w-28"><Select value={reason} onChange={(e) => setReason(e.target.value as ChurnReason | "")} aria-label="해지 사유"><option value="">사유 고르기</option>{CHURN_REASONS.map((r) => <option key={r} value={r}>{CHURN_REASON_LABEL[r]}</option>)}</Select></span>
        <Button size="sm" variant="danger" disabled={busy || !reason} onClick={run}>{busy ? "종료 중…" : "종료"}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setArm(false)}>취소</Button>
      </span>
      {err && <span className="text-[11px] text-red-600 text-right max-w-[14rem]">{err}</span>}
    </span>
  );
}
