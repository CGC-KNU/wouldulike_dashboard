"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconExternalLink, IconX } from "@tabler/icons-react";
import { Button, Card, Chip, FilterPills, PageHeader, Spinner, Textarea, focusRing } from "../_shared/ui";

/**
 * 혜택 변경 신청 처리 (민열님 0924).
 *
 * ## 이 화면이 없으면 무슨 일이 나나
 * 점주 화면에서 혜택을 고치면 그 자리에서 앱에 반영됐다. 우리가 모르는 사이에 손님에게
 * 나가는 약속이 바뀐다. 그래서 신청만 받고, 값이 바뀌는 건 여기서 누를 때다.
 *
 * ## 승인하면 **앱이 바뀐다**
 * 처음 만들 때는 영업 메모만 바꾸고 "앱은 따로 고쳐 주세요" 라고 적었다. 그건 설계를 고치는
 * 대신 변명을 화면에 적은 것이었다. 지금은 앱 카탈로그를 직접 고친다 — 누르면 손님에게 나간다.
 * 딱 하나 예외가 '그 밖의 요청'(스탬프 개수·새 쿠폰 종류)이고, 그건 카드가 **자동으로 반영되지
 * 않았다고 그대로 말하고** 매장으로 가는 길을 옆에 둔다.
 *
 * ## 신청 뒤 우리가 그 줄을 고쳤다면
 * 백엔드가 승인 직전 값을 돌려준다. 조용히 덮으면 우리 수정이 사라지므로 화면에 남긴다.
 */

type Status = "PENDING" | "APPROVED" | "REJECTED";

interface Req {
  id: number;
  restaurant_id: number;
  store_name: string;
  action: string;
  action_label: string;
  applies_automatically: boolean;
  benefit_label: string;
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
      // 못 읽은 것과 없는 것은 다르다. [] 로 채우면 "처리할 신청이 없습니다" 가 같이 떠서
      // 오류 줄과 서로 반대말을 한다 (0924 리허설).
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
      setFlash(`${r.store_name} · ${d.detail ?? (action === "approve" ? "승인했습니다." : "거절했습니다.")}`);
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
        description="사장님이 올린 혜택 변경입니다. 승인하면 앱 카탈로그가 바뀌어 손님에게 바로 나갑니다."
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
                <span className="text-[12px] text-gray-500">{r.benefit_label || r.action_label}</span>
                {!r.applies_automatically && <Chip tone="blue">손으로 반영</Chip>}
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
                    {r.applies_automatically
                      ? "승인하면 앱 카탈로그가 바뀝니다. 손님에게 바로 나갑니다."
                      : "구조를 바꾸는 요청이라 승인해도 자동으로 반영되지 않습니다. 쿠폰 종류·유효기간이 걸려 있어서입니다 — 매장 혜택 편집에서 손으로 반영해 주세요."}
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
