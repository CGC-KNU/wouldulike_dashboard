"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ImageUploader from "@/components/ImageUploader";
import { BrandLockup, BrandStack } from "./Brand";
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
  sms_enabled: boolean;
  /** 백엔드 상태로 본 "이미 등록을 마친 매장" — done(쿠키)과 달리 기기가 바뀌어도 남는다 */
  already?: boolean; done: boolean; expires_at: string;
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
  paid_clicked: boolean; kit_ok: boolean; starts_on: string | null;
  /** 배송지 — 우편번호 찾기로 받은 기본주소와 직접 적는 상세주소를 나눠 둔다. kit_address 는 그 둘을 합친 최종값(서버로 나가는 값). */
  kit_zip: string; kit_addr1: string; kit_detail: string; kit_address: string;
}
// 무료 플랜은 입금할 게 없어 [4]입금을 건너뛴다 (go(paid ? 4 : 5)).
// 스텝바에까지 "입금"이 남아 있으면 건너뛴 게 아니라 뭘 놓친 것처럼 보인다 — 칸 자체를 뺀다.
const STEPS = ["내 매장", "플랜", "계약", "혜택", "입금", "키트", "완료"];
const STEPS_FREE = STEPS.filter((x) => x !== "입금");
const fmtWon = (n: number) => n.toLocaleString("ko-KR") + "원";
const kdate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${y}. ${Number(m)}. ${Number(d)}.`; };
const emptyDraft = (): Draft => ({ step: 0, owner_name: "", biz_no: "", phone: "", email: "", pin_set: false, checks: {}, signature: "", consent_at: null, contract_url: null, stamp_steps: {}, stamp_note: "", coupons: [], special: null, photo_urls: [], paid_clicked: false, kit_ok: false, starts_on: null, kit_zip: "", kit_addr1: "", kit_detail: "", kit_address: "" });

export default function OnboardClient({ token }: { token: string }) {
  const sp = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  /**
   * 등록을 마친 뒤 내용을 고치러 되돌아간 상태.
   *
   * 끝내고 나서야 "아, 스탬프 5개가 아니라 10개인데" 를 알아차린다 — 그때 되돌아갈 길이 없으면
   * 담당자에게 전화한다. 혜택 저장은 그 단계 안에서 이미 백엔드로 나가므로(선언형, 지우고 다시 넣기)
   * 고치고 돌아오기만 하면 된다. 배송지는 완료 기록에만 남는 값이라 다시 기록해야 한다.
   */
  const [editing, setEditing] = useState<null | "benefit" | "kit">(null);
  const [err, setErr] = useState<string | null>(null);
  const key = useMemo(() => `ob_${token.slice(-16)}`, [token]);

  // 이어하기 — 브라우저에만 남는 초안. 민감값은 서버가 다시 받으므로 여기 남아도 계약 증거가 아니다.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved = { ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) };
      // 배송지를 한 칸에서 세 칸으로 쪼개기 전에 저장된 초안 — 옛 한 줄을 기본주소 칸으로 옮긴다 (0921)
      if (!saved.kit_addr1 && saved.kit_address) saved.kit_addr1 = saved.kit_address;
      setD(saved);
    } catch { /* 무시 */ }
  }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(d)); } catch { /* 무시 */ } }, [key, d]);
  const patch = useCallback((p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p })), []);

  // 화면 확인용(개발 전용) — `?preview=1&step=4` 로 뒷단계를 바로 연다. 서버도 같은 플래그를 본다.
  const previewUi = sp.get("preview") === "1";
  const load = useCallback(async () => {
    const r = await fetch(`/api/onboard/${token}${sp.get("preview") === "1" ? "?preview=1" : ""}`, { cache: "no-store" });
    if (!r.ok) { setFatal(r.status === 410 ? "이 링크는 기한이 지났습니다." : "유효하지 않은 링크입니다."); return null; }
    const m = (await r.json()) as Meta; setMeta(m); return m;
  }, [token, sp]);

  // 첫 진입 / 카카오에서 돌아옴(?resume=1) → 세션 교환
  useEffect(() => {
    (async () => {
      const m = await load(); if (!m) return;
      if (previewUi) { const n = Number(sp.get("step")); if (n >= 0 && n <= 6) { patch({ step: n }); return; } }
      if (m.done || m.already) { patch({ step: 6 }); return; }
      if (!m.session.ok && sp.get("resume") === "1") {
        const s = await fetch(`/api/onboard/${token}/session`, { method: "POST" });
        const j = (await s.json().catch(() => ({}))) as { success?: boolean; message?: string; need_kakao?: boolean };
        if (j.success) { await load(); history.replaceState(null, "", location.pathname); }
        else if (!j.need_kakao) setErr(j.message ?? "로그인에 실패했습니다.");
      }
    })();
  }, [load, patch, sp, token, previewUi]);

  /**
   * 며칠 뒤 카톡을 스크롤해 링크를 다시 연 경우 — 요약을 보여 주려면 등록된 혜택을 읽어야 한다.
   * 초안은 그 기기의 sessionStorage 에만 있으므로 다른 기기에서는 비어 있다.
   */
  useEffect(() => {
    if (!meta?.already || Object.keys(d.stamp_steps).length || d.coupons.length) return;
    const q = `?rid=${meta.store.rid}`;
    fetch(`/api/dashboard/stamp-rule${q}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const th = (j?.rule ?? j)?.config_json?.thresholds as { stamps?: number; reward_text?: string }[] | undefined;
      if (!Array.isArray(th)) return;
      const back: Record<string, string> = {};
      for (const t of th) if (Number(t?.stamps) > 0) back[String(t.stamps)] = String(t.reward_text ?? "");
      patch({ stamp_steps: back, stamp_note: String((j?.rule ?? j)?.config_json?.notes ?? "") });
    }).catch(() => null);
    fetch(`/api/dashboard/restaurant-benefits${q}&kind=GENERAL`).then((r) => (r.ok ? r.json() : null)).then((l: { title?: string; subtitle?: string }[] | null) => {
      if (Array.isArray(l) && l.length) patch({ coupons: l.map((x) => ({ benefit: String(x.title ?? ""), cond: String(x.subtitle ?? "") })) });
    }).catch(() => null);
    fetch(`/api/dashboard/restaurant-benefits${q}&kind=SPECIAL`).then((r) => (r.ok ? r.json() : null)).then((l: { title?: string; subtitle?: string }[] | null) => {
      if (Array.isArray(l) && l.length) patch({ special: { benefit: String(l[0].title ?? ""), cond: String(l[0].subtitle ?? "") } });
    }).catch(() => null);
  }, [meta?.already, meta?.store.rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const startKakao = () => {
    const id = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    if (!id) { setErr("카카오 로그인 설정이 없습니다. 담당자에게 알려 주세요."); return; }
    // 환경변수가 없으면 지금 열린 주소로 되돌아온다 — 콜백 라우트도 같은 폴백을 쓰므로 두 값이 어긋나지 않는다.
    // (카카오는 authorize 의 redirect_uri 와 token 교환의 redirect_uri 가 다르면 거절한다.)
    // 없다고 링크가 죽으면 안 된다: 점주는 이 화면에서 더 갈 데가 없다.
    const uri = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI || `${location.origin}/auth/kakao/callback`;
    const q = new URLSearchParams({ client_id: id, redirect_uri: uri, response_type: "code", scope: "profile_nickname", state: `onboard:${token}` });
    location.href = `https://kauth.kakao.com/oauth/authorize?${q}`;
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
  // 오류 배너는 화면 맨 위에 있다. 아래쪽 버튼을 누르고 실패하면 점주 눈에는 "안 눌린다"로 보인다 —
  // 그래서 실패하면 위로 데려간다 (0921 실측: 쿠폰 등록 400 이 났는데 점주가 알아채지 못했다).
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); }
    catch (e) { setErr((e as Error).message); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { setBusy(false); }
  };

  return (
    <Shell wide>
      <div className="mb-5">
        <p className="text-[11.5px] text-gray-500 mb-2">{s.name} · {s.campus} · {s.plan_label}</p>
        <Stepper steps={paid ? STEPS : STEPS_FREE} current={paid ? d.step : Math.max(0, d.step > 4 ? d.step - 1 : d.step)} />
      </div>
      {err && <div className="mb-4"><Notice tone="red" title="확인해 주세요">{err}</Notice></div>}

      {d.step === 0 && <Step0 d={d} patch={patch} rq={rq} token={token} busy={busy} run={run} post={post} onNext={() => go(1)} sms={meta.sms_enabled} />}
      {d.step === 1 && <Step1 s={s} paid={paid} terms={meta.terms} onBack={() => go(0)} onNext={() => go(2)} />}
      {d.step === 2 && <Step2 d={d} patch={patch} meta={meta} token={token} busy={busy} run={run} post={post} onBack={() => go(1)} onNext={() => go(3)} />}
      {d.step === 3 && <Step3 d={d} patch={patch} meta={meta} rq={rq} busy={busy} run={run} post={post} onBack={() => (editing ? (setEditing(null), go(6)) : go(2))} onNext={() => (editing === "benefit" ? (setEditing(null), go(6)) : go(paid ? 4 : 5))} nextLabel={editing === "benefit" ? "고치고 돌아가기" : undefined} />}
      {d.step === 4 && <Step4 d={d} patch={patch} s={s} bank={meta.bank} onBack={() => go(3)} onNext={() => go(5)} />}
      {d.step === 5 && <Step5 d={d} patch={patch} s={s} rq={rq} busy={busy}
        nextLabel={editing === "kit" ? "배송지 고치고 돌아가기" : undefined}
        onBack={() => (editing ? (setEditing(null), go(6)) : go(paid ? 4 : 3))}
        onNext={() => run(async () => {
          // 배송지는 완료 기록에만 남는 값이다 — 고쳤으면 다시 기록해야 실제로 바뀐다.
          // 원장은 append-only 라 수정도 한 줄로 남는다. 그게 맞다(무엇이 언제 바뀌었는지가 증거다).
          const j = await post(`/api/onboard/${token}/complete`, { owner_name: d.owner_name, biz_no: d.biz_no, phone: d.phone, email: d.email, kit_address: d.kit_address, kit_ok: d.kit_ok, signature: d.signature, revision: editing === "kit" }) as { guide_url?: string | null };
          setEditing(null); patch({ step: 6 }); setMeta((m) => m ? { ...m, done: true } : m); (window as unknown as { __guide?: string | null }).__guide = j.guide_url ?? null; window.scrollTo({ top: 0 });
        })} />}
      {d.step === 6 && <Step6 d={d} s={s} revisit={Boolean(meta.already) && !meta.done} guide={(window as unknown as { __guide?: string | null }).__guide ?? null} onEdit={(what) => { setEditing(what); go(what === "benefit" ? 3 : 5); }} />}
    </Shell>
  );
}

/* ════════════ 단계별 화면 ════════════ */

function Step0({ d, patch, rq, token, busy, run, post, onNext, sms }: StepProps & { rq: string; token: string; sms: boolean }) {
  const [info, setInfo] = useState<{ name?: string; address?: string; phone_number?: string } | null>(null);
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  useEffect(() => { fetch(`/api/dashboard/restaurant${rq}`).then((r) => (r.ok ? r.json() : null)).then((j) => { setInfo(j); if (j?.address && !d.kit_addr1) patch({ kit_addr1: j.address }); }).catch(() => null); }, [rq]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * 어느 칸이 막고 있는지 화면이 말해야 한다.
   * 0921 실측: 사업자등록번호를 9자리 적었는데 '다음'만 꺼져 있고 이유가 어디에도 없었다.
   * 사장님은 그 화면에서 그냥 멈춘다 — 담당자에게 전화하거나, 그만둔다.
   * 칸을 건드린 뒤에만 지적한다(빈 칸에 먼저 소리치지 않는다).
   */
  const bizDigits = d.biz_no.replace(/\D/g, ""), phoneDigits = d.phone.replace(/\D/g, "");
  const okName = d.owner_name.trim().length >= 2, okBiz = /^\d{10}$/.test(bizDigits), okPhone = /^01\d{8,9}$/.test(phoneDigits);
  const errName = d.owner_name.trim() && !okName ? "두 글자 이상 적어 주세요." : undefined;
  const errBiz = bizDigits && !okBiz ? `숫자 10자리여야 합니다 — 지금 ${bizDigits.length}자리입니다.` : undefined;
  const errPhone = phoneDigits && !okPhone ? "010 으로 시작하는 휴대폰 번호를 적어 주세요." : undefined;
  const missing = [okName ? null : "대표자 성함", okBiz ? null : "사업자등록번호", okPhone ? null : "휴대폰 번호", d.pin_set ? null : "PIN 4자리"].filter(Boolean) as string[];
  const canNext = missing.length === 0;
  return (
    <section>
      <H title="내 매장이 맞나요?" time="30초" />
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-4 text-[13.5px]">
        <Row k="매장명" v={info?.name ?? "…"} /><Row k="주소" v={info?.address || "—"} /><Row k="매장 전화" v={info?.phone_number || "—"} />
        <p className="text-[11.5px] text-gray-400 mt-2">주소·전화가 다르면 등록 후 대시보드에서 바로 고칠 수 있습니다.</p>
      </div>
      <div className="grid gap-3">
        <Field label="대표자 성함" required error={errName}><Input name="owner_name" autoComplete="off" value={d.owner_name} onChange={(e) => patch({ owner_name: e.target.value })} placeholder="홍길동" /></Field>
        <Field label="사업자등록번호" required hint="숫자 10자리" error={errBiz}><Input name="biz_no" autoComplete="off" inputMode="numeric" value={d.biz_no} onChange={(e) => patch({ biz_no: e.target.value })} placeholder="000-00-00000" /></Field>
        <Field label="휴대폰 번호" required hint={sms ? "인증번호를 보내드립니다" : "계약서 사본과 연락에 씁니다"} error={errPhone}><Input name="owner_phone" type="tel" autoComplete="off" inputMode="tel" value={d.phone} onChange={(e) => patch({ phone: e.target.value.replace(/[^\d-]/g, "") })} placeholder="010-0000-0000" /></Field>
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
      <Nav onNext={onNext} nextDisabled={!canNext} nextHint={canNext ? undefined : `아직 남았습니다 — ${missing.join(" · ")}`} />
    </section>
  );
}

function Step1({ s, paid, terms, onBack, onNext }: { s: Meta["store"]; paid: boolean; terms: Meta["terms"]; onBack: () => void; onNext: () => void }) {
  return (
    <section>
      <H title="플랜 확인" time="20초" />
      <div className="rounded-2xl border-2 border-navy bg-white p-5 mb-3">
        <div className="flex items-baseline justify-between"><span className="font-display text-[19px] font-bold text-gray-900">{s.plan_label}</span><span className="font-display text-[19px] font-bold text-navy">{paid ? `월 ${fmtWon(s.fee)}` : "0원"}</span></div>
        {paid && <p className="text-[12.5px] text-gray-500 mt-1">부가세 {fmtWon(s.vat)} 별도 · 실제 청구 월 {fmtWon(s.fee + s.vat)}</p>}
        <ul className="mt-3 text-[13px] text-gray-700 space-y-1">
          <li>· 앱에 매장·혜택 상시 게재, 기본 쿠폰·스탬프·마일리지 추첨 운영</li>
          <li>· 당첨 식사권 대금 매월 정산 · 포스터 1종 + QR 스티커 2매</li>
          {paid && <li>· 캠페인(한정 쿠폰) 편입 · 앱 배너·푸시 · 매거진 게재</li>}
        </ul>
      </div>
      <div className="rounded-xl bg-navy/[0.04] border border-navy/10 p-3 text-[12.5px] text-gray-700">
        <p className="mb-1"><b>시작은 다음 달 1일({kdate(terms.schedule.starts_on)})입니다.</b> 그때까지는 준비 기간이라 {paid ? "이용료를 받지 않습니다" : "부담하실 것이 없습니다"}. 저희가 매장 정보·혜택 등록과 포스터 제작을 마쳐 둡니다.</p>
        <p className="mb-1"><b>정해진 종료일이 없습니다.</b> 개시일부터 그만두겠다고 말씀하실 때까지 매월 이어집니다. 최소 이용기간은 <b>1개월 — {kdate(terms.schedule.starts_on)} ~ {kdate(terms.schedule.min_term_to)}</b>입니다.</p>
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
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!done}
        nextHint={done ? undefined : !allChecked ? "아직 남았습니다 — 중요 내용 확인 (전부 체크해 주세요)" : d.signature.trim().length < 2 ? "아직 남았습니다 — 성함 서명" : "아직 남았습니다 — 계약 체결 버튼"} />
    </section>
  );
}

function Step3({ d, patch, meta, rq, busy, run, post, onBack, onNext, nextLabel }: StepProps & { meta: Meta; rq: string; nextLabel?: string }) {
  const [stampSaved, setStampSaved] = useState(false);
  const [savedCoupons, setSavedCoupons] = useState(0);
  const [specialSaved, setSpecialSaved] = useState(false);
  const paid = meta.store.plan !== "FREE";

  /**
   * 이미 등록된 혜택을 **화면으로 되살린다.**
   *
   * 0921 실측: 같은 매장에 링크를 다시 냈더니 "✓ 스탬프를 등록했습니다"라고만 뜨고
   * 내용은 하나도 안 보이는데 칸은 전부 잠겨 있었다. 등록됐다는 사실만 백엔드에서 읽고
   * 내용은 안 읽어서다. 사장님 입장에서는 뭘 등록했는지도 모르고 고칠 수도 없다.
   *
   * 초안이 비어 있을 때만 채운다 — 적던 걸 덮어쓰면 안 된다.
   */
  useEffect(() => {
    fetch(`/api/dashboard/stamp-rule${rq}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const rule = j?.rule ?? j;
      const th = rule?.config_json?.thresholds as { stamps?: number; reward_text?: string }[] | undefined;
      if (!rule?.active || !Array.isArray(th) || !th.length) return;
      setStampSaved(true);
      if (Object.keys(d.stamp_steps).length) return;
      const back: Record<string, string> = {};
      for (const t of th) if (Number(t?.stamps) > 0) back[String(t.stamps)] = String(t.reward_text ?? "");
      patch({ stamp_steps: back, stamp_note: String(rule.config_json?.notes ?? "") });
    }).catch(() => null);

    fetch(`/api/dashboard/restaurant-benefits${rq}&kind=GENERAL`).then((r) => (r.ok ? r.json() : null)).then((list: { title?: string; subtitle?: string }[] | null) => {
      if (!Array.isArray(list) || !list.length) return;
      setSavedCoupons(list.length);
      if (d.coupons.length) return;
      patch({ coupons: list.map((x) => ({ benefit: String(x.title ?? ""), cond: String(x.subtitle ?? "") })) });
    }).catch(() => null);

    fetch(`/api/dashboard/restaurant-benefits${rq}&kind=SPECIAL`).then((r) => (r.ok ? r.json() : null)).then((list: { title?: string; subtitle?: string }[] | null) => {
      if (!Array.isArray(list) || !list.length) return;
      setSpecialSaved(true);
      if (d.special) return;
      patch({ special: { benefit: String(list[0].title ?? ""), cond: String(list[0].subtitle ?? "") } });
    }).catch(() => null);
  }, [rq]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = Object.keys(d.stamp_steps).map(Number).sort((a, b) => a - b);
  const filled = steps.filter((n) => (d.stamp_steps[String(n)] ?? "").trim());
  const toggle = (n: number) => {
    const next = { ...d.stamp_steps }; const k = String(n);
    if (k in next) delete next[k]; else next[k] = "";
    patch({ stamp_steps: next });
  };

  /**
   * 혜택 등록은 **선언형**이다 — "지금 우리 매장 쿠폰은 이것들이다".
   * 그래서 저장할 때마다 같은 종류(kind)의 기존 행을 지우고 새로 넣는다.
   *
   * 그냥 POST 만 하면 안 되는 이유: 백엔드에 `uq_restaurant_benefit_slot`
   * (restaurant, kind, stamp_key, sort_order) 유니크 제약이 있다 (coupons/models.py).
   * 같은 자리에 두 번 넣으면 IntegrityError → 400 이고, 점주 화면에서는 "버튼이 안 눌린다"로 보인다.
   * 고쳐서 다시 누르는 건 온보딩에서 늘 일어나는 일이라 재실행이 되게 만든다. (0921)
   */
  const replaceBenefits = async (kind: string, rows: Record<string, unknown>[]) => {
    const cur = await fetch(`/api/dashboard/restaurant-benefits${rq}&kind=${kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []) as { id?: number }[];
    for (const b of Array.isArray(cur) ? cur : []) {
      if (b?.id) await fetch(`/api/dashboard/restaurant-benefits/${b.id}${rq}`, { method: "DELETE" }).catch(() => null);
    }
    for (const [i, row] of rows.entries()) {
      await post(`/api/dashboard/restaurant-benefits${rq}`, { kind, sort_order: i, active: true, ...row });
    }
  };

  // 고른 칸은 전부 채워야 한다 — 빈 칸이 있으면 그 칸은 보상 없이 저장돼 손님이 헛걸음한다
  const blanks = steps.filter((n) => !(d.stamp_steps[String(n)] ?? "").trim());
  const saveStamp = () => run(async () => {
    if (!steps.length) throw new Error("스탬프 칸을 골라 주세요.");
    if (blanks.length) throw new Error(`${blanks.join("개, ")}개 칸에 무엇을 드릴지 적어 주세요.`);
    // config_json 은 통째로 교체된다 — 완료 표식(onboarded_at)이 있으면 지우지 않게 합쳐서 쓴다.
    // 등록을 마친 뒤 혜택을 고치면 표식이 날아가고, 그 매장은 다시 "안 끝난 매장"이 된다.
    const prev = await fetch(`/api/dashboard/stamp-rule${rq}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j?.rule ?? j)?.config_json ?? {}).catch(() => ({})) as Record<string, unknown>;
    await post(`/api/dashboard/stamp-rule${rq}`, {
      rule_type: "THRESHOLD",
      config_json: {
        ...(prev.onboarded_at ? { onboarded_at: prev.onboarded_at } : {}),
        thresholds: steps.map((n) => ({ stamps: n, reward_text: d.stamp_steps[String(n)].trim() })),
        notes: d.stamp_note.trim(),
      },
      active: true,
    }, "PATCH");
    // 스탬프 보상도 혜택 카탈로그에 남긴다 — 앱·계약서가 같은 값을 본다
    await replaceBenefits("STAMP", steps.map((n) => ({
      stamp_key: String(n), title: d.stamp_steps[String(n)].trim(),
      subtitle: `${n}개 모으면`, notes: d.stamp_note.trim(),
    })));
    setStampSaved(true);
  });

  const couponBlank = d.coupons.some((c) => !c.benefit.trim());
  const saveCoupons = () => run(async () => {
    const list = d.coupons.filter((c) => c.benefit.trim());
    if (!list.length) throw new Error("쿠폰 혜택을 적어 주세요.");
    if (couponBlank) throw new Error("비어 있는 쿠폰 칸이 있습니다. 채우거나 삭제해 주세요.");
    await replaceBenefits("GENERAL", list.map((c) => ({ title: c.benefit.trim(), subtitle: c.cond.trim(), notes: c.cond.trim() })));
    setSavedCoupons(list.length);
  });

  const saveSpecial = () => run(async () => {
    const sp = d.special;
    if (!sp?.benefit.trim()) throw new Error("한정 쿠폰 혜택을 적어 주세요.");
    await replaceBenefits("SPECIAL", [{ title: sp.benefit.trim(), subtitle: sp.cond.trim(), notes: sp.cond.trim() }]);
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
        {stampSaved ? <div className="mt-2"><Saved text="스탬프를 등록했습니다." onEdit={() => setStampSaved(false)} /></div>
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
        {savedCoupons > 0 ? <Saved text={`쿠폰 ${savedCoupons}개를 등록했습니다.`} onEdit={() => setSavedCoupons(0)} /> : (
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
        ) : specialSaved ? <Saved text="한정 쿠폰을 등록했습니다." onEdit={() => setSpecialSaved(false)} /> : (
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

      <Nav onBack={onBack} onNext={onNext} nextLabel={nextLabel} nextDisabled={!stampSaved} nextHint={stampSaved ? undefined : "스탬프를 등록해야 다음으로 갈 수 있습니다"} />
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
      {/* 예전엔 "계약 단계로 돌아가라"고만 했다 — 돌아가는 버튼이 없어 '이전'을 두 번 눌러야 했고,
          계약은 이미 체결돼 그 화면에서 이메일을 고칠 수도 없었다. 여기서 바로 받는다.
          완료 기록(complete)에 그대로 실려 나가므로 계산서·사본 발송에 쓰인다. (0921) */}
      {!d.email && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] font-semibold text-amber-900">세금계산서 받으실 이메일을 적어 주세요</p>
          <p className="text-[12px] text-amber-800 mt-0.5 mb-2">계산서와 계약서 사본을 이 주소로 보내드립니다. 지금 적으셔도 됩니다.</p>
          <Input type="email" autoComplete="off" inputMode="email" value={d.email} onChange={(e) => patch({ email: e.target.value })} placeholder="owner@example.com" />
        </div>
      )}
      <label className="flex gap-3 items-start mt-3 cursor-pointer"><input type="checkbox" className="mt-1 w-4 h-4 accent-[#050072]" checked={d.paid_clicked} onChange={(e) => patch({ paid_clicked: e.target.checked })} /><span className="text-[13px] text-gray-800">입금 안내를 확인했습니다 (지금 바로 입금하지 않으셔도 됩니다)</span></label>
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!d.paid_clicked} nextHint={d.paid_clicked ? undefined : "아직 남았습니다 — 입금 안내 확인"} />
    </section>
  );
}

/**
 * 우편번호 찾기 — 다음(카카오) 우편번호 서비스. 무료, 키 없음, 국내 주소 정본.
 *
 * 왜 팝업이 아니라 레이어인가: 팝업 창은 모바일 브라우저에서 차단되는 일이 잦다.
 * 점주 대부분이 카톡 링크를 폰으로 연다 — 여기서 막히면 배송지를 못 적는다.
 * 스크립트는 이 버튼을 누를 때 처음 받는다(초기 로딩에 얹지 않는다).
 */
const POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
type PostcodeData = { zonecode: string; roadAddress: string; jibunAddress: string; buildingName?: string; apartment?: string };
type DaumPostcode = { new (o: { oncomplete: (d: PostcodeData) => void; onclose?: () => void; width?: string; height?: string }): { embed: (el: HTMLElement) => void } };

function loadPostcode(): Promise<DaumPostcode> {
  const w = window as unknown as { daum?: { Postcode?: DaumPostcode } };
  if (w.daum?.Postcode) return Promise.resolve(w.daum.Postcode);
  return new Promise((resolve, reject) => {
    const prev = document.querySelector<HTMLScriptElement>(`script[src="${POSTCODE_SRC}"]`);
    const el = prev ?? Object.assign(document.createElement("script"), { src: POSTCODE_SRC, async: true });
    el.addEventListener("load", () => (w.daum?.Postcode ? resolve(w.daum.Postcode) : reject(new Error("우편번호 서비스를 불러오지 못했습니다."))));
    el.addEventListener("error", () => reject(new Error("우편번호 서비스에 연결하지 못했습니다. 주소를 직접 적어 주셔도 됩니다.")));
    if (!prev) document.body.appendChild(el);
  });
}

function PostcodeLayer({ onPick, onClose }: { onPick: (d: PostcodeData) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadPostcode()
      .then((P) => { if (live && box.current) new P({ oncomplete: onPick, onclose: onClose, width: "100%", height: "100%" }).embed(box.current); })
      .catch((e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-[480px] rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-[14px] font-bold text-gray-900">우편번호 찾기</span>
          <button type="button" className="text-[13px] text-gray-500 px-2 py-1" onClick={onClose}>닫기</button>
        </div>
        {err ? <div className="p-4"><Notice tone="amber" title="불러오지 못했습니다">{err}</Notice></div>
             : <div ref={box} style={{ height: 420 }} />}
      </div>
    </div>
  );
}

/**
 * 등록을 마친 칸 — 잠그되 **되돌릴 수 있게** 둔다.
 * 잠그기만 하면 오타 하나에 담당자한테 전화해야 한다. 등록 자체가 선언형(지우고 다시 넣기)이라
 * 다시 눌러도 쌓이지 않는다 — 고치게 두는 편이 맞다. (0921)
 */
function Saved({ text, onEdit }: { text: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <p className="text-[13px] text-green-700 font-semibold">✓ {text}</p>
      <button type="button" className="text-[12px] font-semibold text-navy underline underline-offset-2" onClick={onEdit}>고치기</button>
    </div>
  );
}

function Step5({ d, patch, s, onBack, onNext, busy, nextLabel }: { d: Draft; patch: (p: Partial<Draft>) => void; s: Meta["store"]; rq: string; onBack: () => void; onNext: () => void; busy: boolean; nextLabel?: string }) {
  const [open, setOpen] = useState(false);
  // 서버로 나가는 건 합친 한 줄이다. 어느 칸이 바뀌든 여기서 다시 만든다 — 화면과 기록이 갈라지지 않게.
  const compose = (zip: string, a1: string, det: string) => `${zip ? `(${zip}) ` : ""}${a1}${det ? ` ${det}` : ""}`.trim();
  const setAddr = (v: Partial<Pick<Draft, "kit_zip" | "kit_addr1" | "kit_detail">>) => {
    const zip = v.kit_zip ?? d.kit_zip, a1 = v.kit_addr1 ?? d.kit_addr1, det = v.kit_detail ?? d.kit_detail;
    patch({ ...v, kit_address: compose(zip, a1, det) });
  };
  const pick = (r: PostcodeData) => {
    const bld = r.buildingName && r.apartment === "Y" ? ` (${r.buildingName})` : "";
    setAddr({ kit_zip: r.zonecode, kit_addr1: (r.roadAddress || r.jibunAddress) + bld });
    setOpen(false);
  };
  return (
    <section>
      <H title="웰컴 키트" time="30초" />
      <p className="text-[13px] text-gray-600 mb-3">포스터 1장, QR 스티커 2장, 테이블 카드, 사용 안내를 택배로 보내드립니다. <b>최초 등록 때 한 번</b> 보내드리는 것이라 배송지만 확인해 주세요.</p>
      {/* 실물을 그대로 보여 준다. 두 번 틀렸다:
          ① 네이비 카드에 매장명을 찍고 "매장명은 위와 같이 인쇄됩니다"라고 적었다 — 그런 포스터는 없다.
          ② 실물이라고 넣은 하늘색 QR 이미지는 **포스터가 아니라 스티커**였다.
          진짜 포스터는 매장별 딥링크 포스터다 — 상호와 **방금 등록하신 혜택이 그대로 인쇄된다.**
          그래서 여기가 [3]혜택 단계의 결과를 사장님이 눈으로 확인하는 자리이기도 하다. (0922) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 mb-3">
        <p className="text-[12px] font-semibold text-gray-600 mb-2 px-1">이런 것들을 보내드립니다</p>
        <div className="grid grid-cols-2 gap-2">
          <figure className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/poster.jpg" alt="매장 포스터 예시 — 상호와 쿠폰·스탬프 혜택이 인쇄된 포스터" className="w-full rounded-lg border border-gray-100" />
            <figcaption className="text-[11.5px] text-gray-500 mt-1.5"><b className="text-gray-800">포스터 1장</b><br />상호와 <b>방금 등록하신 혜택</b>이 그대로 인쇄됩니다 <span className="text-gray-400">(사진은 다른 매장 예시)</span></figcaption>
          </figure>
          <figure className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/sticker.jpg" alt="매장 비치용 스티커 — 구글플레이·앱스토어 앱 다운로드 QR" className="w-full rounded-lg border border-gray-100" />
            <figcaption className="text-[11.5px] text-gray-500 mt-1.5"><b className="text-gray-800">QR 스티커 2장</b><br />손님이 찍으면 바로 앱을 받으십니다. 테이블·카운터용</figcaption>
          </figure>
        </div>
        <ul className="mt-3 space-y-1 px-1 border-t border-gray-100 pt-2.5">
          {[["테이블 카드", "혜택 안내가 적힌 작은 카드"],
            ["사용 안내", "스탬프 찍는 법·쿠폰 확인하는 법 한 장"]].map(([a, b]) => (
            <li key={a} className="flex gap-2 text-[12.5px]">
              <span className="text-navy font-bold shrink-0">·</span>
              <span><b className="text-gray-900">{a}</b> <span className="text-gray-500">— {b}</span></span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12px] font-semibold text-gray-700 mb-1.5">배송지 <span className="text-red-500">*</span></p>
      <div className="flex gap-2 mb-2">
        <input value={d.kit_zip} readOnly placeholder="우편번호" className="w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[14px] text-gray-900" />
        <Button onClick={() => setOpen(true)}>우편번호 찾기</Button>
      </div>
      <Input value={d.kit_addr1} onChange={(e) => setAddr({ kit_addr1: e.target.value })} placeholder="기본 주소" autoComplete="off" />
      <div className="mt-2"><Input value={d.kit_detail} onChange={(e) => setAddr({ kit_detail: e.target.value })} placeholder="상세 주소 (동·층·호수, 받는 분)" autoComplete="off" /></div>
      <p className="text-[12px] text-gray-500 mt-1">
        {d.kit_zip
          ? "상세 주소까지 적어 주시면 기사님이 헤매지 않습니다."
          : "사업장 주소가 기본으로 들어가 있습니다. 정확한 배송을 위해 우편번호 찾기로 한 번 확인해 주세요."}
      </p>

      <label className="flex gap-3 items-start mt-3 cursor-pointer"><input type="checkbox" className="mt-1 w-4 h-4 accent-[#050072]" checked={d.kit_ok} onChange={(e) => patch({ kit_ok: e.target.checked })} /><span className="text-[13px] text-gray-800">위 주소로 보내주세요. 도착하면 붙인 자리 사진 한 장 보내드릴게요.</span></label>
      {d.kit_ok && d.kit_address && <p className="text-[12.5px] text-gray-700 mt-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">보낼 곳 · {d.kit_address}</p>}
      <Nav onBack={onBack} onNext={onNext} nextLabel={nextLabel ?? "등록 마치기"} nextDisabled={busy || !d.kit_ok || d.kit_addr1.trim().length < 5}
        nextHint={d.kit_addr1.trim().length < 5 ? "아직 남았습니다 — 배송지 주소" : !d.kit_ok ? "아직 남았습니다 — 위 주소로 보내달라는 확인" : undefined} />
      {open && <PostcodeLayer onPick={pick} onClose={() => setOpen(false)} />}
    </section>
  );
}

function Step6({ d, s, guide, onEdit, revisit }: { d: Draft; s: Meta["store"]; guide: string | null; onEdit: (what: "benefit" | "kit") => void; revisit?: boolean }) {
  const stampRows = Object.entries(d.stamp_steps).filter(([, v]) => v.trim()).sort((a, b) => Number(a[0]) - Number(b[0]));
  const coupons = d.coupons.filter((c) => c.benefit.trim());
  return (
    <section className="text-center pt-4">
      <BrandStack size={52} className="mb-4" />
      <div className="mx-auto w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mb-3">✓</div>
      <h2 className="font-display text-[22px] font-bold text-gray-900">{revisit ? "이미 등록을 마치셨습니다" : "등록이 끝났습니다"}</h2>
      {revisit
        ? <p className="text-[13.5px] text-gray-600 mt-1 mb-5">{s.name} 사장님, 이 링크로 하실 일은 끝났습니다.<br />혜택을 바꾸시거나 매장 정보를 고치시려면 <b>점주 대시보드</b>에서 하시면 됩니다.</p>
        : <p className="text-[13.5px] text-gray-600 mt-1 mb-5">{s.name} 사장님, 함께하게 되어 반갑습니다.<br />{d.starts_on && <><b>{kdate(d.starts_on)}부터 시작</b>합니다. 그때까지는 준비 기간이라 부담하실 것이 없습니다.<br /></>}웰컴 키트는 곧 발송되고, 계약서 사본은 {d.email ? "이메일과 " : ""}카카오톡으로 보내드립니다.</p>}
      {/* 무엇을 등록했는지 한 장으로 — 사장님이 끝나고 확인하실 곳은 여기뿐이다.
          이게 없으면 "내가 뭘 신청한 거지"로 끝나고, 나중에 담당자에게 되묻는다. */}
      <div className="text-left max-w-sm mx-auto rounded-2xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-[12px] font-semibold text-gray-500 mb-2.5">등록하신 내용</p>
        <dl className="text-[13px] space-y-2">
          <div className="flex gap-3"><dt className="w-[68px] shrink-0 text-gray-500">플랜</dt>
            <dd className="text-gray-900 font-semibold">{s.plan_label}{s.fee ? ` · 월 ${fmtWon(s.fee)} (부가세 별도)` : " · 0원"}</dd></div>
          {d.starts_on && <div className="flex gap-3"><dt className="w-[68px] shrink-0 text-gray-500">개시일</dt>
            <dd className="text-gray-900">{kdate(d.starts_on)}</dd></div>}
          {stampRows.length > 0 && <div className="flex gap-3"><dt className="w-[68px] shrink-0 text-gray-500">스탬프</dt>
            <dd className="text-gray-900">{stampRows.map(([n, v]) => <span key={n} className="block"><b>{n}개</b> 모으면 · {v}</span>)}
              {d.stamp_note.trim() && <span className="block text-[12px] text-gray-500 mt-0.5">{d.stamp_note.trim()}</span>}</dd></div>}
          {coupons.length > 0 && <div className="flex gap-3"><dt className="w-[68px] shrink-0 text-gray-500">쿠폰</dt>
            <dd className="text-gray-900">{coupons.map((c, i) => <span key={i} className="block"><b>{c.benefit}</b>{c.cond.trim() ? <span className="text-gray-500"> · {c.cond.trim()}</span> : null}</span>)}</dd></div>}
          {d.special?.benefit.trim() && <div className="flex gap-3"><dt className="w-[68px] shrink-0 text-gray-500">한정 쿠폰</dt>
            <dd className="text-gray-900"><b>{d.special.benefit.trim()}</b>{d.special.cond.trim() ? <span className="text-gray-500"> · {d.special.cond.trim()}</span> : null}
              <span className="block text-[12px] text-gray-500">학생회 채널로 매달 홍보됩니다</span></dd></div>}
          {d.kit_address && <div className="flex gap-3"><dt className="w-[68px] shrink-0 text-gray-500">키트 배송</dt>
            <dd className="text-gray-900">{d.kit_address}</dd></div>}
        </dl>
        <p className="text-[11.5px] text-gray-400 mt-3">혜택은 점주 대시보드에서 언제든 바꾸실 수 있습니다. 바꾸시면 앱에 바로 반영됩니다.</p>
      </div>

      <div className="grid gap-2 max-w-xs mx-auto">
        {d.contract_url && <a className="block rounded-xl border border-gray-200 bg-white py-3 text-[13.5px] font-semibold text-gray-900" href={d.contract_url} target="_blank" rel="noreferrer">계약서 사본 열기</a>}
        {guide && <a className="block rounded-xl border border-gray-200 bg-white py-3 text-[13.5px] font-semibold text-gray-900" href={guide} target="_blank" rel="noreferrer">점주 안내문 받기</a>}
        <a className="block rounded-xl bg-navy text-white py-3 text-[13.5px] font-semibold" href="/dashboard/owner">점주 대시보드 열기</a>
      </div>
      <div className="mt-6 max-w-xs mx-auto rounded-2xl border border-gray-200 bg-white p-3">
        <p className="text-[12px] font-semibold text-gray-700 mb-2">고칠 것이 있으신가요?</p>
        <div className={revisit ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
          <button type="button" className="rounded-xl border border-gray-200 py-2.5 text-[12.5px] font-semibold text-gray-800" onClick={() => onEdit("benefit")}>혜택 고치기</button>
          {!revisit && <button type="button" className="rounded-xl border border-gray-200 py-2.5 text-[12.5px] font-semibold text-gray-800" onClick={() => onEdit("kit")}>배송지 고치기</button>}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">지금 고치셔도 됩니다. 나중에는 점주 대시보드에서 바꾸실 수 있습니다.</p>
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
        <div className="mb-6"><BrandLockup size={24} /></div>
        {children}
      </div>
    </main>
  );
}
function H({ title, time }: { title: string; time: string }) {
  return <div className="flex items-baseline gap-2 mb-3"><h2 className="font-display text-[20px] font-bold text-gray-900">{title}</h2><span className="text-[11px] font-semibold text-navy bg-navy/[0.07] rounded-full px-2 py-0.5">약 {time}</span></div>;
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
      {/* 안내지 오류가 아니다. 틀린 값은 칸마다 빨간 글씨로 따로 말한다 —
          여기까지 붉으면 아무것도 안 한 첫 화면이 혼나는 것처럼 보인다 (0921). */}
      {nextHint && <p className="text-[11.5px] text-gray-500 mt-2">{nextHint}</p>}
    </div>
  );
}
