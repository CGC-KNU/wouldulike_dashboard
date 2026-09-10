"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconCopy, IconSend } from "@tabler/icons-react";
import { BILLING_LABEL, INVOICE_LABEL, isPaidTier, type StoreOps, type StoreRow } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Skeleton, StepTiles, Table, Td, Th, PageHeader, agoLabel, type ChipTone } from "../_shared/ui";

/**
 * Astro · 입금 현황.
 *
 * 지금은 재민님이 시트에 빨간색을 칠하고(09-06), 준영님이 카톡에 "입금완료 5 / 미회신 3 / 발송예정 3"을 손으로 적는다(09-03).
 * 둘 다 **누가 언제 확인했는지가 남지 않는다.** 이 화면은 그 두 일을 한 자리로 모으고, 체크할 때마다 확인자와 시각을 박는다.
 *
 * 상단 단계 타일은 Console 정산 관리에서 가져왔다. 왼쪽이 우리 일, 오른쪽으로 갈수록 끝난 일이다.
 * 수금(입금)과 세금계산서를 별개 상태로 둔 것도 Console 차용 — 섞으면 "계산서는 나갔는데 돈은 안 들어온" 칸이 사라진다.
 */

type Bucket = "ours" | "theirs" | "issued" | "done";

const BUCKET_LABEL: Record<Bucket, string> = {
  ours: "계산서 미발송",
  theirs: "회신 대기",
  issued: "발행됐지만 미입금",
  done: "입금 확인",
};

export default function BillingBoard({ actor }: { actor: string }) {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [bucket, setBucket] = useState<Bucket | null>("ours");
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
        /* 화면은 안 바꿨으므로 되돌릴 것도 없다 */
      }
    },
    [actor]
  );

  const paid = useMemo(() => rows.filter((r) => r.is_affiliate && isPaidTier(r.tier) && !r.ops?.is_test), [rows]);

  /** 버킷은 서로 배타적이고 합이 유료 매장 수와 같다. 어디에도 안 잡히는 매장이 생기면 조용히 사라지기 때문이다. */
  const buckets = useMemo(() => {
    const done = paid.filter((r) => r.ops?.billing === "PAID" || r.ops?.billing === "EXEMPT");
    const rest = paid.filter((r) => !done.includes(r));
    const ours = rest.filter((r) => (r.ops?.invoice ?? "NONE") === "NONE");
    const theirs = rest.filter((r) => r.ops?.invoice === "SENT" || r.ops?.invoice === "NO_REPLY");
    const issued = rest.filter((r) => !ours.includes(r) && !theirs.includes(r));
    return { ours, theirs, issued, done } as Record<Bucket, StoreRow[]>;
  }, [paid]);

  const report = useMemo(() => {
    const names = (list: StoreRow[]) => (list.length ? list.map((r) => r.name).join(", ") : "없음");
    const today = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date());
    const lines = [
      `[입금 현황 ${today}] 유료 ${paid.length}곳`,
      `입금 확인 ${buckets.done.length}: ${names(buckets.done)}`,
      `계산서 발송·회신 대기 ${buckets.theirs.length}: ${names(buckets.theirs)}`,
      `계산서 미발송 ${buckets.ours.length}: ${names(buckets.ours)}`,
    ];
    if (buckets.issued.length) lines.push(`발행됐지만 미입금 ${buckets.issued.length}: ${names(buckets.issued)}`);
    return lines.join("\n");
  }, [buckets, paid.length]);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 아래 미리보기에서 직접 복사하면 된다 */
    }
  }

  const list = bucket ? buckets[bucket] : paid;

  return (
    <>
      <PageHeader
        title="입금 현황"
        description="유료 매장의 세금계산서와 입금을 단계별로 봅니다. 왼쪽이 우리가 잡고 있는 일입니다."
        actions={
          <>
            {draft.on && <DraftBadge note={draft.note} />}
            <Button icon={<IconCopy />} onClick={copyReport} aria-live="polite">
              {copied ? "복사했습니다" : "보고 문구 복사"}
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <StepTiles
          active={bucket}
          onSelect={(k) => setBucket(bucket === k ? null : (k as Bucket))}
          steps={[
            { key: "ours", label: "계산서 미발송", count: buckets.ours.length, hint: "우리가 보내야 함", tone: "alert" },
            { key: "theirs", label: "회신 대기", count: buckets.theirs.length, hint: "보냈고 답 기다림" },
            { key: "issued", label: "발행됐지만 미입금", count: buckets.issued.length, hint: "다시 연락할 차례", tone: "alert" },
            { key: "done", label: "입금 확인", count: buckets.done.length, hint: "끝난 곳", tone: "good" },
          ]}
        />
      </div>

      <Card flush title={bucket ? `${BUCKET_LABEL[bucket]} ${list.length}곳` : `유료 매장 ${paid.length}곳`}>
        {loading ? (
          <Skeleton rows={6} cols={5} />
        ) : paid.length === 0 ? (
          <Empty title="유료 매장이 없습니다" detail="플랜이 BOOST·CONTENT 인 제휴 매장만 잡힙니다. 식당 관리에서 플랜을 먼저 지정하세요." />
        ) : list.length === 0 ? (
          <Empty title="이 단계는 비어 있습니다" detail="위 다른 단계를 눌러 보세요." />
        ) : (
          <Table minWidth="44rem">
            <thead>
              <tr>
                <Th>매장</Th>
                <Th width="7rem">입금</Th>
                <Th width="7rem">계산서</Th>
                <Th width="9rem">확인</Th>
                <Th width="16rem" align="right">처리</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const o = r.ops;
                const bTone: ChipTone = o?.billing === "PAID" ? "green" : o?.billing === "PENDING" ? "red" : "gray";
                const iTone: ChipTone = o?.invoice === "ISSUED" ? "green" : o?.invoice === "NO_REPLY" ? "red" : o?.invoice === "SENT" ? "amber" : "gray";
                return (
                  <tr key={r.restaurant_id}>
                    <Td>
                      <span className="font-semibold text-gray-900">{r.name}</span>
                      <span className="block text-[11px] text-gray-400">{r.tier}{o?.biz_no ? ` · ${o.biz_no}` : ""}</span>
                    </Td>
                    <Td><Chip tone={bTone}>{BILLING_LABEL[o?.billing ?? "UNKNOWN"]}</Chip></Td>
                    <Td><Chip tone={iTone}>{INVOICE_LABEL[o?.invoice ?? "NONE"]}</Chip></Td>
                    <Td className="text-[12px] text-gray-500">
                      {o?.billing_checked_at ? `${o.billing_checked_at} · ${o.billing_checked_by ?? ""}` : agoLabel(o?.updated_at)}
                    </Td>
                    <Td align="right">
                      <div className="inline-flex gap-1.5">
                        {(o?.invoice ?? "NONE") === "NONE" && (
                          <Button size="sm" icon={<IconSend />} onClick={() => patch(r.restaurant_id, { invoice: "SENT" })}>
                            계산서 발송함
                          </Button>
                        )}
                        {o?.invoice === "SENT" && (
                          <Button size="sm" onClick={() => patch(r.restaurant_id, { invoice: "NO_REPLY" })}>
                            회신 없음
                          </Button>
                        )}
                        {o?.billing !== "PAID" && o?.billing !== "EXEMPT" && (
                          <Button size="sm" variant="primary" icon={<IconCheck />} onClick={() => patch(r.restaurant_id, { billing: "PAID", invoice: "ISSUED" })}>
                            입금 확인
                          </Button>
                        )}
                        {o?.billing === "PAID" && !o.kit_delivered && (
                          <Button size="sm" onClick={() => patch(r.restaurant_id, { kit_delivered: true })}>
                            비치물 전달함
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="보고 문구" description="카톡·슬랙에 손으로 쓰던 그 문장입니다. 위 버튼으로 복사해서 그대로 올리세요." className="mt-4">
        <pre className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{report}</pre>
      </Card>
    </>
  );
}
