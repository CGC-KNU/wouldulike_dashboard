"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconExternalLink } from "@tabler/icons-react";
import type { SalesDoc } from "@/lib/draft/types";
import { Chip, Skeleton, focusRing } from "../_shared/ui";

/**
 * 자료실에서 **필요한 것만** 꺼내 주는 줄 (민열님 0914).
 *
 * 미팅 나갈 때는 계약서·혜택 등록서, 계약이 끝나면 안내문·견적서다.
 * 그때마다 자료실 탭으로 건너가 찾는 대신, 그 자리에서 바로 내려받게 한다.
 * 링크가 없는 자료는 숨기지 않고 '링크 등록 필요'로 둔다 — 없는데 있는 척하지 않는다.
 */

/** 자리별 기본 묶음. 자료실 시드의 id 와 같아야 한다. */
export const DOC_SETS = {
  meeting: ["doc-contract-v6", "doc-contract-simple", "doc-benefit-form"],
  onboarding: ["doc-payment-guide", "doc-quote-boost", "doc-benefit-form"],
} as const;

let cached: SalesDoc[] | null = null;

export default function DocQuickLinks({ ids, label }: { ids: readonly string[]; label?: string }) {
  const [docs, setDocs] = useState<SalesDoc[] | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch("/api/astro/docs").then((r) => r.json()).then((d) => { cached = d.docs ?? []; setDocs(cached); }).catch(() => setDocs([]));
  }, []);

  if (!docs) return <Skeleton rows={1} cols={3} />;
  const picked = ids.map((id) => docs.find((d) => d.id === id)).filter((d): d is SalesDoc => Boolean(d));
  if (picked.length === 0) return <p className="text-[12px] text-gray-500">자료실에 해당 자료가 없습니다.</p>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="text-[12px] text-gray-500 mr-0.5">{label}</span>}
      {picked.map((d) =>
        d.url ? (
          <a
            key={d.id}
            href={d.url}
            download={d.url.startsWith("/") ? "" : undefined}
            target={d.url.startsWith("/") ? undefined : "_blank"}
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-black/[0.1] bg-white text-[12px] font-semibold text-navy hover:border-navy/40 ${focusRing}`}
          >
            {d.url.startsWith("/") ? <IconDownload size={14} aria-hidden="true" /> : <IconExternalLink size={14} aria-hidden="true" />}
            {d.title.replace(/^파트너매장 /, "").replace(/^부속서식 · /, "")}
          </a>
        ) : (
          <Chip key={d.id} tone="amber">{d.title} · 링크 등록 필요</Chip>
        )
      )}
    </div>
  );
}
