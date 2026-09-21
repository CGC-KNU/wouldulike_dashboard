"use client";

import { useState } from "react";
import { IconLink, IconCopy, IconCheck } from "@tabler/icons-react";
import { Button, Field, Input, Notice, Select } from "@/app/dashboard/admin/_shared/ui";

/**
 * 매장 상세 패널 → "온보딩 링크 만들기".
 * 발급 순간 매장에 임시 PIN 이 심긴다(api/onboard/issue). 링크는 한 번 쓰고 나면 세션을 못 만든다 — 다시 필요하면 다시 발급.
 */
type Plan = "FREE" | "BOOST" | "PREMIUM";
const tierToPlan = (tier: string | null): Plan => tier === "BOOST" ? "BOOST" : tier === "PREMIUM" || tier === "CONTENT" ? "PREMIUM" : "FREE";

export default function OnboardLink({ rid, lid = null, name, campus, tier, fee }: { rid: number; lid?: string | null; name: string; campus: string; tier: string | null; fee: number | null }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>(tierToPlan(tier));
  const [feeIn, setFeeIn] = useState<string>(fee ? String(fee) : "");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<{ url: string; kakao_text: string; expires_at: string; short_id: string } | null>(null);
  const [copied, setCopied] = useState<"url" | "text" | null>(null);

  const issue = async () => {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { rid, lid, name, campus, plan, days: Number(days) || 14 };
      if (plan !== "FREE" && feeIn.trim()) body.fee = Number(feeIn.replace(/\D/g, ""));
      if (plan === "FREE") body.fee = 0;
      const r = await fetch("/api/onboard/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { detail?: string; url?: string; kakao_text?: string; expires_at?: string; short_id?: string };
      if (!r.ok || !j.url) throw new Error(j.detail ?? `발급 실패 (${r.status})`);
      setOut({ url: j.url, kakao_text: j.kakao_text ?? j.url, expires_at: j.expires_at ?? "", short_id: j.short_id ?? "" });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const copy = async (what: "url" | "text") => { if (!out) return; await navigator.clipboard.writeText(what === "url" ? out.url : out.kakao_text).catch(() => null); setCopied(what); setTimeout(() => setCopied(null), 1500); };

  return (
    <>
      <Button size="sm" variant="secondary" icon={<IconLink />} onClick={() => setOpen((v) => !v)}>온보딩 링크</Button>
      {open && (
        <div className="mt-2 w-full rounded-xl border border-navy/20 bg-navy/[0.03] p-3">
          {!out ? (
            <>
              <p className="text-[12px] text-gray-600 mb-2">사장님께 카톡으로 보낼 링크입니다. 계약(약관 동의)·PIN·혜택·입금·키트까지 이 링크 안에서 끝납니다. <b>발급 즉시 매장에 임시 PIN 이 설정됩니다.</b></p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="플랜"><Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}><option value="FREE">무료</option><option value="BOOST">Boost</option><option value="PREMIUM">Premium</option></Select></Field>
                <Field label="월 이용료(별도)" hint={plan === "FREE" ? "무료" : "비우면 상권 기본값"}><Input inputMode="numeric" disabled={plan === "FREE"} value={plan === "FREE" ? "0" : feeIn} onChange={(e) => setFeeIn(e.target.value)} placeholder={campus === "경북대" ? "30000" : "45000"} /></Field>
                <Field label="유효기간(일)"><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
              </div>
              {err && <div className="mt-2"><Notice tone="red" title="발급하지 못했습니다">{err}</Notice></div>}
              <div className="flex gap-2 mt-2"><Button variant="primary" size="sm" disabled={busy} onClick={issue}>{busy ? "발급 중…" : "링크 발급"}</Button><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>닫기</Button></div>
            </>
          ) : (
            <>
              <p className="text-[12px] text-gray-700 mb-1"><b>#{out.short_id}</b> · {new Date(out.expires_at).toLocaleDateString("ko-KR")}까지 유효 · 채널에는 토큰이 안 올라갑니다</p>
              <div className="flex gap-1 items-center"><Input readOnly value={out.url} className="text-[11px]" /><Button size="sm" icon={copied === "url" ? <IconCheck /> : <IconCopy />} onClick={() => copy("url")}>{copied === "url" ? "복사됨" : "URL"}</Button></div>
              <textarea readOnly value={out.kakao_text} rows={6} className="mt-2 w-full text-[12px] rounded-[10px] bg-white border border-gray-200 p-2 text-gray-800" />
              <div className="flex gap-2 mt-2"><Button variant="primary" size="sm" icon={copied === "text" ? <IconCheck /> : <IconCopy />} onClick={() => copy("text")}>{copied === "text" ? "복사됨" : "카톡 문안 복사"}</Button><Button variant="ghost" size="sm" onClick={() => { setOut(null); }}>다시 발급</Button><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>닫기</Button></div>
            </>
          )}
        </div>
      )}
    </>
  );
}
