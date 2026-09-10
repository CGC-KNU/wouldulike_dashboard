"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconExternalLink } from "@tabler/icons-react";
import { SALES_SHEET } from "@/lib/satellite";
import {
  BILLING_LABEL,
  INVOICE_LABEL,
  emptyStoreOps,
  isPaidTier,
  type BillingState,
  type InvoiceState,
  type StoreOps,
  type StoreRow,
} from "@/lib/draft/types";
import { Button, Chip, DefList, Field, PanelSection, SlideOver, Stepper, Textarea, agoLabel } from "../_shared/ui";
import ActivityLog from "./ActivityLog";

/**
 * 매장 한 장 — 오른쪽 슬라이드 패널.
 *
 * Console 캠페인 상세를 그대로 가져왔다: 상단 단계 표시줄 · 블록별 "라벨 : 값" · 하단 고정 액션.
 * 목록 위에 겹쳐서 열리므로 "이 매장 조건이 뭐였지"를 보고 바로 옆 매장으로 넘어간다.
 *
 * 여기서 바꾸는 값은 전부 사람이 확인해서 넣는 값이다. 저장 버튼이 따로 없다 — 누르면 바로 반영되고
 * 실패하면 되돌아간다. 영업이 매장 앞에서 폰으로 한 손에 체크하는 상황을 기준으로 잡았다.
 */

/** 이행 단계. 견적 → 계산서 → 입금 → 비치물 순서로 흐른다. */
const STEPS = ["계약", "계산서 발송", "입금 확인", "비치물 전달"];

function stepOf(o: StoreOps | null): number {
  if (!o) return 0;
  if (o.kit_delivered) return 3;
  if (o.billing === "PAID" || o.billing === "EXEMPT") return 2;
  if (o.invoice !== "NONE") return 1;
  return 0;
}

function seasonText(o: StoreOps | null): string {
  if (!o || (o.semester_active === null && o.vacation_active === null)) return "미정";
  if (o.semester_active && o.vacation_active) return "학기 + 방학";
  if (o.semester_active) return "학기만";
  if (o.vacation_active) return "방학만";
  return "둘 다 쉼";
}

export default function StoreDetailPanel({
  row,
  actor,
  onClose,
  onPatch,
}: {
  row: StoreRow | null;
  actor: string;
  onClose: () => void;
  onPatch: (id: number, body: Partial<StoreOps>) => void;
}) {
  const o = row?.ops ?? (row ? emptyStoreOps(row.restaurant_id) : null);
  const [memo, setMemo] = useState(o?.memo ?? "");
  useEffect(() => setMemo(o?.memo ?? ""), [o?.memo, row?.restaurant_id]);

  if (!row || !o) return null;
  const id = row.restaurant_id;
  const paid = isPaidTier(row.tier);

  const Tri = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: boolean | null;
    onChange: (v: boolean | null) => void;
  }) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] text-gray-700">{label}</span>
      <div className="inline-flex h-8 p-0.5 bg-gray-100 rounded-lg" role="group" aria-label={label}>
        {(
          [
            [true, "이용"],
            [false, "쉼"],
            [null, "미정"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`px-2.5 rounded-md text-[12px] font-semibold ${
              value === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <SlideOver
      open={Boolean(row)}
      onClose={onClose}
      title={row.name}
      subtitle={`매장 ID ${id}${o.biz_no ? ` · 사업자 ${o.biz_no}` : ""}`}
      badge={
        row.tier ? (
          <Chip tone={row.tier === "BOOST" ? "amber" : row.tier === "CONTENT" ? "navy" : "gray"}>{row.tier}</Chip>
        ) : (
          <Chip tone="gray">플랜 미지정</Chip>
        )
      }
      footer={
        <>
          {o.billing !== "PAID" && paid && (
            <Button
              variant="primary"
              icon={<IconCheck />}
              onClick={() => onPatch(id, { billing: "PAID", invoice: "ISSUED" })}
            >
              입금 확인 처리
            </Button>
          )}
          {!o.kit_delivered && (
            <Button onClick={() => onPatch(id, { kit_delivered: true })}>비치물 전달 완료</Button>
          )}
          <span className="ml-auto text-[12px] text-gray-400">
            {o.updated_at ? `${agoLabel(o.updated_at)}${o.updated_by ? ` · ${o.updated_by}` : ""}` : "아직 기록 없음"}
          </span>
        </>
      }
    >
      <Stepper steps={STEPS} current={stepOf(o)} />

      <PanelSection title="이행">
        <div className="space-y-3">
          <div>
            <p className="text-[12px] font-semibold text-gray-700 mb-1.5">입금</p>
            <div className="flex flex-wrap gap-1.5">
              {(["UNKNOWN", "PENDING", "PAID", "EXEMPT"] as BillingState[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={o.billing === s ? "primary" : "secondary"}
                  onClick={() => onPatch(id, { billing: s })}
                  aria-pressed={o.billing === s}
                >
                  {BILLING_LABEL[s]}
                </Button>
              ))}
            </div>
            {o.billing_checked_at && (
              <p className="text-[12px] text-gray-500 mt-1.5">
                {o.billing_checked_at} 에 {o.billing_checked_by ?? "누군가"} 확인
              </p>
            )}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-gray-700 mb-1.5">세금계산서</p>
            <div className="flex flex-wrap gap-1.5">
              {(["NONE", "SENT", "NO_REPLY", "ISSUED"] as InvoiceState[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={o.invoice === s ? "primary" : "secondary"}
                  onClick={() => onPatch(id, { invoice: s })}
                  aria-pressed={o.invoice === s}
                >
                  {INVOICE_LABEL[s]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="운영">
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">
          <Tri label="학기 중 플랜 이용" value={o.semester_active} onChange={(v) => onPatch(id, { semester_active: v })} />
          <Tri label="방학 중 플랜 이용" value={o.vacation_active} onChange={(v) => onPatch(id, { vacation_active: v })} />
          <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
            <span className="text-[13px] text-gray-700">포스터·QR 스티커 전달</span>
            <input
              type="checkbox"
              checked={o.kit_delivered}
              onChange={(e) => onPatch(id, { kit_delivered: e.target.checked })}
              className="w-[18px] h-[18px] accent-[#050072]"
            />
          </label>
        </div>
        <p className="text-[12px] text-gray-500 mt-2">
          학기/방학은 점주에게 확인한 뒤 넣습니다. 툴이 추측하지 않습니다.
        </p>
      </PanelSection>

      <PanelSection title="계약">
        <DefList
          items={[
            { label: "플랜", value: row.tier ?? "미지정" },
            { label: "운영 구분", value: seasonText(o) },
            { label: "월 이용료", value: o.monthly_fee ? `${o.monthly_fee.toLocaleString()}원` : null },
            { label: "납부", value: o.pay_cycle === "MONTHLY" ? "월납" : o.pay_cycle === "LUMP" ? "일시납" : null },
            { label: "계약 시작", value: o.contract_started_on },
            { label: "대표", value: o.owner_name },
            { label: "연락처", value: o.owner_phone },
            { label: "PIN", value: o.pin },
            { label: "홍보물 수령", value: o.kit_note },
            { label: "시트 담당", value: o.sheet_owner },
          ]}
        />
        {o.benefit_note && (
          <p className="text-[13px] text-gray-800 mt-3 whitespace-pre-wrap leading-relaxed">{o.benefit_note}</p>
        )}
        <p className="text-[12px] text-gray-500 mt-2">
          {o.sheet_synced_at
            ? `계약 조건은 팀 시트 기준입니다 (${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(o.sheet_synced_at))} 읽음).`
            : "계약 조건의 원본은 팀 시트입니다. 입점 후보 화면의 '시트에서 불러오기 → 계약' 을 누르면 채워집니다."}{" "}
          <a href={SALES_SHEET.url(SALES_SHEET.tabs.계약)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-navy font-medium">
            시트 열기 <IconExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      </PanelSection>

      <PanelSection title="메모">
        <Field label="계약 특이사항 · 점주 요청">
          <Textarea
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => memo !== (o.memo ?? "") && onPatch(id, { memo })}
            placeholder="예: 방학엔 쉬고 싶다고 하심, 9월 말 재확인"
          />
        </Field>
      </PanelSection>

      <PanelSection title="기록">
        <ActivityLog targetType="store" targetId={String(id)} actor={actor} />
      </PanelSection>
    </SlideOver>
  );
}
