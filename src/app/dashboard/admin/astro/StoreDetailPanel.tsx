"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconExternalLink, IconFiles, IconCash } from "@tabler/icons-react";
import {
  BILLING_LABEL,
  INVOICE_LABEL,
  emptyStoreOps,
  isPaidTier,
  type BillingState,
  type InvoiceState,
  type PayCycle,
  type Campus,
  type StoreOps,
  type StoreRow,
  type TaxInvoice,
  CAMPUSES,
  TAX_STATUS_LABEL,
} from "@/lib/draft/types";
import { SALES_SHEET } from "@/lib/satellite";
import { Button, Chip, Field, Input, PanelSection, Select, SlideOver, Stepper, Textarea, agoLabel, Skeleton } from "../_shared/ui";
import ActivityLog from "./ActivityLog";

/**
 * 매장 한 장 — 오른쪽 슬라이드 패널.
 *
 * Console 캠페인 상세를 따랐다: 상단 단계 표시줄 · 블록 · 하단 고정 액션.
 * **시트 '계약 세부사항' 탭의 열이 전부 여기서 편집된다** (민열님 0910: "시트를 Astro 로 대체하는 게 목적").
 * 저장 버튼이 따로 없다. 칸에서 나가면(blur) 바로 반영되고 실패하면 되돌아간다.
 * 플랜(FREE/BOOST/CONTENT)만 백엔드 소유라 식당 관리에서 바꾼다.
 */

const STEPS = ["계약", "계산서 발송", "입금 확인", "비치물 전달"];

function stepOf(o: StoreOps): number {
  if (o.kit_delivered) return 3;
  if (o.billing === "PAID" || o.billing === "EXEMPT") return 2;
  if (o.invoice !== "NONE") return 1;
  return 0;
}

/** blur 때 한 번만 PATCH 하는 텍스트 칸. 타이핑마다 서버를 부르지 않는다. */
function Cell({ label, value, onCommit, placeholder, hint, type, rows }: { label: string; value: string | number | null; onCommit: (v: string | null) => void; placeholder?: string; hint?: string; type?: string; rows?: number }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  useEffect(() => setV(value === null ? "" : String(value)), [value]);
  const commit = () => {
    const next = v.trim();
    if (next !== (value === null ? "" : String(value))) onCommit(next || null);
  };
  return (
    <Field label={label} hint={hint}>
      {rows ? (
        <Textarea rows={rows} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} />
      ) : (
        <Input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} inputMode={type === "number" ? "numeric" : undefined} />
      )}
    </Field>
  );
}

export default function StoreDetailPanel({ row, invoice = null, actor, onClose, onPatch, onGo, onMarkPaid }: { row: StoreRow | null; invoice?: TaxInvoice | null; actor: string; onClose: () => void; onPatch: (id: number, body: Partial<StoreOps>) => void; onGo?: (tab: string) => void; onMarkPaid?: (inv: TaxInvoice) => Promise<void> }) {
  if (!row) return null;
  const o: StoreOps = { ...emptyStoreOps(row.restaurant_id), ...(row.ops ?? {}) };
  const id = row.restaurant_id;
  const paid = isPaidTier(row.tier);
  const set = (k: keyof StoreOps) => (v: string | null) => onPatch(id, { [k]: v } as Partial<StoreOps>);

  const Tri = ({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] text-gray-700">{label}</span>
      <div className="inline-flex h-8 p-0.5 bg-gray-100 rounded-lg" role="group" aria-label={label}>
        {([[true, "이용"], [false, "쉼"], [null, "미정"]] as const).map(([val, t]) => (
          <button key={String(val)} type="button" onClick={() => onChange(val)} aria-pressed={value === val} className={`px-2.5 rounded-md text-[12px] font-semibold ${value === val ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{t}</button>
        ))}
      </div>
    </div>
  );

  return (
    <SlideOver
      open
      onClose={onClose}
      title={row.name}
      subtitle={[o.campus ?? "경북대", o.district, `매장 ID ${id}`, o.sheet_owner && `담당 ${o.sheet_owner}`].filter(Boolean).join(" · ")}
      badge={row.tier ? <Chip tone={row.tier === "BOOST" ? "amber" : row.tier === "CONTENT" ? "navy" : "gray"}>{row.tier}</Chip> : <Chip tone="gray">플랜 미지정</Chip>}
      width="lg"
      footer={
        <>
          {/* 월납 + 이번 달 청구가 있으면 계산서 건에 입금을 찍는다 — 매장 현황·입금 현황·런처가 전부 그 건을 본다 */}
          {paid && invoice && !invoice.paid_at && onMarkPaid && <Button variant="primary" icon={<IconCheck />} onClick={() => onMarkPaid(invoice)}>{invoice.period.slice(5).replace(/^0/, "")}월 입금 확인</Button>}
          {paid && (!invoice || o.pay_cycle === "LUMP") && o.billing !== "PAID" && <Button variant="primary" icon={<IconCheck />} onClick={() => onPatch(id, { billing: "PAID", invoice: "ISSUED" })}>{o.pay_cycle === "LUMP" ? "일시납 입금 확인" : "입금 확인 처리"}</Button>}
          {!o.kit_delivered && <Button onClick={() => onPatch(id, { kit_delivered: true })}>비치물 전달 완료</Button>}
          {onGo && <Button variant="ghost" icon={<IconFiles />} onClick={() => onGo("astro-docs")}>자료실</Button>}
          <span className="ml-auto text-[12px] text-gray-400">{o.updated_at ? `${agoLabel(o.updated_at)}${o.updated_by ? ` · ${o.updated_by}` : ""}` : "아직 기록 없음"}</span>
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
                <Button key={s} size="sm" variant={o.billing === s ? "primary" : "secondary"} onClick={() => onPatch(id, { billing: s })} aria-pressed={o.billing === s}>{BILLING_LABEL[s]}</Button>
              ))}
            </div>
            {o.billing_checked_at && <p className="text-[12px] text-gray-500 mt-1.5">{o.billing_checked_at} 에 {o.billing_checked_by ?? "누군가"} 확인</p>}
            {paid && o.pay_cycle !== "LUMP" && (
              <p className="text-[12px] text-gray-600 mt-1.5 flex items-center gap-1.5">
                <IconCash size={13} className="text-gray-400" aria-hidden="true" />
                이번 달 청구: {invoice ? <>{TAX_STATUS_LABEL[invoice.status]}{invoice.paid_at ? ` · 입금 ${invoice.paid_at.slice(5, 10).replace("-", "/")}` : ""} · {invoice.total.toLocaleString()}원</> : <span className="text-red-600 font-semibold">아직 청구 안 됨</span>}
                {onGo && <button type="button" onClick={() => onGo("astro-billing")} className="text-navy font-medium hover:underline">월별 보기</button>}
              </p>
            )}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-gray-700 mb-1.5">세금계산서</p>
            <div className="flex flex-wrap gap-1.5">
              {(["NONE", "SENT", "NO_REPLY", "ISSUED"] as InvoiceState[]).map((s) => (
                <Button key={s} size="sm" variant={o.invoice === s ? "primary" : "secondary"} onClick={() => onPatch(id, { invoice: s })} aria-pressed={o.invoice === s}>{INVOICE_LABEL[s]}</Button>
              ))}
            </div>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="계약 (시트 '계약 세부사항' 열)">
        <div className="grid grid-cols-2 gap-3">
          <Cell label="계약일" value={o.contract_signed_on} onCommit={set("contract_signed_on")} placeholder="2026-08-20" />
          <Field label="플랜" hint="식당 관리에서 바꿉니다"><Input value={row.tier ?? "미지정"} disabled /></Field>
          <Cell label="월 이용료 (VAT 포함)" value={o.monthly_fee} onCommit={(v) => onPatch(id, { monthly_fee: v === null ? null : Number(v.replace(/[^\d]/g, "")) || 0 })} placeholder="33000" type="number" />
          <Field label="납부 방식">
            <Select value={o.pay_cycle ?? ""} onChange={(e) => onPatch(id, { pay_cycle: (e.target.value || null) as PayCycle | null })}>
              <option value="">-</option><option value="MONTHLY">월납</option><option value="LUMP">일시납</option>
            </Select>
          </Field>
          <Cell label="제1차 이용기간 시작" value={o.contract_started_on} onCommit={set("contract_started_on")} placeholder="2026-09-01" />
          <Cell label="전체 계약기간 끝" value={o.contract_ends_on} onCommit={set("contract_ends_on")} placeholder="2027-02-28" />
          <Cell label="담당자" value={o.sheet_owner} onCommit={set("sheet_owner")} placeholder="준영" />
          <Cell label="계약서 원본 보관" value={o.contract_original} onCommit={set("contract_original")} placeholder="예: 사무실 파일함 / 드라이브" />
        </div>
      </PanelSection>

      <PanelSection title="혜택 (부속서식 · 혜택 등록서)">
        <div className="space-y-3">
          <Cell label="기본 쿠폰 (상시)" value={o.coupon_basic} onCommit={set("coupon_basic")} rows={2} placeholder="예: 메뉴당 1,000원 할인 (포장 제외)" />
          <Cell label="한정 쿠폰" value={o.coupon_limited} onCommit={set("coupon_limited")} rows={2} placeholder="예: 아메리카노 사이즈업" />
          <div className="grid grid-cols-2 gap-3">
            <Cell label="스탬프 적립 개수" value={o.stamp_count} onCommit={set("stamp_count")} placeholder="5 / 10 / 20" />
            <Cell label="식사권 제외 메뉴·시간대" value={o.exclusions} onCommit={set("exclusions")} placeholder="예: 음료 1잔당 1회" />
          </div>
          <Cell label="스탬프 혜택" value={o.stamp_reward} onCommit={set("stamp_reward")} rows={2} placeholder="예: 5개 타코야끼 · 10개 만원 할인" />
          <Cell label="별도 견적 항목" value={o.extra_quote} onCommit={set("extra_quote")} placeholder="예: 릴스 8만" />
        </div>
        <p className="text-[12px] text-gray-500 mt-2">앱에 실제로 나가는 쿠폰은 <span className="font-semibold text-gray-700">식당 관리 → 혜택</span>에 등록해야 합니다. 여기는 계약서에 적힌 조건입니다. 둘이 다르면 정합성 점검이 잡습니다.</p>
      </PanelSection>

      <PanelSection title="운영">
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">
          <Tri label="학기 중 플랜 이용" value={o.semester_active} onChange={(v) => onPatch(id, { semester_active: v })} />
          <Tri label="방학 중 플랜 이용" value={o.vacation_active} onChange={(v) => onPatch(id, { vacation_active: v })} />
          <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
            <span className="text-[13px] text-gray-700">포스터·QR 스티커 전달</span>
            <input type="checkbox" checked={o.kit_delivered} onChange={(e) => onPatch(id, { kit_delivered: e.target.checked })} className="w-[18px] h-[18px] accent-[#050072]" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Cell label="홍보물 수령 (포스터/QR/배너)" value={o.kit_note} onCommit={set("kit_note")} placeholder="2장/10장" />
          <Cell label="PIN 번호" value={o.pin} onCommit={set("pin")} placeholder="1234" />
        </div>
      </PanelSection>

      <PanelSection title="매장 정보 (시트 '매장 현황')">
        <div className="grid grid-cols-2 gap-3">
          <Field label="캠퍼스"><Select value={o.campus ?? "경북대"} onChange={(e) => onPatch(id, { campus: e.target.value as Campus })}>{CAMPUSES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Cell label="상권" value={o.district} onCommit={set("district")} placeholder="북문 / 정문 / 쪽문" />
          <Cell label="대표자" value={o.owner_name} onCommit={set("owner_name")} />
          <Cell label="연락처" value={o.owner_phone} onCommit={set("owner_phone")} type="tel" />
          <Cell label="사업자등록번호" value={o.biz_no} onCommit={set("biz_no")} placeholder="세금계산서용" />
        </div>
      </PanelSection>

      <PanelSection title="비고">
        <Cell label="계약 특이사항 · 점주 요청" value={o.memo} onCommit={set("memo")} rows={3} placeholder="예: 방학엔 쉬고 싶다고 하심, 9월 말 재확인" />
        <p className="text-[12px] text-gray-500 mt-2">
          {o.sheet_synced_at
            ? `${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(o.sheet_synced_at))} 에 시트에서 읽어온 뒤로는 여기서 고친 값이 원본입니다.`
            : "아직 시트에서 읽어오지 않은 매장입니다. 입점 후보 → '시트에서 불러오기 → 계약' 으로 채우거나 직접 적으세요."}{" "}
          <a href={SALES_SHEET.url(SALES_SHEET.tabs.계약)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-navy font-medium">시트 열기 <IconExternalLink size={12} aria-hidden="true" /></a>
        </p>
      </PanelSection>

      <PanelSection title="다른 툴에서 본 이 매장">
        <LinkBlock id={id} name={row.name} onGo={onGo} />
      </PanelSection>

      <PanelSection title="기록"><ActivityLog targetType="store" targetId={String(id)} actor={actor} /></PanelSection>
    </SlideOver>
  );
}

/* ═══════════ Papillon · Probe 연결 블록 ═══════════ */

interface LinkPayload {
  papillon: { reachable: boolean; sponsorships: { id: number; shoot_datetime: string; status: string; status_label: string; shoot_owner_name: string | null }[]; plans: { id: number; topic: string; scheduled_date: string; status: string; media_type: string; pipeline_stage_label: string; owner_name: string }[] };
  probe: { reachable: boolean; stats: { coupon_redeemed_this_month: number; stamp_earned_this_month: number; revisit_this_month: number; loyal_total: number } | null };
}

/**
 * 같은 매장을 Papillon(협찬 촬영 · 콘텐츠 기획)과 Probe(이번 달 앱 지표)가 어떻게 보는지.
 * 영업이 점주에게 "이번 주 촬영 있어요 / 저번 게시물 저장 309회였어요" 를 여기서 바로 꺼낸다.
 * 못 읽으면 '못 읽음'이지 '없음'이 아니다.
 */
function LinkBlock({ id, name, onGo }: { id: number; name: string; onGo?: (tab: string) => void }) {
  const [d, setD] = useState<LinkPayload | null | undefined>(undefined);
  useEffect(() => {
    setD(undefined);
    fetch(`/api/astro/link?id=${id}&name=${encodeURIComponent(name)}`).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  }, [id, name]);
  if (d === undefined) return <Skeleton rows={3} cols={2} />;
  if (d === null) return <p className="text-[12px] text-gray-500">연결 정보를 읽지 못했습니다.</p>;
  const fmt = (iso: string) => { const x = new Date(iso); return `${x.getMonth() + 1}/${x.getDate()}`; };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-gray-800 inline-flex items-center gap-1.5"><img src="/satellite/papillon_app.svg" alt="" width={16} height={16} className="w-4 h-4 rounded" aria-hidden="true" />Papillon</span>
          {onGo && <button type="button" onClick={() => onGo("satellite")} className="text-[12px] text-navy font-medium hover:underline">열기</button>}
        </div>
        {!d.papillon.reachable ? <p className="text-[12px] text-gray-500">기획 목록을 못 읽었습니다.</p> : d.papillon.sponsorships.length + d.papillon.plans.length === 0 ? <p className="text-[12px] text-gray-500">최근 3개월 협찬·기획에 이 매장 이름이 없습니다.</p> : (
          <ul className="space-y-1.5 text-[12px]">
            {d.papillon.sponsorships.slice(0, 3).map((s) => <li key={`s${s.id}`} className="flex items-center justify-between gap-2"><span className="text-gray-700 truncate">촬영 {fmt(s.shoot_datetime)}{s.shoot_owner_name ? ` · ${s.shoot_owner_name}` : ""}</span><Chip tone={s.status === "completed" ? "green" : "amber"}>{s.status_label}</Chip></li>)}
            {d.papillon.plans.slice(0, 3).map((p) => <li key={`p${p.id}`} className="flex items-center justify-between gap-2"><span className="text-gray-700 truncate">{p.scheduled_date.slice(5).replace("-", "/")} {p.topic}</span><Chip tone={p.status === "published" ? "navy" : "gray"}>{p.pipeline_stage_label}</Chip></li>)}
          </ul>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-gray-800 inline-flex items-center gap-1.5"><img src="/satellite/probe_app.svg" alt="" width={16} height={16} className="w-4 h-4 rounded" aria-hidden="true" />Probe · 이번 달</span>
          {onGo && <button type="button" onClick={() => onGo("probe-insights")} className="text-[12px] text-navy font-medium hover:underline">홍보 인사이트</button>}
        </div>
        {!d.probe.reachable || !d.probe.stats ? <p className="text-[12px] text-gray-500">지표를 못 읽었습니다 (0 이 아니라 모름).</p> : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-gray-500">쿠폰 사용</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{d.probe.stats.coupon_redeemed_this_month}</dd>
            <dt className="text-gray-500">스탬프 적립</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{d.probe.stats.stamp_earned_this_month}</dd>
            <dt className="text-gray-500">재방문</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{d.probe.stats.revisit_this_month}</dd>
            <dt className="text-gray-500">단골 누적</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{d.probe.stats.loyal_total}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
