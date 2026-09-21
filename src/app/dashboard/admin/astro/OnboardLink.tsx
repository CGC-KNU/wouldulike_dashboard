"use client";

import { useEffect, useState } from "react";
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
  // 기존 PIN 이 있으면 발급이 그것을 갈아엎는다 — 운영 중인 매장에서 사고가 나는 지점이라 미리 경고한다.
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [restorePin, setRestorePin] = useState("");
  const [restored, setRestored] = useState<string | null>(null);
  useEffect(() => {
    if (!open || hasPin !== null) return;
    fetch(`/api/dashboard/restaurant?rid=${rid}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { pin?: string | null } | null) => setHasPin(Boolean(j?.pin))).catch(() => setHasPin(null));
  }, [open, hasPin, rid]);

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
              <p className="text-[12px] text-gray-600 mb-2">사장님께 카톡으로 보낼 링크입니다. 계약(약관 동의)·PIN·혜택·입금·키트까지 이 링크 안에서 끝납니다.</p>
              {hasPin === true && (
                <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                  <b>이 매장은 이미 PIN 이 있습니다.</b> 발급하면 PIN 이 임시값으로 바뀌어,
                  사장님이 쓰시던 <b>기존 PIN 으로는 로그인이 안 됩니다.</b> 온보딩을 마치면 사장님이 새 PIN 을 직접 정합니다.
                  운영 중인 매장이면 사장님께 먼저 말씀드리고 발급하세요.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="플랜"><Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}><option value="FREE">무료</option><option value="BOOST">Boost</option><option value="PREMIUM">Premium</option></Select></Field>
                <Field label="유효기간(일)"><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
                <div className="col-span-2">
                  <Field label="월 이용료 (부가세 별도)" hint={plan === "FREE" ? "무료 플랜" : "비우면 상권 기본값"}><Input inputMode="numeric" disabled={plan === "FREE"} value={plan === "FREE" ? "0" : feeIn} onChange={(e) => setFeeIn(e.target.value)} placeholder={campus === "경북대" ? "30000" : "45000"} /></Field>
                </div>
              </div>
              {err && <div className="mt-2"><Notice tone="red" title="발급하지 못했습니다">{err}</Notice></div>}
              {restored && <div className="mt-2"><Notice tone="blue" title="PIN 을 복구했습니다">{restored}</Notice></div>}
              <div className="flex gap-2 mt-2"><Button variant="primary" size="sm" disabled={busy} onClick={issue}>{busy ? "발급 중…" : "링크 발급"}</Button><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>닫기</Button></div>
              {/* 실수로 발급한 뒤 되돌리는 길 — 원래 PIN 은 시트 '계약 세부사항' PIN 번호 열에 있다 */}
              <details className="mt-3">
                <summary className="text-[11.5px] text-gray-500 cursor-pointer">실수로 발급했다면 — PIN 되돌리기</summary>
                <p className="text-[11.5px] text-gray-500 mt-1 mb-1.5">사장님이 쓰시던 원래 PIN 을 넣으면 그대로 되돌립니다. 시트 <b>계약 세부사항 → PIN 번호</b> 열에 있습니다.</p>
                <div className="flex items-end gap-2">
                  <Field label="원래 PIN"><Input inputMode="numeric" maxLength={6} value={restorePin} onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, ""))} placeholder="0000" className="w-24" /></Field>
                  <Button size="sm" disabled={busy || restorePin.length < 4} onClick={async () => {
                    setBusy(true); setErr(null); setRestored(null);
                    try {
                      const r = await fetch("/api/onboard/restore-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rid, pin: restorePin }) });
                      const j = (await r.json().catch(() => ({}))) as { detail?: string; ok?: boolean; already?: boolean };
                      if (!r.ok || !j.ok) throw new Error(j.detail ?? `복구 실패 (${r.status})`);
                      setRestored(j.already ? "이미 그 PIN 이었습니다. 바뀐 것 없습니다." : `${name} PIN 을 되돌렸습니다. 사장님은 원래 PIN 으로 로그인하실 수 있습니다.`);
                      setRestorePin(""); setHasPin(true);
                    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
                  }}>되돌리기</Button>
                </div>
              </details>
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
