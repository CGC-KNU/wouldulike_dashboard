"use client";

import { useEffect, useState } from "react";
import { IconLink, IconCopy, IconCheck, IconSend } from "@tabler/icons-react";
import { Button, Field, Input, Notice, Select } from "@/app/dashboard/admin/_shared/ui";

/**
 * 매장 상세 패널 → "온보딩 링크 만들기".
 * 발급 순간 매장에 임시 PIN 이 심긴다(api/onboard/issue). 링크는 한 번 쓰고 나면 세션을 못 만든다 — 다시 필요하면 다시 발급.
 */
type Plan = "FREE" | "BOOST" | "PREMIUM";
const tierToPlan = (tier: string | null): Plan => tier === "BOOST" ? "BOOST" : tier === "PREMIUM" || tier === "CONTENT" ? "PREMIUM" : "FREE";

export default function OnboardLink({ rid, lid = null, name, campus, tier, fee, ownerPhone = null, actor = "", actorPhone = "", autoOpen = false }: { rid: number; lid?: string | null; name: string; campus: string; tier: string | null; fee: number | null; ownerPhone?: string | null; actor?: string; actorPhone?: string; autoOpen?: boolean }) {
  // 방금 만든 매장이면 열린 채로 시작한다 — 추가하자마자 링크를 뽑는 흐름이라 한 번 더 누를 이유가 없다 (0923)
  const [open, setOpen] = useState(autoOpen);
  const [plan, setPlan] = useState<Plan>(tierToPlan(tier));
  /**
   * ⚠️ 두 값의 뜻이 다르다.
   *   매장 운영행 `monthly_fee` — **부가세 포함** (경북대 Boost 33,000, lib/draft/pricing.ts)
   *   온보딩 토큰 `fee`        — **부가세 별도** (계약서 제3조 "표시 금액은 부가가치세 별도")
   * 그대로 옮겨 담으면 33,000 이 별도값이 되어 청구가 36,300 으로 뛴다 (0922 실측).
   * 그래서 받아올 때 나눠서 채운다.
   */
  const [feeIn, setFeeIn] = useState<string>(fee ? String(Math.round(fee / 1.1)) : "");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<{ url: string; kakao_text: string; expires_at: string; short_id: string } | null>(null);
  const [copied, setCopied] = useState<"url" | "text" | null>(null);
  // 기존 PIN 이 있으면 발급이 그것을 갈아엎는다 — 운영 중인 매장에서 사고가 나는 지점이라 미리 경고한다.
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  // 서버가 실제로 "PIN 이 있어 막았다"(409 has_pin)고 답한 상태.
  // 이때 같은 버튼을 다시 누르는 건 아무 의미가 없다 — 라우트에 force 가 없어 같은 409 가 온다.
  // 그래서 재시도를 권하지 않고, 실제로 통하는 길을 적는다 (0921).
  const [blocked, setBlocked] = useState(false);
  const [restorePin, setRestorePin] = useState("");
  const [restored, setRestored] = useState<string | null>(null);
  // 알림톡 — 키·템플릿이 아직 없을 수 있다. 그때는 "보낸 척"하지 않고 무엇이 비었는지 그대로 적는다.
  const [talk, setTalk] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!open || talk) return;
    fetch("/api/alimtalk/send?template=onboard_link").then((r) => (r.ok ? r.json() : null))
      .then((j) => setTalk(j ?? { configured: false, missing: ["설정을 읽지 못했습니다"] })).catch(() => null);
  }, [open, talk]);
  useEffect(() => {
    if (!open || hasPin !== null) return;
    // 기존 PIN 이 있으면 발급이 막힌다. 다만 우리가 심은 임시 PIN 이면 재발급이므로 서버가 허용한다 —
    // 화면은 그 구분을 모르니 발급을 시도해 보고 409 일 때만 막힌 것으로 본다.
    fetch(`/api/dashboard/restaurant?rid=${rid}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { has_pin?: boolean } | null) => setHasPin(Boolean(j?.has_pin))).catch(() => setHasPin(null));
  }, [open, hasPin, rid]);

  const issue = async () => {
    setBusy(true); setErr(null); setBlocked(false);
    try {
      // 미팅에서 받아 둔 사장님 번호 — 있으면 링크가 그 번호로만 열린다 (lib/onboard/token.ts phoneMatches)
      const body: Record<string, unknown> = { rid, lid, name, campus, plan, days: Number(days) || 14, ...(ownerPhone ? { phone: ownerPhone } : {}) };
      if (plan !== "FREE" && feeIn.trim()) body.fee = Number(feeIn.replace(/\D/g, ""));
      if (plan === "FREE") body.fee = 0;
      const r = await fetch("/api/onboard/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { detail?: string; url?: string; kakao_text?: string; expires_at?: string; short_id?: string; has_pin?: boolean };
      if (j.has_pin) setBlocked(true);
      if (!r.ok || !j.url) throw new Error(j.detail ?? `발급 실패 (${r.status})`);
      setOut({ url: j.url, kakao_text: j.kakao_text ?? j.url, expires_at: j.expires_at ?? "", short_id: j.short_id ?? "" });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  /** 손으로 카톡에 붙여넣던 것을 그대로 알림톡으로. 번호는 링크를 묶어 둔 사장님 번호와 같다. */
  const sendTalk = async () => {
    if (!out || !ownerPhone) return;
    setSending(true); setSent(null);
    try {
      const won = plan === "FREE" ? "0" : String(Math.round(Number(feeIn.replace(/\D/g, "") || 0) * 1.1));
      const r = await fetch("/api/alimtalk/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "onboard_link", to: ownerPhone,
          variables: {
            "#{매장명}": name,
            "#{플랜}": plan === "FREE" ? "무료" : plan === "BOOST" ? "Boost" : "Premium",
            "#{이용료}": won,
            "#{시작월}": new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long" }),
            "#{담당자}": actor || "담당자",
            "#{담당자연락처}": actorPhone || "-",
            "#{토큰}": out.url.split("/onboard/")[1] ?? "",
          },
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { detail?: string };
      setSent(j.detail ?? (r.ok ? "보냈습니다." : "보내지 못했습니다."));
    } catch { setSent("보내지 못했습니다."); } finally { setSending(false); }
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
              <p className="text-[12px] mb-2">
                {ownerPhone
                  ? <span className="text-gray-700">본인 확인 · 카카오 로그인 직후 <b>{ownerPhone}</b> 를 적어야 점주 계정이 만들어집니다.</span>
                  : <span className="text-amber-800">
                      이 매장에는 <b>대표자 연락처가 없습니다.</b> 그러면 <b>링크를 받은 누구나</b> 아무 카카오 계정으로 그 매장 점주가 됩니다 —
                      카톡으로 전달된 링크도 그대로 열립니다. 아래 운영 항목에 번호를 먼저 넣어 주세요.
                    </span>}
              </p>
              {hasPin === true && (
                <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                  <b>이 매장은 이미 매장 PIN 이 있습니다.</b> 그 번호는 점주 로그인뿐 아니라
                  <b> 손님 스탬프 적립·쿠폰 사용</b>에도 쓰이므로, 운영 중인 매장이면 발급이 막힙니다.<br />
                  전에 온보딩 링크를 냈다가 안 끝낸 매장이면 그대로 <b>재발급</b>됩니다. 눌러 보시면 서버가 판단합니다.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="플랜"><Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}><option value="FREE">무료</option><option value="BOOST">Boost</option><option value="PREMIUM">Premium</option></Select></Field>
                <Field label="유효기간(일)"><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
                <div className="col-span-2">
                  <Field label="월 이용료 (부가세 별도)" hint={plan === "FREE" ? "무료 플랜" : "비우면 상권 기본값 — 경북대 30,000 · 그 외 45,000"}><Input inputMode="numeric" disabled={plan === "FREE"} value={plan === "FREE" ? "0" : feeIn} onChange={(e) => setFeeIn(e.target.value)} placeholder={campus === "경북대" ? "30000" : "45000"} /></Field>
                  {/* 계약서와 입금 안내에 찍히는 건 아래 '실제 청구' 금액이다. 두 숫자를 같이 보여 줘야 별도/포함을 헷갈리지 않는다. */}
                  {plan !== "FREE" && (() => {
                    const base = Number((feeIn || (campus === "경북대" ? "30000" : "45000")).replace(/\D/g, "")) || 0;
                    return <p className="text-[12px] text-gray-600 -mt-1">사장님께는 <b className="text-gray-900">월 {(base + Math.round(base * 0.1)).toLocaleString()}원</b> 으로 안내됩니다 <span className="text-gray-400">({base.toLocaleString()} + 부가세 {Math.round(base * 0.1).toLocaleString()})</span></p>;
                  })()}
                </div>
              </div>
              {err && <div className="mt-2"><Notice tone="red" title="발급하지 못했습니다">{err}</Notice></div>}
              {restored && <div className="mt-2"><Notice tone="blue" title="PIN 을 복구했습니다">{restored}</Notice></div>}
              {blocked && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <b>같은 버튼을 다시 눌러도 결과는 같습니다.</b> 통하는 길은 둘뿐입니다.<br />
                  · <b>테스트 매장</b>이면 아래 운영 항목의 <b>테스트 매장</b>을 켜고 다시 시도하세요.<br />
                  · <b>운영 중인 매장</b>이면 발급하지 마세요. 사장님께 <b>현재 매장 번호</b>를 안내해 점주 대시보드로 바로 로그인하시게 하는 것이 맞습니다.
                </div>
              )}
              <div className="flex gap-2 mt-2"><Button variant="primary" size="sm" disabled={busy} onClick={issue}>{busy ? "발급 중…" : blocked ? "다시 시도" : "링크 발급"}</Button><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>닫기</Button></div>
              {/* 실수로 발급한 뒤 되돌리는 길 — 원래 PIN 은 시트 '계약 세부사항' PIN 번호 열에 있다 */}
              <details className="mt-3">
                <summary className="text-[11.5px] text-gray-500 cursor-pointer">실수로 발급했다면 — PIN 되돌리기</summary>
                <p className="text-[11.5px] text-gray-500 mt-1 mb-1.5">사장님이 쓰시던 원래 매장 번호를 넣으면 그대로 되돌립니다. 아래 <b>식당 관리 → 매장 PIN</b> 칸이 실제 동작하는 값이고, 운영 필드의 <b>PIN 번호</b> 는 시트를 비추는 메모입니다.</p>
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
              <div className="flex gap-2 mt-2"><Button variant="primary" size="sm" icon={copied === "text" ? <IconCheck /> : <IconCopy />} onClick={() => copy("text")}>{copied === "text" ? "복사됨" : "카톡 문안 복사"}</Button>{talk?.configured && ownerPhone && <Button variant="secondary" size="sm" icon={<IconSend />} onClick={sendTalk} disabled={sending}>{sending ? "보내는 중…" : "알림톡 보내기"}</Button>}<Button variant="ghost" size="sm" onClick={() => { setOut(null); }}>다시 발급</Button><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>닫기</Button></div>
              {sent && <p className="text-[11.5px] text-gray-600 mt-1.5">{sent}</p>}
              {talk && !talk.configured && (
                <p className="text-[11.5px] text-gray-400 mt-1.5">
                  알림톡은 아직 설정 전입니다 — {talk.missing.join(" · ")}. 그때까지는 위 문안을 복사해 보내 주세요.
                </p>
              )}
              {talk?.configured && !ownerPhone && (
                <p className="text-[11.5px] text-amber-700 mt-1.5">사장님 번호가 없어 알림톡을 보낼 수 없습니다 — 매장에 번호를 먼저 적어 주세요.</p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
