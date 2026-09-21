"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ImageUploader from "@/components/ImageUploader";
import { Button, Field, Input, Notice, Spinner, Stepper, Textarea } from "@/app/dashboard/admin/_shared/ui";

/**
 * 점주 온보딩 7단계 — 카톡 링크 하나로 계약·혜택·입금·키트까지.
 * 설계 원문: CGC/04_사내툴_개발/0921_점주_온보딩_설계 (결정 반영본).
 *
 * 순서가 곧 논리다: [0] 내 매장 맞나 → [1] 플랜 → [2] 계약(개별 체크·서명) → [3] 혜택(스탬프 필수) → [4] 입금(유료만) → [5] 키트 → [6] 완료.
 * 서버가 [2]와 [3]을 강제한다(consent 스탬프 쿠키·stamp-rule 확인). 여기서는 사장님이 안 헤매게 하는 것만 신경 쓴다.
 */

type Plan = "FREE" | "BOOST" | "PREMIUM";
interface Meta {
  ok: boolean; short_id: string;
  store: { rid: number; lid: string | null; name: string; campus: string; plan: Plan; plan_label: string; fee: number; vat: number };
  terms: { version: string; hash: string; schedule: { starts_on: string; min_term_to: string; campaign_due: string }; articles: { no: string; title: string; body: string[] }[]; checks: { id: string; article: string; text: string }[] };
  examples: { stamp: readonly string[]; coupon: readonly { benefit: string; cond: string }[] };
  session: { ok: boolean; kakao_id: string | null };
  progress: { consent: boolean };
  bank: { name: string; account: string; holder: string } | null;
  sms_enabled: boolean; done: boolean; expires_at: string;
}
interface Draft {
  step: number;
  owner_name: string; biz_no: string; phone: string; email: string; pin_set: boolean;
  checks: Record<string, string>; signature: string; consent_at: string | null; contract_url: string | null;
  /** 고른 스탬프 칸(1~10) → 그 칸의 보상 문구 */
  stamp_steps: Record<string, string>;
  stamp_note: string;
  /** 일반 쿠폰 — 여러 개 등록할 수 있다 (시트에 2개 이상 적은 매장이 있다) */
  coupons: { benefit: string; cond: string }[];
  /** 한정 쿠폰 — Boost 이상. 학생회 채널로 매달 나간다 */
  special: { benefit: string; cond: string } | null;
  photo_urls: string[];
  paid_clicked: boolean; kit_address: string; kit_ok: boolean; starts_on: string | null;
}
const STEPS = ["내 매장", "플랜", "계약", "혜택", "입금", "키트", "완료"];
const fmtWon = (n: number) => n.toLocaleString("ko-KR") + "원";
const kdate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${y}. ${Number(m)}. ${Number(d)}.`; };
const emptyDraft = (): Draft => ({ step: 0, owner_name: "", biz_no: "", phone: "", email: "", pin_set: false, checks: {}, signature: "", consent_at: null, contract_url: null, stamp_steps: {}, stamp_note: "", coupons: [], special: null, photo_urls: [], paid_clicked: false, kit_address: "", kit_ok: false, starts_on: null });

export default function OnboardClient({ token }: { token: string }) {
  const sp = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useMemo(() => `ob_${token.slice(-16)}`, [token]);

  // 이어하기 — 브라우저에만 남는 초안. 민감값은 서버가 다시 받으므로 여기 남아도 계약 증거가 아니다.
  useEffect(() => { try { const raw = sessionStorage.getItem(key); if (raw) setD({ ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) }); } catch { /* 무시 */ } }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(d)); } catch { /* 무시 */ } }, [key, d]);
  const patch = useCallback((p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p })), []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/onboard/${token}`, { cache: "no-store" });
    if (!r.ok) { setFatal(r.status === 410 ? "이 링크는 기한이 지났습니다." : "유효하지 않은 링크입니다."); return null; }
    const m = (await r.json()) as Meta; setMeta(m); return m;
  }, [token]);

  // 첫 진입 / 카카오에서 돌아옴(?resume=1) → 세션 교환
  useEffect(() => {
    (async () => {
      const m = await load(); if (!m) return;
      if (m.done) { patch({ step: 6 }); return; }
      if (!m.session.ok && sp.get("resume") === "1") {
        const s = await fetch(`/api/onboard/${token}/session`, { method: "POST" });
        const j = (await s.json().catch(() => ({}))) as { success?: boolean; message?: string; need_kakao?: boolean };
        if (j.success) { await load(); history.replaceState(null, "", location.pathname); }
        else if (!j.need_kakao) setErr(j.message ?? "로그인에 실패했습니다.");
      }
    })();
  }, [load, patch, sp, token]);

  const startKakao = () => {
    const id = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID, uri = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
    const state = encodeURIComponent(`onboard:${token}`);
    location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${id}&redirect_uri=${uri}&response_type=code&scope=profile_nickname&state=${state}`;
  };

  /**
   * 담당자가 자기 브라우저에서 온보딩을 시험할 때를 위한 길.
   * 이미 대시보드 세션이 있으면 그 세션이 이 매장 점주가 아니어서 [0]단계가 막힌다 — 세션을 비우고 다시 시작한다.
   */
  const restart = async () => {
    await fetch("/api/auth/logout").catch(() => null);
    try { sessionStorage.removeItem(key); } catch { /* 무시 */ }
    startKakao();
  };

  if (fatal) return <Shell><p className="text-[15px] text-gray-800">{fatal}</p></Shell>;
  if (!meta) return <Shell><div className="flex items-center gap-2 text-gray-500 text-[13px]"><Spinner size={16} /> 불러오는 중…</div></Shell>;

  const s = meta.store, paid = s.plan !== "FREE";
  const rq = `?rid=${s.rid}`;

  /* ── 로그인 전 — 매장·플랜 요약 + 카카오 시작 ── */
  if (!meta.session.ok) {
    return (
      <Shell>
        <p className="text-[12px] text-gray-500 mb-1">우주라이크 파트너 등록</p>
        <h1 className="text-[22px] font-bold text-gray-900 leading-tight mb-1">{s.name} 사장님, 안녕하세요.</h1>
        <p className="text-[14px] text-gray-600 mb-5">카카오 로그인 후 <b>5분 정도</b>면 계약과 혜택 등록이 끝납니다. 중간에 나가셔도 이어서 하실 수 있습니다.</p>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-5 text-[13.5px]">
          <Row k="매장" v={s.name} /><Row k="상권" v={s.campus} /><Row k="플랜" v={`${s.plan_label}${paid ? ` · 월 ${fmtWon(s.fee)} (부가세 별도)` : ""}`} />
        </div>
        {err && <Notice tone="red" title="로그인 오류">{err}</Notice>}
        <Button variant="primary" size="md" className="w-full bg-[#FEE500] text-[#191919] hover:bg-[#f5dc00]" onClick={startKakao}>카카오로 시작하기</Button>
        <button type="button" onClick={restart} className="mt-2 w-full text-[11.5px] text-gray-400 hover:text-gray-600 underline underline-offset-2">
          다른 계정으로 로그인되어 있나요? 로그아웃하고 다시 시작
        </button>
        <p className="text-[11.5px] text-gray-400 mt-3">링크 유효기간 {new Date(meta.expires_at).toLocaleDateString("ko-KR")} · 문의 hello@wouldulike.kr</p>
      </Shell>
    );
  }

  /* ── 공통 ── */
  const go = (n: number) => { setErr(null); patch({ step: n }); window.scrollTo({ top: 0 }); };
  const post = async (path: string, body?: unknown, method = "POST") => {
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(String(j.detail ?? j.message ?? `오류 (${r.status})`));
    return j;
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  return (
    <Shell wide>
      <div className="mb-5">
        <p className="text-[11.5px] text-gray-500 mb-2">{s.name} · {s.campus} · {s.plan_label}</p>
        <Stepper steps={STEPS} current={d.step} />
      </div>
      {err && <div className="mb-4"><Notice tone="red" title="확인해 주세요">{err}</Notice></div>}

      {d.step === 0 && <Step0 d={d} patch={patch} rq={rq} token={token} busy={busy} run={run} post={post} onNext={() => go(1)} sms={meta.sms_enabled} />}
      {d.step === 1 && <Step1 s={s} paid={paid} terms={meta.terms} onBack={() => go(0)} onNext={() => go(2)} />}
      {d.step === 2 && <Step2 d={d} patch={patch} meta={meta} token={token} busy={busy} run={run} post={post} onBack={() => go(1)} onNext={() => go(3)} />}
      {d.step === 3 && <Step3 d={d} patch={patch} meta={meta} rq={rq} busy={busy} run={run} post={post} onBack={() => go(2)} onNext={() => go(paid ? 4 : 5)} />}
      {d.step === 4 && <Step4 d={d} patch={patch} s={s} bank={meta.bank} onBack={() => go(3)} onNext={() => go(5)} />}
      {d.step === 5 && <Step5 d={d} patch={patch} s={s} rq={rq} onBack={() => go(paid ? 4 : 3)} onNext={() => run(async () => {
        const j = await post(`/api/onboard/${token}/complete`, { owner_name: d.owner_name, biz_no: d.biz_no, phone: d.phone, email: d.email, kit_address: d.kit_address, kit_ok: d.kit_ok, signature: d.signature }) as { guide_url?: string | null };
        patch({ step: 6 }); setMeta((m) => m ? { ...m, done: true } : m); (window as unknown as { __guide?: string | null }).__guide = j.guide_url ?? null; window.scrollTo({ top: 0 });
      })} busy={busy} />}
      {d.step === 6 && <Step6 d={d} s={s} guide={(window as unknown as { __guide?: string | null }).__guide ?? null} />}
    </Shell>
  );
}

/* ════════════ 단계별 화면 ════════════ */

function Step0({ d, patch, rq, token, busy, run, post, onNext, sms }: StepProps & { rq: string; token: string; sms: boolean }) {
  const [info, setInfo] = useState<{ name?: string; address?: string; phone_number?: string } | null>(null);
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  useEffect(() => { fetch(`/api/dashboard/restaurant${rq}`).then((r) => (r.ok ? r.json() : null)).then((j) => { setInfo(j); if (j?.address && !d.kit_address) patch({ kit_address: j.address }); }).catch(() => null); }, [rq]); // eslint-disable-line react-hooks/exhaustive-deps
  const canNext = d.owner_name.trim().length >= 2 && /^\d{10}$/.test(d.biz_no.replace(/\D/g, "")) && /^01\d{8,9}$/.test(d.phone.replace(/\D/g, "")) && d.pin_set;
  return (
    <section>
      <H title="내 매장이 맞나요?" time="30초" />
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-4 text-[13.5px]">
        <Row k="매장명" v={info?.name ?? "…"} /><Row k="주소" v={info?.address || "—"} /><Row k="매장 전화" v={info?.phone_number || "—"} />
        <p className="text-[11.5px] text-gray-400 mt-2">주소·전화가 다르면 등록 후 대시보드에서 바로 고칠 수 있습니다.</p>
      </div>
      <div className="grid gap-3">
        <Field label="대표자 성함" required><Input name="owner_name" autoComplete="off" value={d.owner_name} onChange={(e) => patch({ owner_name: e.target.value })} placeholder="홍길동" /></Field>
        <Field label="사업자등록번호" required hint="숫자 10자리"><Input name="biz_no" autoComplete="off" inputMode="numeric" value={d.biz_no} onChange={(e) => patch({ biz_no: e.target.value })} placeholder="000-00-00000" /></Field>
        <Field label="휴대폰 번호" required hint={sms ? "인증번호를 보내드립니다" : "계약서 사본과 연락에 씁니다"}><Input name="owner_phone" type="tel" autoComplete="off" inputMode="tel" value={d.phone} onChange={(e) => patch({ phone: e.target.value.replace(/[^\d-]/g, "") })} placeholder="010-0000-0000" /></Field>
      </div>
      <div className="mt-5 rounded-2xl border border-navy/20 bg-navy/[0.03] p-4">
        <p className="text-[13.5px] font-semibold text-gray-900 mb-1">점주 대시보드 PIN 4자리 정하기 <span className="text-red-600">*</span></p>
        <p className="text-[12px] text-gray-600 mb-3">앞으로 카카오 로그인 뒤 이 번호로 매장을 확인합니다. <b>사장님만 아는 번호</b>로 정해 주세요.</p>
        {d.pin_set ? <p className="text-[13px] text-green-700 font-semibold">✓ PIN 을 설정했습니다.</p> : (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="PIN"><Input type="password" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" className="w-24" /></Field>
            <Field label="확인"><Input type="password" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="••••" className="w-24" /></Field>
            <Button variant="primary" disabled={busy || pin.length !== 4 || pin !== pin2} onClick={() => run(async () => { await post(`/api/onboard/${token}/pin`, { new_pin: pin }); patch({ pin_set: true }); })}>설정</Button>
          </div>
        )}
      </div>
      <Nav onNext={onNext} nextDisabled={!canNext} />
    </section>
  );
}

function Step1({ s, paid, terms, onBack, onNext }: { s: Meta["store"]; paid: boolean; terms: Meta["terms"]; onBack: () => void; onNext: () => void }) {
  return (
    <section>
      <H title="플랜 확인" time="20초" />
      <div className="rounded-2xl border-2 border-navy bg-white p-5 mb-3">
        <div className="flex items-baseline justify-between"><span className="text-[18px] font-bold text-gray-900">{s.plan_label}</span><span className="text-[18px] font-bold text-navy">{paid ? `월 ${fmtWon(s.fee)}` : "0원"}</span></div>
        {paid && <p className="text-[12.5px] text-gray-500 mt-1">부가세 {fmtWon(s.vat)} 별도 · 실제 청구 월 {fmtWon(s.fee + s.vat)}</p>}
        <ul className="mt-3 text-[13px] text-gray-700 space-y-1">
          <li>· 앱에 매장·혜택 상시 게재, 기본 쿠폰·스탬프·마일리지 추첨 운영</li>
          <li>· 당첨 식사권 대금 매월 정산 · 포스터 1종 + QR 스티커 2매</li>
          {paid && <li>· 캠페인(한정 쿠폰) 편입 · 앱 배너·푸시 · 매거진 게재</li>}
        </ul>
      </div>
      <div className="rounded-xl bg-navy/[0.04] border border-navy/10 p-3 text-[12.5px] text-gray-700">
        <p className="mb-1"><b>정해진 종료일이 없습니다.</b> 오늘 동의하시면 오늘부터 시작해서, 그만두겠다고 말씀하실 때까지 매월 이어집니다.</p>
        <p className="mb-1">최소 이용기간은 <b>1개월 — 오늘부터 {kdate(terms.schedule.min_term_to)}까지</b>입니다.</p>
        <p style={{marginBottom:0}}>그 뒤에는 <b>매월 말일까지 말씀만 하시면 다음 달 1일자로 끝나고, 위약금은 없습니다.</b></p>
      </div>
      <p className="text-[12px] text-gray-400 mt-2">플랜을 바꾸고 싶으시면 담당자에게 말씀해 주세요. 미팅에서 정한 값이 들어가 있습니다.</p>
      <Nav onBack={onBack} onNext={onNext} />
    </section>
  );
}

function Step2({ d, patch, meta, token, busy, run, post, onBack, onNext }: StepProps & { meta: Meta; token: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [readAll, setReadAll] = useState(false);
  const onScroll = () => { const el = box.current; if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadAll(true); };
  const allChecked = meta.terms.checks.every((c) => d.checks[c.id]);
  const done = Boolean(d.consent_at) || meta.progress.consent;
  return (
    <section>
      <H title="계약" time="2분" />
      <p className="text-[13px] text-gray-600 mb-2">아래 약관을 끝까지 읽으신 뒤, 중요 내용 5가지에 각각 체크하고 성함을 적어 주세요. <b>종이 계약서는 따로 없습니다.</b></p>
      <div ref={box} onScroll={onScroll} className="h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-[12.5px] text-gray-700 leading-relaxed">
        {meta.terms.articles.map((a) => (<div key={a.no} className="mb-3"><p className="font-bold text-gray-900">{a.no} ({a.title})</p><ol className="list-decimal pl-5 space-y-1">{a.body.map((b, i) => <li key={i}>{b}</li>)}</ol></div>))}
        <p className="text-[11px] text-gray-400 mt-2">약관 버전 {meta.terms.version} · {meta.terms.hash.slice(0, 16)}</p>
      </div>
      {!readAll && !done && <p className="text-[11.5px] text-amber-700 mt-1">끝까지 스크롤하면 아래 항목이 열립니다.</p>}
      <div className={`mt-4 space-y-2 ${readAll || done ? "" : "opacity-40 pointer-events-none"}`}>
        <p className="text-[13px] font-semibold text-gray-900">중요 내용 확인</p>
        {meta.terms.checks.map((c) => (
          <label key={c.id} className="flex gap-3 items-start rounded-xl border border-gray-200 bg-white p-3 cursor-pointer">
            <input type="checkbox" className="mt-1 w-4 h-4 accent-[#050072]" checked={Boolean(d.checks[c.id])} disabled={done} onChange={(e) => { const n = { ...d.checks }; if (e.target.checked) n[c.id] = new Date().toISOString(); else delete n[c.id]; patch({ checks: n }); }} />
            <span className="text-[13px] text-gray-800">{c.text} <span className="text-gray-400 text-[11px]">({c.article})</span></span>
          </label>
        ))}
        <Field label="서명 — 대표자 성함을 그대로 입력" required hint="입력한 성함·시각·접속 정보가 서명 기록으로 남습니다"><Input value={d.signature} disabled={done} onChange={(e) => patch({ signature: e.target.value })} placeholder={d.owner_name || "홍길동"} /></Field>
        <Field label="계약서·세금계산서 받을 이메일" hint="비워두셔도 됩니다. 있으면 사본을 바로 보내드립니다"><Input type="email" name="owner_email" autoComplete="off" value={d.email} onChange={(e) => patch({ email: e.target.value })} placeholder="owner@example.com" /></Field>
        {done ? <Notice tone="blue" title="계약이 체결되었습니다">{d.consent_at ? `동의 시각 ${new Date(d.consent_at).toLocaleString("ko-KR")}` : "동의 기록이 저장되어 있습니다."}{d.contract_url && <> · <a className="underline" href={d.contract_url} target="_blank" rel="noreferrer">계약서 사본 열기</a></>}</Notice>
          : <Button variant="primary" size="md" className="w-full" disabled={busy || !allChecked || d.signature.trim().length < 2} onClick={() => run(async () => {
              const j = await post(`/api/onboard/${token}/consent`, { checks: d.checks, signature: d.signature, owner_name: d.owner_name, biz_no: d.biz_no, phone: d.phone, email: d.email, terms_hash: meta.terms.hash }) as { at: string; starts_on: string; contract_url: string | null };
              patch({ consent_at: j.at, starts_on: j.starts_on, contract_url: j.contract_url });
            })}>위 내용에 동의하며 계약을 체결합니다</Button>}
      </div>
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!done} />
    </section>
  );
}

function Step3({ d, patch, meta, rq, busy, run, post, onBack, onNext }: StepProps & { meta: Meta; rq: string }) {
  const [stampSaved, setStampSaved] = useState(false);
  const [savedCoupons, setSavedCoupons] = useState(0);
  const [specialSaved, setSpecialSaved] = useState(false);
  const paid = meta.store.plan !== "FREE";

  useEffect(() => {
    fetch(`/api/dashboard/stamp-rule${rq}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const rule = j?.rule ?? j; if (rule?.active && rule?.config_json?.thresholds?.length) setStampSaved(true);
    }).catch(() => null);
  }, [rq]);

  const steps = Object.keys(d.stamp_steps).map(Number).sort((a, b) => a - b);
  const filled = steps.filter((n) => (d.stamp_steps[String(n)] ?? "").trim());
  const toggle = (n: number) => {
    const next = { ...d.stamp_steps }; const k = String(n);
    if (k in next) delete next[k]; else next[k] = "";
    patch({ stamp_steps: next });
  };

  // 고른 칸은 전부 채워야 한다 — 빈 칸이 있으면 그 칸은 보상 없이 저장돼 손님이 헛걸음한다
  const blanks = steps.filter((n) => !(d.stamp_steps[String(n)] ?? "").trim());
  const saveStamp = () => run(async () => {
    if (!steps.length) throw new Error("스탬프 칸을 골라 주세요.");
    if (blanks.length) throw new Error(`${blanks.join("개, ")}개 칸에 무엇을 드릴지 적어 주세요.`);
    await post(`/api/dashboard/stamp-rule${rq}`, {
      rule_type: "THRESHOLD",
      config_json: {
        thresholds: steps.map((n) => ({ stamps: n, reward_text: d.stamp_steps[String(n)].trim() })),
        notes: d.stamp_note.trim(),
      },
      active: true,
    }, "PATCH");
    // 스탬프 보상도 혜택 카탈로그에 남긴다 — 앱·계약서가 같은 값을 본다
    for (const [i, n] of steps.entries()) {
      await post(`/api/dashboard/restaurant-benefits${rq}`, {
        kind: "STAMP", stamp_key: String(n), sort_order: i,
        title: d.stamp_steps[String(n)].trim(), subtitle: `${n}개 모으면`, notes: d.stamp_note.trim(), active: true,
      }).catch(() => null);
    }
    setStampSaved(true);
  });

  const couponBlank = d.coupons.some((c) => !c.benefit.trim());
  const saveCoupons = () => run(async () => {
    const list = d.coupons.filter((c) => c.benefit.trim());
    if (!list.length) throw new Error("쿠폰 혜택을 적어 주세요.");
    if (couponBlank) throw new Error("비어 있는 쿠폰 칸이 있습니다. 채우거나 삭제해 주세요.");
    for (const [i, c] of list.entries()) {
      await post(`/api/dashboard/restaurant-benefits${rq}`, {
        kind: "GENERAL", sort_order: i, title: c.benefit.trim(), subtitle: c.cond.trim(), notes: c.cond.trim(), active: true,
      });
    }
    setSavedCoupons(list.length);
  });

  const saveSpecial = () => run(async () => {
    const sp = d.special;
    if (!sp?.benefit.trim()) throw new Error("한정 쿠폰 혜택을 적어 주세요.");
    await post(`/api/dashboard/restaurant-benefits${rq}`, {
      kind: "SPECIAL", sort_order: 0, title: sp.benefit.trim(), subtitle: sp.cond.trim(), notes: sp.cond.trim(), active: true,
    });
    setSpecialSaved(true);
  });

  return (
    <section>
      <H title="혜택 등록" time="2분" />

      {/* ① 스탬프 */}
      <div className="rounded-2xl border-2 border-navy bg-white p-4 mb-3">
        <p className="text-[14px] font-bold text-gray-900">① 스탬프 <span className="text-red-600 text-[12px] font-semibold ml-1">필수</span></p>
        <p className="text-[12.5px] text-gray-600 mb-3">손님이 방문할 때마다 스탬프를 찍습니다. <b>보상을 줄 칸을 고르고</b>, 그 칸에 무엇을 드릴지 적어 주세요. 여러 칸을 고르셔도 됩니다.</p>
        <div className="grid grid-cols-5 gap-1.5 mb-3 max-w-[260px]">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const on = String(n) in d.stamp_steps;
            return (
              <button key={n} type="button" disabled={stampSaved} onClick={() => toggle(n)} aria-pressed={on}
                className={`h-11 rounded-xl border text-[13.5px] font-bold transition-colors ${on ? "border-navy bg-navy text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                {n}
              </button>
            );
          })}
        </div>
        {steps.length === 0 && <p className="text-[12px] text-amber-700 mb-2">몇 개를 모으면 보상을 드릴지 위에서 골라 주세요. (예: 5개, 10개)</p>}
        <div className="space-y-2">
          {steps.map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <span className="w-[74px] shrink-0 text-[12.5px] font-semibold text-navy">{n}개 모으면</span>
              <Input autoComplete="off" disabled={stampSaved} value={d.stamp_steps[String(n)] ?? ""} placeholder={meta.examples.stamp[i % meta.examples.stamp.length]}
                onChange={(e) => patch({ stamp_steps: { ...d.stamp_steps, [String(n)]: e.target.value } })} />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Field label="사용 조건 · 요청 사항" hint="예: 음료 1잔당 1회 · 포장 제외 · 다른 쿠폰과 중복 불가. 없으면 비워두세요">
            <Textarea rows={2} disabled={stampSaved} value={d.stamp_note} onChange={(e) => patch({ stamp_note: e.target.value })} placeholder="1인 1회 · 배달 제외" />
          </Field>
        </div>
        {stampSaved ? <p className="text-[13px] text-green-700 font-semibold mt-2">✓ 스탬프를 등록했습니다.</p>
          : (
            <>
              {blanks.length > 0 && <p className="text-[12px] text-amber-700 mt-2">{blanks.join("개, ")}개 칸이 비어 있습니다. 채워야 등록할 수 있습니다.</p>}
              <Button variant="primary" className="mt-2" disabled={busy || !steps.length || blanks.length > 0} onClick={saveStamp}>스탬프 등록</Button>
            </>
          )}
      </div>

      {/* ② 일반 쿠폰 — 여러 개 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-3">
        <p className="text-[14px] font-bold text-gray-900">② 쿠폰 <span className="text-gray-400 text-[12px] font-semibold ml-1">선택</span></p>
        <p className="text-[12.5px] text-gray-600 mb-3">앱에서 상시로 받을 수 있는 혜택입니다. 여러 개 등록하셔도 됩니다.</p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-3">
          <p className="text-[11.5px] font-semibold text-gray-600 mb-1.5">다른 매장은 이렇게 적었습니다</p>
          <ul className="space-y-0.5">
            {meta.examples.coupon.map((e, i) => (
              <li key={i} className="text-[12px] text-gray-600"><b className="text-gray-800">{e.benefit}</b> <span className="text-gray-400">·</span> {e.cond}</li>
            ))}
          </ul>
        </div>
        {savedCoupons > 0 ? <p className="text-[13px] text-green-700 font-semibold">✓ 쿠폰 {savedCoupons}개를 등록했습니다.</p> : (
          <>
            <div className="space-y-3">
              {d.coupons.map((c, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-gray-600">쿠폰 {i + 1}</span>
                    <button type="button" className="text-[11.5px] text-gray-400 hover:text-red-600" onClick={() => patch({ coupons: d.coupons.filter((_, j) => j !== i) })}>삭제</button>
                  </div>
                  <div className="space-y-2">
                    <Field label="무엇을 드릴지"><Input autoComplete="off" value={c.benefit} placeholder="음료 1캔"
                      onChange={(e) => patch({ coupons: d.coupons.map((x, j) => j === i ? { ...x, benefit: e.target.value } : x) })} /></Field>
                    <Field label="어떤 조건에" hint="비워두면 조건 없이 누구나 쓸 수 있습니다"><Textarea rows={2} value={c.cond} placeholder="10,000원 이상 주문 시 · 테이블당 1개"
                      onChange={(e) => patch({ coupons: d.coupons.map((x, j) => j === i ? { ...x, cond: e.target.value } : x) })} /></Field>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => patch({ coupons: [...d.coupons, { benefit: "", cond: "" }] })}>+ 쿠폰 추가</Button>
              {d.coupons.length > 0 && <Button variant="primary" disabled={busy || couponBlank} onClick={saveCoupons}>쿠폰 등록</Button>}
            </div>
          </>
        )}
      </div>

      {/* ③ 한정 쿠폰 — Boost 이상 */}
      <div className={`rounded-2xl border p-4 mb-3 ${paid ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"}`}>
        <p className="text-[14px] font-bold text-gray-900 flex items-center gap-1.5">
          ③ 한정 쿠폰
          {paid ? <span className="text-[11px] font-bold text-navy bg-navy/[0.08] rounded-full px-2 py-0.5">Boost</span>
                : <span className="text-[11px] font-bold text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">🔒 Boost 플랜부터</span>}
        </p>
        <p className="text-[12.5px] text-gray-600 mt-1 mb-3">
          <b>학생회 채널을 통해 매달 홍보되는</b> 쿠폰입니다. 저희 인스타그램과 단과대·학생회 채널에 함께 나갑니다.
          기간이 정해진 한정 혜택이라 평소 쿠폰보다 반응이 큽니다.
        </p>
        {!paid ? (
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-[12.5px] text-gray-500">
            무료 플랜에서는 등록하실 수 없습니다. <b className="text-gray-700">Boost 플랜</b>으로 바꾸시면 매달 학생회 채널 홍보에 함께 나갑니다 — 담당자에게 말씀해 주세요.
          </div>
        ) : specialSaved ? <p className="text-[13px] text-green-700 font-semibold">✓ 한정 쿠폰을 등록했습니다.</p> : (
          <div className="space-y-2">
            <Field label="무엇을 드릴지"><Input autoComplete="off" value={d.special?.benefit ?? ""} placeholder="사이드 1종"
              onChange={(e) => patch({ special: { benefit: e.target.value, cond: d.special?.cond ?? "" } })} /></Field>
            <Field label="어떤 조건에" hint="비워두면 조건 없이 누구나 쓸 수 있습니다"><Textarea rows={2} value={d.special?.cond ?? ""} placeholder="테이블당 1개 · 12인 이상 방문 시"
              onChange={(e) => patch({ special: { benefit: d.special?.benefit ?? "", cond: e.target.value } })} /></Field>
            <Button variant="primary" disabled={busy || !d.special?.benefit.trim()} onClick={saveSpecial}>한정 쿠폰 등록</Button>
          </div>
        )}
      </div>

      {/* 등록한 혜택 한눈에 — 앱에 이렇게 나갑니다 */}
      {(stampSaved || savedCoupons > 0 || specialSaved) && (
        <div className="rounded-2xl border border-navy/20 bg-navy/[0.03] p-4 mb-3">
          <p className="text-[13.5px] font-bold text-navy mb-2">앱에 이렇게 나갑니다</p>
          <div className="space-y-2.5">
            {stampSaved && (
              <div>
                <p className="text-[11.5px] font-semibold text-gray-500 mb-1">스탬프</p>
                <ul className="space-y-0.5">
                  {steps.map((n) => (
                    <li key={n} className="text-[13px] text-gray-800"><b className="text-navy">{n}개</b> 모으면 · {d.stamp_steps[String(n)]}</li>
                  ))}
                </ul>
                {d.stamp_note.trim() && <p className="text-[11.5px] text-gray-500 mt-0.5">조건 · {d.stamp_note.trim()}</p>}
              </div>
            )}
            {savedCoupons > 0 && (
              <div>
                <p className="text-[11.5px] font-semibold text-gray-500 mb-1">쿠폰</p>
                <ul className="space-y-0.5">
                  {d.coupons.filter((c) => c.benefit.trim()).map((c, i) => (
                    <li key={i} className="text-[13px] text-gray-800"><b>{c.benefit.trim()}</b>{c.cond.trim() && <span className="text-gray-500"> · {c.cond.trim()}</span>}</li>
                  ))}
                </ul>
              </div>
            )}
            {specialSaved && d.special && (
              <div>
                <p className="text-[11.5px] font-semibold text-gray-500 mb-1">한정 쿠폰 <span className="text-navy">· 학생회 채널</span></p>
                <p className="text-[13px] text-gray-800"><b>{d.special.benefit.trim()}</b>{d.special.cond.trim() && <span className="text-gray-500"> · {d.special.cond.trim()}</span>}</p>
              </div>
            )}
          </div>
          <p className="text-[11.5px] text-gray-500 mt-2.5">고치고 싶으시면 등록 후에도 점주 대시보드에서 바꾸실 수 있습니다.</p>
        </div>
      )}

      {/* ④ 사진 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[14px] font-bold text-gray-900 mb-1">④ 대표 사진</p>
        <p className="text-[12.5px] text-gray-600 mb-3">앱에 가장 먼저 보이는 사진입니다. 메뉴 사진 한 장이면 충분합니다.</p>
        <ImageUploader initialUrls={d.photo_urls} uploadType="restaurant" maxImages={3} onSave={async (urls: string[]) => { patch({ photo_urls: urls }); await fetch(`/api/dashboard/restaurant${rq}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ s3_image_urls: urls }) }).catch(() => null); }} />
      </div>

      <Nav onBack={onBack} onNext={onNext} nextDisabled={!stampSaved} nextHint={stampSaved ? undefined : "스탬프를 등록해야 다음으로 갈 수 있습니다"} />
    </section>
  );
}

function Step4({ d, patch, s, bank, onBack, onNext }: { d: Draft; patch: (p: Partial<Draft>) => void; s: Meta["store"]; bank: Meta["bank"]; onBack: () => void; onNext: () => void }) {
  const total = s.fee + s.vat;
  return (
    <section>
      <H title="입금 안내" time="1분" />
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-3 text-[13.5px]">
        <Row k="첫 달 이용료" v={`${fmtWon(total)} (부가세 포함)`} />
        {bank ? <><Row k="입금 계좌" v={`${bank.name} ${bank.account}`} /><Row k="예금주" v={bank.holder} /></> : <Row k="입금 계좌" v="담당자가 세금계산서와 함께 안내드립니다" />}
        <Row k="입금자명" v={`${s.name} 또는 대표자 성함`} />
        <p className="text-[12px] text-gray-500 mt-2">세금계산서는 입금 확인 후 발행됩니다. 입금 확인은 저희가 자동으로 하니 따로 알려주지 않으셔도 됩니다.</p>
      </div>
      {!d.email && <Notice tone="amber" title="세금계산서 받을 이메일이 비어 있습니다">계약 단계로 돌아가 이메일을 적어 주시면 계산서와 계약서 사본을 바로 받으실 수 있습니다.</Notice>}
      <label className="flex gap-3 items-start mt-3 cursor-pointer"><input type="checkbox" className="mt-1 w-4 h-4 accent-[#050072]" checked={d.paid_clicked} onChange={(e) => patch({ paid_clicked: e.target.checked })} /><span className="text-[13px] text-gray-800">입금 안내를 확인했습니다 (지금 바로 입금하지 않으셔도 됩니다)</span></label>
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!d.paid_clicked} />
    </section>
  );
}

function Step5({ d, patch, s, onBack, onNext, busy }: { d: Draft; patch: (p: Partial<Draft>) => void; s: Meta["store"]; rq: string; onBack: () => void; onNext: () => void; busy: boolean }) {
  return (
    <section>
      <H title="웰컴 키트" time="30초" />
      <p className="text-[13px] text-gray-600 mb-3">포스터 1장, QR 스티커 2장, 테이블 카드, 사용 안내를 택배로 보내드립니다. <b>최초 등록 때 한 번</b> 보내드리는 것이라 배송지만 확인해 주세요.</p>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-3">
        <p className="text-[12px] text-gray-500 mb-2">포스터 미리보기</p>
        <div className="rounded-xl bg-[#050072] text-white p-5 text-center"><p className="text-[11px] tracking-[0.2em] opacity-70">WOULDULIKE</p><p className="text-[20px] font-bold mt-1">{s.name}</p><p className="text-[12px] opacity-80 mt-1">우주라이크 앱에서 스탬프 적립 · 쿠폰 사용</p></div>
        <p className="text-[11.5px] text-gray-400 mt-2">실제 디자인은 다를 수 있습니다. 매장명은 위와 같이 인쇄됩니다.</p>
      </div>
      <Field label="배송지" required hint="사업장 주소가 기본입니다. 받으실 곳이 다르면 고쳐 주세요"><Input value={d.kit_address} onChange={(e) => patch({ kit_address: e.target.value })} placeholder="대구광역시 북구 …" /></Field>
      <label className="flex gap-3 items-start mt-3 cursor-pointer"><input type="checkbox" className="mt-1 w-4 h-4 accent-[#050072]" checked={d.kit_ok} onChange={(e) => patch({ kit_ok: e.target.checked })} /><span className="text-[13px] text-gray-800">위 주소로 보내주세요. 도착하면 붙인 자리 사진 한 장 보내드릴게요.</span></label>
      <Nav onBack={onBack} onNext={onNext} nextLabel="등록 마치기" nextDisabled={busy || !d.kit_ok || d.kit_address.trim().length < 5} />
    </section>
  );
}

function Step6({ d, s, guide }: { d: Draft; s: Meta["store"]; guide: string | null }) {
  return (
    <section className="text-center pt-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mb-3">✓</div>
      <h2 className="text-[20px] font-bold text-gray-900">등록이 끝났습니다</h2>
      <p className="text-[13.5px] text-gray-600 mt-1 mb-5">{s.name} 사장님, 함께하게 되어 반갑습니다.<br />{d.starts_on && <>오늘({kdate(d.starts_on)})부터 시작합니다. </>}웰컴 키트는 곧 발송되고, 계약서 사본은 {d.email ? "이메일과 " : ""}카카오톡으로 보내드립니다.</p>
      <div className="grid gap-2 max-w-xs mx-auto">
        {d.contract_url && <a className="block rounded-xl border border-gray-200 bg-white py-3 text-[13.5px] font-semibold text-gray-900" href={d.contract_url} target="_blank" rel="noreferrer">계약서 사본 열기</a>}
        {guide && <a className="block rounded-xl border border-gray-200 bg-white py-3 text-[13.5px] font-semibold text-gray-900" href={guide} target="_blank" rel="noreferrer">점주 안내문 받기</a>}
        <a className="block rounded-xl bg-navy text-white py-3 text-[13.5px] font-semibold" href="/dashboard/owner">점주 대시보드 열기</a>
      </div>
      <p className="text-[11.5px] text-gray-400 mt-5">다음 로그인부터는 카카오 로그인 후 방금 정하신 PIN 4자리로 들어오시면 됩니다.</p>
    </section>
  );
}

/* ════════════ 조각 ════════════ */
type StepProps = { d: Draft; patch: (p: Partial<Draft>) => void; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; post: (path: string, body?: unknown, method?: string) => Promise<Record<string, unknown>>; onBack?: () => void; onNext: () => void };

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen bg-background">
      <div className={`mx-auto px-5 py-8 ${wide ? "max-w-lg" : "max-w-md"}`}>
        <div className="text-[11px] font-bold tracking-[0.18em] text-navy mb-6">WOULDULIKE</div>
        {children}
      </div>
    </main>
  );
}
function H({ title, time }: { title: string; time: string }) {
  return <div className="flex items-baseline gap-2 mb-3"><h2 className="text-[19px] font-bold text-gray-900">{title}</h2><span className="text-[11px] font-semibold text-navy bg-navy/[0.07] rounded-full px-2 py-0.5">약 {time}</span></div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-3 py-1 border-b border-gray-100 last:border-0"><span className="w-24 shrink-0 text-gray-500">{k}</span><span className="text-gray-900 break-keep">{v}</span></div>;
}
function Nav({ onBack, onNext, nextDisabled, nextLabel = "다음", nextHint }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string; nextHint?: string }) {
  return (
    <div className="mt-6">
      <div className="flex gap-2">
        {onBack && <Button variant="secondary" size="md" onClick={onBack}>이전</Button>}
        <Button variant="primary" size="md" className="flex-1" disabled={nextDisabled} onClick={onNext}>{nextLabel}</Button>
      </div>
      {nextHint && <p className="text-[11.5px] text-amber-700 mt-2">{nextHint}</p>}
    </div>
  );
}
