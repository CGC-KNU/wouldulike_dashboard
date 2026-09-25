"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconCheck, IconExternalLink, IconFiles, IconCash, IconMessage2, IconDeviceFloppy } from "@tabler/icons-react";
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
import { Button, Chip, Field, Input, PanelSection, Select, SlideOver, Stepper, Textarea, agoLabel, Skeleton, periodLocal, todayLocal } from "../_shared/ui";
import { defaultMonthlyFee, feeHint } from "@/lib/draft/pricing";
import ActivityLog from "./ActivityLog";
import CampusPicker from "./CampusPicker";
import StoreAppSection from "./StoreAppSection";
import DocQuickLinks, { DOC_SETS } from "./DocQuickLinks";
import MessageComposer from "./MessageComposer";
import OnboardLink from "./OnboardLink";
import SourceBadge, { L, Mismatch, PinMemoCheck } from "./SourceBadge";

/**
 * 매장 한 장 — 오른쪽 슬라이드 패널.
 *
 * Console 캠페인 상세를 따랐다: 상단 단계 표시줄 · 블록 · 하단 고정 액션.
 * **매장에 관한 모든 편집이 여기서 끝난다.** 0921 부터 팀 시트는 쓰지 않는다 — 세틀라이트·슬랙·카톡 셋만.
 *
 * 저장은 두 갈래다 (민열님 0915).
 *  - **글자 칸·드롭다운**: 적어 두기만 하고, 아래 '변동사항 저장'을 눌러야 한 번에 나간다.
 *    칸에서 나갈 때마다 저장하던 걸 바꿨다 — 여러 칸을 이어서 고치는 동안 무엇이 저장됐는지
 *    화면이 말해 주지 못했고, 사람은 저장됐는지 아닌지를 알 수 없었다.
 *  - **버튼·토글·체크**(입금/계산서 상태, 학기·방학, 키트, 캠퍼스, 플랜): 누른 즉시 반영.
 *    한 번의 동작이 곧 결정이라 모아 둘 게 없다.
 * 플랜(FREE/BOOST/CONTENT)만 백엔드 소유라 식당 관리에서 바꾼다.
 */

const STEPS = ["계약", "계산서 발송", "입금 확인", "키트 발송"];

function stepOf(o: StoreOps): number {
  if (o.kit_delivered) return 3;
  if (o.billing === "PAID" || o.billing === "EXEMPT") return 2;
  if (o.invoice !== "NONE") return 1;
  return 0;
}

/** blur 때 한 번만 PATCH 하는 텍스트 칸. 타이핑마다 서버를 부르지 않는다. */
function Cell({ label, value, onCommit, placeholder, hint, type, rows }: { label: ReactNode; value: string | number | null; onCommit: (v: string | null) => void; placeholder?: string; hint?: string; type?: string; rows?: number }) {
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

export default function StoreDetailPanel({ row, invoice = null, actor, campusOptions = [...CAMPUSES], onClose, onPatch, onReload, onGo, onMarkPaid }: { row: StoreRow | null; invoice?: TaxInvoice | null; actor: string; campusOptions?: string[]; onClose: () => void; onPatch: (id: number, body: Partial<StoreOps>) => void | Promise<void>; onReload?: () => void; onGo?: (tab: string) => void; onMarkPaid?: (inv: TaxInvoice) => Promise<void> }) {
  if (!row) return null;
  const saved: StoreOps = { ...emptyStoreOps(row.restaurant_id), ...(row.ops ?? {}) };
  const id = row.restaurant_id;
  const paid = isPaidTier(row.tier);

  /** 적어 뒀지만 아직 안 보낸 값. 매장을 바꾸면 버린다. */
  const [draft, setDraft] = useState<Partial<StoreOps>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft({}); setSaving(false); }, [id]);
  /** 화면이 보는 값 = 저장된 값 위에 적어 둔 값. 저장 전에도 문안·기본값 계산이 새 값을 쓴다. */
  const o: StoreOps = { ...saved, ...draft };
  const dirty = Object.keys(draft).length;

  /** 칸에 적어 둔다. 원래 값으로 되돌려 놓으면 변동사항에서 빠지고 버튼도 다시 꺼진다. */
  const stage = <K extends keyof StoreOps>(k: K) => (v: StoreOps[K]) =>
    setDraft((d) => {
      const next = { ...d };
      if (v === saved[k]) delete next[k];
      else next[k] = v;
      return next;
    });
  const set = (k: keyof StoreOps) => (v: string | null) => stage(k)(v as StoreOps[typeof k]);
  async function saveDraft() {
    if (!dirty || saving) return;
    setSaving(true);
    const body = draft;
    try { await onPatch(id, body); setDraft((d) => (d === body ? {} : d)); }
    finally { setSaving(false); }
  }
  /** 적어 둔 걸 안 보내고 닫으면 그대로 사라진다 — 닫기 전에 한 번 묻는다. */
  function closeGuarded() {
    if (dirty && !window.confirm(`저장하지 않은 변동사항 ${dirty}건이 있습니다. 그냥 닫을까요?`)) return;
    onClose();
  }
  const [onboarding, setOnboarding] = useState(false);
  // 계약 완료 문안에 들어갈 입금 계좌 — 세금계산서 설정에 적힌 값만 쓴다(코드에 박지 않는다)
  const [bank, setBank] = useState<{ line: string | null; holder: string | null }>({ line: null, holder: null });
  useEffect(() => {
    if (!onboarding || bank.line) return;
    fetch("/api/astro/invoices/settings").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const i = d?.issuer ?? d;
      const line = [i?.bank_name, i?.bank_account].filter(Boolean).join(" ") || null;
      setBank({ line, holder: i?.bank_holder || null });
    }).catch(() => { /* 값이 없으면 문안에서 그 줄이 빠진다 */ });
  }, [onboarding, bank.line]);

  /**
   * 플랜 바꾸기. 플랜은 앱 매장 레코드에 있고 월 이용료는 영업 기록에 있다.
   * 유료로 올리는데 금액이 비어 있으면 청구가 못 나가므로 **비어 있을 때만** 캠퍼스 기본값을 같이 채운다.
   * 이미 적힌 금액은 건드리지 않는다 — 정든밤 22,000 같은 예외가 있다.
   */
  const [tierBusy, setTierBusy] = useState(false);
  const [tierMsg, setTierMsg] = useState<string | null>(null);
  /**
   * 방금 고른 값. 목록이 다시 돌아오기 전까지 이걸 보여 준다.
   * 없으면 칸이 **옛 값으로 되돌아간 것처럼** 보인다 — 저장은 됐는데 화면만 안 따라온 것이라
   * 사람은 안 바뀌었다고 읽는다 (민열님 0914 제보).
   */
  const [tierLocal, setTierLocal] = useState<string | null>(null);
  useEffect(() => { setTierLocal(null); setTierMsg(null); }, [id]);
  async function changeTier(tier: string) {
    if (tierBusy) return;
    setTierBusy(true); setTierMsg(null); setTierLocal(tier);
    try {
      const res = await fetch(`/api/dashboard/admin/restaurants/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: tier || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setTierMsg(`바꾸지 못했습니다 — ${(d as { detail?: string }).detail ?? res.status}`);
        setTierLocal(null);   // 저장이 안 됐으니 원래 값으로 되돌린다
        return;
      }
      const fee = defaultMonthlyFee(tier, o.campus);
      if (fee && fee > 0 && !o.monthly_fee) {
        onPatch(id, { monthly_fee: fee, pay_cycle: o.pay_cycle ?? "MONTHLY" });
        setTierMsg(`${tier || "미지정"} 으로 바꿨습니다. 월 이용료가 비어 있어 ${fee.toLocaleString()}원(기본값)도 같이 넣었습니다.`);
      } else {
        setTierMsg(`${tier || "미지정"} 으로 바꿨습니다.`);
      }
      // 플랜은 ops 가 아니라 매장 레코드에 있다 — 목록을 다시 읽지 않으면 표와 이 칸이 옛 값을 문다
      onReload?.();
    } catch {
      setTierMsg("서버에 연결하지 못했습니다.");
      setTierLocal(null);
    } finally { setTierBusy(false); }
  }

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
      onClose={closeGuarded}
      title={row.name}
      subtitle={[o.campus ?? "경북대", o.map_name && o.map_name !== row.name ? `지도 표기 ${o.map_name}` : null, `매장 ID ${id}`, o.sheet_owner && `담당 ${o.sheet_owner}`].filter(Boolean).join(" · ")}
      badge={row.tier ? <Chip tone={row.tier === "BOOST" ? "amber" : row.tier === "CONTENT" ? "navy" : "gray"}>{row.tier === "CONTENT" ? "Premium" : row.tier === "BOOST" ? "Boost" : "무료"}</Chip> : <Chip tone="gray">플랜 미지정</Chip>}
      width="lg"
      footer={
        <>
          {/* 월납 + 이번 달 청구가 있으면 계산서 건에 입금을 찍는다 — 매장 현황·입금 현황·런처가 전부 그 건을 본다 */}
          {paid && invoice && !invoice.paid_at && onMarkPaid && <Button variant="primary" icon={<IconCheck />} onClick={() => onMarkPaid(invoice)}>{invoice.period.slice(5).replace(/^0/, "")}월 입금 확인</Button>}
          {paid && (!invoice || o.pay_cycle === "LUMP") && o.billing !== "PAID" && <Button variant="primary" icon={<IconCheck />} onClick={() => onPatch(id, { billing: "PAID", invoice: "ISSUED" })}>{o.pay_cycle === "LUMP" ? "일시납 입금 확인" : "입금 확인 처리"}</Button>}
          {/* 계약 전에도 보여야 한다 — 온보딩이 곧 계약이다 */}
          <OnboardLink rid={id} name={row.name} campus={o.campus ?? "경북대"} tier={row.tier} fee={o.monthly_fee} ownerPhone={o.owner_phone} />
          {/* 적어 둔 게 있을 때만 켜진다 — 꺼져 있으면 보낼 게 없다는 뜻이다 (민열님 0915) */}
          <Button variant={dirty ? "primary" : "secondary"} disabled={!dirty || saving} icon={<IconDeviceFloppy />} onClick={saveDraft}>
            {saving ? "저장 중…" : dirty ? `변동사항 저장 ${dirty}` : "변동사항 저장"}
          </Button>
          {onGo && <Button variant="ghost" icon={<IconFiles />} onClick={() => onGo("astro-docs")}>자료실</Button>}
          <span className="ml-auto text-[12px] text-gray-400">{o.updated_at ? `${agoLabel(o.updated_at)}${o.updated_by ? ` · ${o.updated_by}` : ""}` : "아직 기록 없음"}</span>
        </>
      }
    >
      <Stepper steps={STEPS} current={stepOf(o)} />

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-[11.5px] text-gray-600">
        <span className="font-semibold text-gray-700">이 값 어디에 저장되나요?</span>
        <span><SourceBadge src="app" /> 고치면 <b>손님 화면·적립</b>에 바로 반영</span>
        <span><SourceBadge src="ops" /> 우리끼리 보는 <b>영업 기록</b></span>
        <span><SourceBadge src="sheet" /> 예전 시트에서 옮겨 온 <b>메모</b> — 앱은 안 바뀜</span>
      </div>

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

      <PanelSection title="앱에 실제로 나가는 것">
        <StoreAppSection
          id={id}
          isAffiliate={row.is_affiliate !== false}
          onChanged={() => (onReload ? onReload() : onPatch(id, {}))}
          /* 제휴 끄기는 위 블록이 한다. 여기서는 종료일만 남긴다 —
             날짜가 없으면 나중에 "언제 끝났더라"를 아무도 모른다. */
          onEnd={() => onPatch(id, { contract_ends_on: o.contract_ends_on ?? todayLocal() })}
        />
      </PanelSection>

      <PanelSection title="웰컴 키트">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer">
          <span className="text-[13px] text-gray-700">발송 완료<SourceBadge src="ops" /></span>
          <input type="checkbox" checked={o.kit_delivered} onChange={(e) => onPatch(id, { kit_delivered: e.target.checked })} className="w-[18px] h-[18px] accent-[#050072]" />
        </label>
        <div className="mt-3">
          <Cell label={<L src="ops">구성 메모</L>} value={o.kit_note} onCommit={set("kit_note")} placeholder="포스터 1 · 스티커 2 · 손편지" />
        </div>
        <p className="text-[12px] text-gray-500 mt-2">인쇄물 파일 링크는 바로 위 <span className="font-semibold text-gray-700">앱에 실제로 나가는 것 → 포스터·QR</span> 에 있습니다.</p>
      </PanelSection>

      <PanelSection title="계약 — 우리 영업 기록">
        <div className="grid grid-cols-2 gap-3">
          <Cell label={<L src="ops">계약일</L>} value={o.contract_signed_on} onCommit={set("contract_signed_on")} placeholder="2026-08-20" />
          {/* 플랜은 여기서 바로 바꾼다 (민열님 0914). 위 '식당 관리' 블록의 것과 같은 값이라 둘 다 따라 움직인다. */}
          <Field label={<L src="app">플랜</L>} hint={tierMsg ?? "앱과 청구가 같이 보는 값입니다. 바꾸면 바로 반영됩니다."}>
            <Select value={tierLocal ?? row.tier ?? ""} disabled={tierBusy} onChange={(e) => changeTier(e.target.value)}>
              <option value="">미지정</option>
              <option value="FREE">무료</option>
              <option value="BOOST">Boost</option>
              <option value="CONTENT">Premium</option>
            </Select>
          </Field>
          {/* 기본값은 플랜·캠퍼스에서 온다 (영남대·계명대 Boost 49,500). 예외가 많아 늘 고칠 수 있다 — 정든밤 22,000. */}
          <div>
            <Cell
              label="월 이용료 (VAT 포함)"
              value={o.monthly_fee}
              onCommit={(v) => stage("monthly_fee")(v === null ? null : Number(v.replace(/[^\d]/g, "")) || 0)}
              placeholder={String(defaultMonthlyFee(row.tier, o.campus) ?? 33000)}
              type="number"
              hint={feeHint(row.tier, o.campus)}
            />
            {(() => {
              const d = defaultMonthlyFee(row.tier, o.campus);
              if (d === null || d === 0 || o.monthly_fee === d) return null;
              return (
                <button type="button" onClick={() => stage("monthly_fee")(d)}
                  className="mt-1 text-[12px] font-semibold text-navy hover:underline">
                  기본 {d.toLocaleString()}원 넣기
                </button>
              );
            })()}
          </div>
          <Field label={<L src="ops">청구 시작 월</L>} hint="월 중간 합류면 이번 달/다음 달 중 선택. 비우면 계약 시작월">
            <Select value={o.billing_start_period ?? ""} onChange={(e) => stage("billing_start_period")(e.target.value || null)}>
              <option value="">계약 시작월 따름</option>{[0, 1, 2].map((k) => { const p = periodLocal(k); return <option key={p} value={p}>{p.replace("-", "년 ")}월부터</option>; })}{o.billing_start_period && ![0, 1, 2].map(periodLocal).includes(o.billing_start_period) && <option value={o.billing_start_period}>{o.billing_start_period}부터</option>}
            </Select>
          </Field>
          <Field label={<L src="ops">납부 방식</L>}>
            <Select value={o.pay_cycle ?? ""} onChange={(e) => stage("pay_cycle")((e.target.value || null) as PayCycle | null)}>
              <option value="">-</option><option value="MONTHLY">월납</option><option value="LUMP">일시납</option>
            </Select>
          </Field>
          <Cell label={<L src="ops">개시일</L>} hint="이 날부터 최소 이용기간 1개월" value={o.contract_started_on} onCommit={set("contract_started_on")} placeholder="2026-10-01" />
          <Cell label={<L src="ops">종료일</L>} hint="해지했을 때만 적습니다. 계약은 기간의 정함이 없습니다" value={o.contract_ends_on} onCommit={set("contract_ends_on")} placeholder="해지 시에만" />
          <Cell label={<L src="ops">담당자</L>} value={o.sheet_owner} onCommit={set("sheet_owner")} placeholder="준영" />
          <Cell label={<L src="ops">계약서 원본 보관</L>} value={o.contract_original} onCommit={set("contract_original")} placeholder="예: 사무실 파일함 / 드라이브" />
        </div>
      </PanelSection>

      <PanelSection title="혜택 — 계약서에 적은 조건 (영업 기록)">
        <div className="space-y-3">
          <Cell label={<L src="ops">기본 쿠폰 (상시)</L>} value={o.coupon_basic} onCommit={set("coupon_basic")} rows={2} placeholder="예: 메뉴당 1,000원 할인 (포장 제외)" />
          <Cell label={<L src="ops">한정 쿠폰</L>} value={o.coupon_limited} onCommit={set("coupon_limited")} rows={2} placeholder="예: 아메리카노 사이즈업" />
          <div className="grid grid-cols-2 gap-3">
            <Cell label={<L src="ops">스탬프 적립 개수</L>} value={o.stamp_count} onCommit={set("stamp_count")} placeholder="5 / 10 / 20" />
            <Cell label={<L src="ops">식사권 제외 메뉴·시간대</L>} value={o.exclusions} onCommit={set("exclusions")} placeholder="예: 음료 1잔당 1회" />
          </div>
          <Cell label={<L src="ops">스탬프 혜택</L>} value={o.stamp_reward} onCommit={set("stamp_reward")} rows={2} placeholder="예: 5개 타코야끼 · 10개 만원 할인" />
          <Cell label={<L src="ops">별도 견적 항목</L>} value={o.extra_quote} onCommit={set("extra_quote")} placeholder="예: 릴스 8만" />
        </div>
        <p className="text-[12px] text-gray-500 mt-2">앱에 실제로 나가는 쿠폰은 <span className="font-semibold text-gray-700">점주 대시보드 → 쿠폰·스탬프</span>에서 등록합니다. 여기는 계약서에 적힌 조건입니다. 둘이 다르면 정합성 점검이 잡습니다.</p>
      </PanelSection>

      <PanelSection title="플랜 이용">
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">
          <Tri label="학기 중" value={o.semester_active} onChange={(v) => onPatch(id, { semester_active: v })} />
          <Tri label="방학 중" value={o.vacation_active} onChange={(v) => onPatch(id, { vacation_active: v })} />
          <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
            <span className="text-[13px] text-gray-700">테스트 매장<SourceBadge src="ops" /><span className="block text-[11.5px] text-gray-400">집계·청구·캘린더에서 빼고, 온보딩 링크를 제한 없이 발급합니다. 목록에서는 <b>테스트</b> 범위로 옮겨집니다</span></span>
            <input type="checkbox" checked={o.is_test} onChange={(e) => onPatch(id, { is_test: e.target.checked })} className="w-[18px] h-[18px] accent-[#050072]" />
          </label>
        </div>
        <div className="mt-3">
          <Cell label={<L src="sheet">PIN 번호</L>} hint="예전 시트에서 옮겨 온 번호입니다. 실제로 동작하는 값은 위 '앱에 실제로 나가는 것 → 매장 PIN' 입니다" value={o.pin} onCommit={set("pin")} placeholder="1234" />
          {/* 0925: 실제 PIN 을 읽어와 나란히 비교하던 줄이었다. 이제 값을 못 읽으므로 서버에 물어본다. */}
          <PinMemoCheck rid={id} memo={o.pin} />
        </div>
      </PanelSection>

      {/* 계약이 끝난 매장에는 '보낼 것'이 정해져 있다 — 문안 + 안내문·견적서 (민열님 0914). */}
      {(o.contract_started_on || o.contract_signed_on) && (
        <PanelSection title="계약 완료 · 보낼 것">
          <p className="text-[12px] text-gray-600 mb-2">
            운영 시작 전 점주 확인용입니다. 혜택·플랜·이용료는 위 칸에 적힌 값이 그대로 문안에 들어가고, 빈 칸은 문장이 빠집니다.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Button size="sm" variant="primary" icon={<IconMessage2 />} onClick={() => setOnboarding(true)}>안내 문자 문안</Button>
            {onGo && <Button size="sm" variant="ghost" icon={<IconCash />} onClick={() => onGo("astro-tax")}>세금계산서</Button>}
          </div>
          <DocQuickLinks ids={DOC_SETS.onboarding} label="같이 보낼 자료" />
        </PanelSection>
      )}

      {/* 0913: 식당 관리에서 하던 일을 여기로. 이 블록만 백엔드 매장 레코드에 저장된다. */}
      <PanelSection title="매장 정보 — 우리 영업 기록">
        <div className="grid grid-cols-2 gap-3">
          <Field label={<L src="ops">캠퍼스</L>}><CampusPicker value={o.campus ?? "경북대"} options={campusOptions} onChange={(v) => onPatch(id, { campus: v as Campus })} /></Field>
          <Cell label={<L src="ops">지도 링크 (네이버 · 카카오)</L>} value={o.map_url} onCommit={set("map_url")} type="url" placeholder="https://naver.me/…" hint={o.map_name ? `지도 표기: ${o.map_name}` : "지도상 공식 상호를 기준으로 부릅니다"} />
          <Cell label={<L src="ops">대표자</L>} value={o.owner_name} onCommit={set("owner_name")} />
          <Cell label={<L src="ops">연락처</L>} value={o.owner_phone} onCommit={set("owner_phone")} type="tel" />
          <Cell label={<L src="ops">사업자등록번호</L>} value={o.biz_no} onCommit={set("biz_no")} placeholder="세금계산서용" />
          {/* 볼타는 공급받는자 이메일이 **필수**다. 비면 발행 자체가 거절된다 (0915). */}
          <Cell label={<L src="ops">계산서 받을 이메일</L>} value={o.owner_email} onCommit={set("owner_email")} type="email" placeholder="owner@example.com"
            hint={o.owner_email ? undefined : "비어 있으면 세금계산서를 발행할 수 없습니다"} />
        </div>
      </PanelSection>

      <PanelSection title="비고">
        <Cell label={<L src="ops">계약 특이사항 · 점주 요청</L>} value={o.memo} onCommit={set("memo")} rows={3} placeholder="예: 방학엔 쉬고 싶다고 하심, 9월 말 재확인" />
        <p className="text-[12px] text-gray-500 mt-2">
          이 칸들은 여기가 원본입니다. 0921 부터 팀 시트는 쓰지 않습니다 — 세틀라이트·슬랙·카톡 셋만.
        </p>
      </PanelSection>

      <PanelSection title="다른 툴에서 본 이 매장">
        <LinkBlock id={id} name={row.name} onGo={onGo} />
      </PanelSection>

      <PanelSection title="기록"><ActivityLog targetType="store" targetId={String(id)} actor={actor} /></PanelSection>

      {onboarding && (
        <MessageComposer
          open
          initialKind="onboarding"
          ctx={{
            name: row.name, targetType: "store", targetId: String(id),
            owner: o.owner_name, phone: o.owner_phone, fee: o.monthly_fee, period: periodLocal(), sender: actor,
            plan: row.tier, couponBasic: o.coupon_basic, couponLimited: o.coupon_limited,
            stampCount: o.stamp_count, stampReward: o.stamp_reward,
            semester: "26-2학기",
            bank: bank.line, bankHolder: bank.holder,
          }}
          onClose={() => setOnboarding(false)}
        />
      )}
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
          {onGo && <button type="button" onClick={() => onGo("probe-reports")} className="text-[12px] text-navy font-medium hover:underline">매장 리포트</button>}
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
