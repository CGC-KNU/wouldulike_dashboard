"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconCopy, IconMessage2 } from "@tabler/icons-react";
import { byteLen, defaultKind, smsHref, templates, type MsgContext, type MsgKind } from "@/lib/draft/message";
import type { Activity } from "@/lib/draft/types";
import { Button, Field, Input, PanelSection, SlideOver, Textarea, focusRing } from "../_shared/ui";

/**
 * 문자 보내기 — 입금·미팅 팔로업 (민열님 0911).
 *
 * 브라우저가 문자를 직접 보낼 수는 없다. 그래서 **상황에 맞는 문안을 만들고 → 사람이 고치고 → 문자 앱을 열거나 복사**한다.
 * 보낸 뒤 '기록 남기기'를 누르면 그 매장·후보의 활동 기록에 남아 다음 사람이 안다(팔로업의 핵심).
 */

export default function MessageComposer({ ctx, event, open, onClose, onSent }: {
  ctx: MsgContext;
  /** 캘린더·입금 현황에서 무엇을 눌렀는지 — 기본 문안을 고르는 데만 쓴다. */
  event?: { kind: "payment" | "meeting" | "contract" | "due"; overdue?: boolean; tomorrow?: boolean; past?: boolean };
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const list = useMemo(() => templates(ctx), [ctx]);
  const [kind, setKind] = useState<MsgKind>(() => (event ? defaultKind(event.kind, event) : "payment_notice"));
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState(ctx.phone ?? "");
  const [copied, setCopied] = useState(false);
  const [logged, setLogged] = useState(false);

  useEffect(() => { setBody(list.find((t) => t.kind === kind)?.text ?? ""); }, [kind, list]);
  useEffect(() => { if (open) { setKind(event ? defaultKind(event.kind, event) : "payment_notice"); setPhone(ctx.phone ?? ""); setCopied(false); setLogged(false); } }, [open, ctx.phone, event]);

  const bytes = byteLen(body);
  const digits = phone.replace(/[^\d]/g, "");
  const canSend = digits.length >= 9 && body.trim().length > 0;

  async function copy() {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 무시 */ }
  }
  /** 보냈다는 사실을 기록에 남긴다 — 툴이 모르면 팔로업이 안 된다. */
  async function log() {
    const label = list.find((t) => t.kind === kind)?.label ?? "문자";
    await fetch("/api/astro/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: ctx.targetType, target_id: ctx.targetId, kind: "문자", body: `${label} 문자 발송 — ${body.split("\n").filter(Boolean)[1] ?? body.slice(0, 40)}`, author: ctx.sender } satisfies Partial<Activity> & { author?: string }),
    }).catch(() => {});
    setLogged(true); onSent?.();
  }

  const groups = ["입금", "미팅", "계약", "기타"] as const;
  return (
    <SlideOver open={open} onClose={onClose} title={`${ctx.name} · 문자`} subtitle={[ctx.owner && `${ctx.owner} 사장님`, ctx.period && `${Number(ctx.period.slice(5))}월분`, ctx.fee && `${ctx.fee.toLocaleString()}원`].filter(Boolean).join(" · ") || "문안을 고르고 고쳐서 보냅니다"}
      footer={
        <>
          <a href={canSend ? smsHref(phone, body) : undefined} onClick={() => { if (canSend && !logged) setTimeout(log, 400); }} aria-disabled={!canSend}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold ${canSend ? "bg-[linear-gradient(180deg,#1512a3,#050072)] text-white shadow-[0_6px_16px_-8px_rgba(5,0,114,0.7)]" : "bg-gray-100 text-gray-400 pointer-events-none"} ${focusRing}`}>
            <IconMessage2 size={16} aria-hidden="true" /> 문자 앱 열기
          </a>
          <Button icon={<IconCopy />} onClick={copy}>{copied ? "복사했습니다" : "문안 복사"}</Button>
          <Button variant="ghost" icon={<IconCheck />} onClick={log} disabled={logged}>{logged ? "기록됨" : "보냈음 기록"}</Button>
          <span className="ml-auto text-[12px] text-gray-400">{bytes} 바이트 · {bytes <= 90 ? "SMS" : "LMS"}</span>
        </>
      }>
      <PanelSection title="상황">
        <div className="space-y-2">
          {groups.map((g) => {
            const items = list.filter((t) => t.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-400 w-8">{g}</span>
                {items.map((t) => (
                  <button key={t.kind} type="button" onClick={() => setKind(t.kind)} aria-pressed={kind === t.kind}
                    className={`h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors ${focusRing} ${kind === t.kind ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-black/[0.08] hover:border-navy/30"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="받는 사람">
        <div className="grid grid-cols-2 gap-3">
          <Field label="번호" hint={ctx.phone ? undefined : "매장·후보에 연락처가 없어 직접 적어야 합니다"}><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="010-0000-0000" /></Field>
          <Field label="대표자"><Input value={ctx.owner ?? ""} disabled /></Field>
        </div>
      </PanelSection>

      <PanelSection title="문안 (고쳐서 보내세요)">
        <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="text-[13px] leading-relaxed" />
        <p className="text-[12px] text-gray-500 mt-2">
          금액·월·날짜는 이 매장의 실제 값만 들어갑니다. <strong>계좌번호·사업자번호는 넣지 않습니다</strong> — 문자는 남고 돌아다닙니다.
          {bytes > 90 && <> 90바이트가 넘어 <strong>LMS</strong>로 나갑니다(요금이 다를 수 있습니다).</>}
        </p>
      </PanelSection>
    </SlideOver>
  );
}
