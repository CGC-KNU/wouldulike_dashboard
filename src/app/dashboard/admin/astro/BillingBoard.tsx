"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BILLING_LABEL, INVOICE_LABEL, isPaidTier, type StoreOps, type StoreRow } from "@/lib/draft/types";
import { Card, Chip, DraftBadge, Empty, Kpi, Spinner, agoLabel } from "../_shared/ui";

/**
 * Astro · 입금 현황.
 *
 * 지금 이 일은 이렇게 돌아간다 — 재민님이 시트에 빨간색으로 칠하고(2026-09-06),
 * 준영님이 카톡에 "입금완료 5곳 / 계산서 미회신 3곳 / 발송예정 3곳"을 손으로 적는다(09-03).
 * 두 곳 다 **누가 언제 확인했는지가 남지 않는다.** 시트 셀 색은 이력이 없고, 카톡은 검색이 안 된다.
 *
 * 이 화면이 하는 일은 그 두 가지를 한 자리로 모으고, 체크할 때마다 확인자와 시각을 박는 것뿐이다.
 * **수금(입금)과 세금계산서를 별개 상태머신으로 둔** 것은 ADIT 콘솔에서 가져왔다 —
 * 섞으면 "계산서는 나갔는데 돈은 안 들어온" 칸이 어디에도 안 잡힌다.
 */

export default function BillingBoard({ actor }: { actor: string }) {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/astro/stores")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.stores ?? []);
        setDraft({ on: Boolean(d.draft), note: d.draft_note });
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const patch = useCallback(
    async (id: number, body: Partial<StoreOps>) => {
      try {
        const res = await fetch(`/api/astro/stores/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, updated_by: actor }),
        });
        if (res.ok) {
          const d = await res.json();
          setRows((prev) => prev.map((r) => (r.restaurant_id === id ? { ...r, ops: d.ops } : r)));
        }
      } catch {
        // 화면은 안 바꿨으므로 되돌릴 것도 없다
      }
    },
    [actor]
  );

  const paid = useMemo(
    () => rows.filter((r) => r.is_affiliate && isPaidTier(r.tier) && !r.ops?.is_test),
    [rows]
  );

  /**
   * 우리 쪽이 잡고 있는 일 / 상대가 잡고 있는 일을 나눈다. 남 탓할 수 없는 숫자가 먼저 온다.
   * 버킷은 **서로 배타적**이고 합이 유료 매장 수와 같아야 한다 — 어디에도 안 잡히는 매장이 생기면
   * 그 매장은 화면과 보고 문구에서 조용히 사라진다. `unknown` 이 그 그물이다.
   */
  const buckets = useMemo(() => {
    const done = paid.filter((r) => r.ops?.billing === "PAID" || r.ops?.billing === "EXEMPT");
    const rest = paid.filter((r) => !done.includes(r));
    const ours = rest.filter((r) => (r.ops?.invoice ?? "NONE") === "NONE");
    const theirs = rest.filter((r) => r.ops?.invoice === "SENT" || r.ops?.invoice === "NO_REPLY");
    // 남는 것 = 계산서는 발행됐는데(ISSUED) 입금은 안 된 매장
    const unknown = rest.filter((r) => !ours.includes(r) && !theirs.includes(r));
    return { ours, theirs, done, unknown };
  }, [paid]);

  /** 슬랙·카톡에 그대로 붙여넣을 한 덩어리. 지금 손으로 쓰던 그 문장이다. */
  const report = useMemo(() => {
    const line = (list: StoreRow[]) => (list.length ? list.map((r) => r.name).join(" · ") : "없음");
    const today = new Date().toISOString().slice(0, 10);
    const lines = [
      `[입금 현황 ${today}] 유료 ${paid.length}곳`,
      `입금 확인 ${buckets.done.length} — ${line(buckets.done)}`,
      `계산서 발송·회신 대기 ${buckets.theirs.length} — ${line(buckets.theirs)}`,
      `계산서 미발송 ${buckets.ours.length} — ${line(buckets.ours)}`,
    ];
    if (buckets.unknown.length) lines.push(`계산서 발행됐으나 미입금 ${buckets.unknown.length} — ${line(buckets.unknown)}`);
    return lines.join("\n");
  }, [buckets, paid.length]);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 클립보드 권한이 없으면 아래 미리보기에서 직접 복사하면 된다 */
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Kpi label="유료 매장" value={loading ? "—" : paid.length} />
        <Kpi
          label="계산서 미발송"
          value={loading ? "—" : buckets.ours.length}
          tone="alert"
          hint="우리가 잡고 있는 일"
        />
        <Kpi
          label="회신 대기"
          value={loading ? "—" : buckets.theirs.length}
          hint="보냈고 답을 기다리는 중"
        />
        <Kpi label="입금 확인" value={loading ? "—" : buckets.done.length} tone="good" />
      </div>

      {loading ? (
        <Card>
          <Spinner />
        </Card>
      ) : paid.length === 0 ? (
        <Card>
          <Empty
            title="유료 매장이 없습니다"
            detail="플랜이 BOOST·CONTENT 인 제휴 매장만 이 화면에 잡힙니다. 식당 관리 탭에서 플랜을 먼저 지정하세요."
          />
        </Card>
      ) : (
        <>
          <Bucket
            title="① 우리가 잡고 있는 일 — 계산서 미발송"
            desc="상대가 아니라 우리 쪽에서 멈춘 건입니다. 이 숫자가 화면에 있어야 처리됩니다."
            rows={buckets.ours}
            tone="red"
            onPatch={patch}
            draft={draft}
          />
          <Bucket
            title="② 보냈고 기다리는 중"
            desc="회신이 없으면 미회신으로 바꿔두세요. Probe 정합성 점검이 이걸 높은 심각도로 잡습니다."
            rows={buckets.theirs}
            tone="amber"
            onPatch={patch}
          />
          {buckets.unknown.length > 0 && (
            <Bucket
              title="③ 계산서는 발행됐는데 입금이 안 됨"
              desc="발행까지 끝났는데 통장에 안 들어온 건입니다. 다시 연락할 차례입니다."
              rows={buckets.unknown}
              tone="amber"
              onPatch={patch}
            />
          )}
          <Bucket title="④ 입금 확인 완료" rows={buckets.done} tone="green" onPatch={patch} collapsed />

          <Card
            title="보고 문구"
            desc="지금 카톡에 손으로 쓰던 그 문장입니다. 복사해서 그대로 올리세요."
            right={
              <button
                onClick={copyReport}
                aria-live="polite"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle transition-colors"
              >
                {copied ? "복사됨" : "복사"}
              </button>
            }
          >
            <pre className="text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed font-sans">{report}</pre>
          </Card>
        </>
      )}
    </div>
  );
}

function Bucket({
  title,
  desc,
  rows,
  tone,
  onPatch,
  draft,
  collapsed = false,
}: {
  title: string;
  desc?: string;
  rows: StoreRow[];
  tone: "red" | "amber" | "green";
  onPatch: (id: number, body: Partial<StoreOps>) => void;
  draft?: { on: boolean; note?: string };
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);

  return (
    <Card
      padded={false}
      title={`${title} (${rows.length})`}
      desc={desc}
      right={
        <div className="flex items-center gap-2">
          {draft?.on && <DraftBadge note={draft.note} />}
          {collapsed && (
            <button onClick={() => setOpen(!open)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-gray-400 hover:text-gray-600">
              {open ? "접기" : "펼치기"}
            </button>
          )}
        </div>
      }
    >
      {!open ? null : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[11px] text-gray-400">비어 있습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => (
            <li key={r.restaurant_id} className="px-4 py-3 flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-[7rem] text-sm font-medium text-gray-800 truncate">{r.name}</span>
              <Chip tone={tone}>{BILLING_LABEL[r.ops?.billing ?? "UNKNOWN"]}</Chip>
              <Chip tone="gray">{INVOICE_LABEL[r.ops?.invoice ?? "NONE"]}</Chip>
              <span className="text-[10px] text-gray-400 w-20 text-right">
                {r.ops?.billing_checked_at ? `확인 ${r.ops.billing_checked_at}` : agoLabel(r.ops?.updated_at)}
              </span>
              <div className="flex gap-1">
                {r.ops?.invoice !== "SENT" && r.ops?.invoice !== "ISSUED" && (
                  <button
                    onClick={() => onPatch(r.restaurant_id, { invoice: "SENT" })}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-periwinkle"
                  >
                    계산서 발송
                  </button>
                )}
                {r.ops?.invoice === "SENT" && (
                  <button
                    onClick={() => onPatch(r.restaurant_id, { invoice: "NO_REPLY" })}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"
                  >
                    회신 없음
                  </button>
                )}
                {r.ops?.billing !== "PAID" && (
                  <button
                    onClick={() => onPatch(r.restaurant_id, { billing: "PAID", invoice: "ISSUED" })}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-lg bg-navy text-white hover:bg-periwinkle"
                  >
                    입금 확인
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
