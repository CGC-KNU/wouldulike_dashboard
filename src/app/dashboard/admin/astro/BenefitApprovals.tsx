"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconExternalLink, IconX } from "@tabler/icons-react";
import { Button, Card, Chip, FilterPills, PageHeader, Spinner, Textarea, focusRing } from "../_shared/ui";

/**
 * 혜택 변경 신청 처리 (민열님 0924).
 *
 * ## 이 화면이 없으면 무슨 일이 나나
 * 점주 화면에서 혜택을 고치면 그 자리에서 앱에 반영됐다. 우리가 모르는 사이에 손님에게 나가는
 * 약속이 바뀐다. 그래서 신청만 받고, 값이 바뀌는 건 여기서 누를 때다.
 *
 * ## 승인이 하는 일과 **하지 않는 일**
 * 승인은 매장 운영 기록(쿠폰·스탬프 칸)을 신청값으로 바꾼다.
 * 앱 카탈로그(실제로 발급되는 쿠폰 줄)까지 같이 바꾸지는 **않는다** — 그건 매장별 혜택 편집 화면의 일이고,
 * 쿠폰 종류·금액·유효기간이 걸려 있어 한 칸 문자열로 자동 변환할 수 없다.
 * 그래서 승인 카드는 그 매장의 혜택 편집 화면으로 가는 길을 옆에 둔다. 감추면 반드시 잊는다.
 *
 * ## 신청 뒤 우리가 그 칸을 고쳤다면
 * 백엔드가 `overwrote` 로 **승인 직전 값**을 돌려준다. 조용히 덮으면 우리 수정이 사라지므로
 * 그 사실을 화면에 남긴다.
 */

type Status = "PENDING" | "APPROVED" | "REJECTED";

interface Req {
  id: number;
  restaurant_id: number;
  store_name: string;
  field: string;
  field_label: string;
  before: string;
  after: string;
  note: string;
  status: Status;
  requested_by: string;
  created_at: string | null;
  decided_by: string;
  decided_at: string | null;
  decision_note: string;
}

const TONE: Record<Status, { label: string; tone: "amber" | "green" | "gray" }> = {
  PENDING: { label: "대기", tone: "amber" },
  APPROVED: { label: "승인", tone: "green" },
  REJECTED: { label: "거절", tone: "gray" },
};

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function BenefitApprovals({ onGo }: { onGo?: (tab: string) => void }) {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Status | "all">("PENDING");
  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(0);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/astro/benefit-requests", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.detail ?? "신청을 읽지 못했습니다.");
      setRows(Array.isArray(d.requests) ? d.requests : []);
    } catch (e) {
      setRows(null);
      setErr(e instanceof Error ? e.message : "신청을 읽지 못했습니다.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(r: Req, action: "approve" | "reject") {
    setBusy(r.id); setErr(""); setFlash("");
    try {
      const res = await fetch(`/api/astro/benefit-requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.detail ?? "처리하지 못했습니다.");
      setFlash(
        action === "reject"
          ? `${r.store_name} · ${r.field_label} 신청을 거절했습니다.`
          : d.overwrote
            ? `승인했습니다. 승인 직전 값은 「${d.overwrote}」였고 신청값으로 덮었습니다 — 의도한 게 맞는지 확인해 주세요.`
            : `승인했습니다. 앱에 나가는 쿠폰은 「${r.store_name}」 혜택 편집에서 바꿔 주세요.`,
      );
      setOpenId(null); setNote("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally { setBusy(0); }
  }

  const counts = {
    PENDING: rows?.filter((r) => r.status === "PENDING").length ?? 0,
    APPROVED: rows?.filter((r) => r.status === "APPROVED").length ?? 0,
    REJECTED: rows?.filter((r) => r.status === "REJECTED").length ?? 0,
  };
  const shown = (rows ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div>
      <PageHeader
        title="혜택 변경 신청"
        description="사장님이 올린 혜택 변경입니다. 승인해야 반영됩니다 — 올린다고 바뀌지 않습니다."
        actions={<Button variant="secondary" size="sm" onClick={load}>새로고침</Button>}
      >
        <FilterPills
          label="상태"
          value={filter}
          onChange={setFilter}
          options={[
            { key: "PENDING" as const, label: "대기", count: counts.PENDING },
            { key: "APPROVED" as const, label: "승인", count: counts.APPROVED },
            { key: "REJECTED" as const, label: "거절", count: counts.REJECTED },
            { key: "all" as const, label: "전체", count: rows?.length ?? 0 },
          ]}
        />
      </PageHeader>

      {flash && <p className="text-[13px] text-gray-800 bg-amber-50 border border-amber-200 rounded-[12px] px-3.5 py-2.5 mb-4">{flash}</p>}
      {err && <p role="alert" className="text-[13px] text-red-700 bg-red-50 rounded-[12px] px-3.5 py-2.5 mb-4">{err}</p>}

      {rows === null ? (
        /* 못 읽었으면 '없다'고 말하지 않는다 — 오류 줄만 남기고 목록 자리는 비운다. */
        err ? null : <div className="flex justify-center py-12"><Spinner size={18} /></div>
      ) : shown.length === 0 ? (
        <Card>
          <p className="text-[13px] text-gray-500 py-6 text-center">
            {filter === "PENDING" ? "처리할 신청이 없습니다." : "해당하는 신청이 없습니다."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => (
            <div key={r.id} className="bg-white rounded-[12px] border border-black/[0.06] p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip tone={TONE[r.status].tone}>{TONE[r.status].label}</Chip>
                <span className="text-[13.5px] font-bold text-gray-900">{r.store_name || `매장 ${r.restaurant_id}`}</span>
                <span className="text-[12px] text-gray-500">{r.field_label}</span>
                <span className="text-[11px] text-gray-400 tabular-nums ml-auto">{when(r.created_at)}</span>
              </div>

              <p className="text-[13px] text-gray-800 mt-2 leading-relaxed">
                <span className="text-gray-400 line-through">{r.before || "없음"}</span>
                <span className="mx-2 text-gray-300">▸</span>
                <span className="font-semibold">{r.after}</span>
              </p>
              {r.note && <p className="text-[12px] text-gray-500 mt-1.5 bg-black/[0.03] rounded-[9px] px-2.5 py-1.5">{r.note}</p>}

              {r.status !== "PENDING" ? (
                <p className="text-[11.5px] text-gray-400 mt-2">
                  {when(r.decided_at)} {r.decided_by}
                  {r.decision_note ? ` · ${r.decision_note}` : ""}
                </p>
              ) : openId === r.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Textarea
                    rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="사장님께 남길 한 줄 (선택) — 거절이면 왜인지 적어 주세요."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => decide(r, "approve")} disabled={busy === r.id}>
                      <IconCheck size={14} aria-hidden="true" />{busy === r.id ? "처리 중…" : "승인"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => decide(r, "reject")} disabled={busy === r.id}>
                      <IconX size={14} aria-hidden="true" />거절
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setOpenId(null); setNote(""); }}>닫기</Button>
                    {onGo && (
                      <button
                        type="button"
                        onClick={() => onGo(`astro-ops?open=${r.restaurant_id}`)}
                        className={`ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-navy hover:underline rounded ${focusRing}`}
                      >
                        매장 열기 <IconExternalLink size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11.5px] text-gray-500 leading-relaxed">
                    승인하면 매장 운영 기록이 신청값으로 바뀝니다. 앱에서 실제로 발급되는 쿠폰 줄은
                    매장 혜택 편집에서 따로 바꿔 주세요 — 쿠폰 종류·금액·유효기간이 걸려 있어 자동으로 옮기지 않습니다.
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <Button size="sm" variant="secondary" onClick={() => { setOpenId(r.id); setNote(""); }}>처리하기</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
