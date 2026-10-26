"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandLockup } from "../onboard/[token]/Brand";
import { Button, Field, Input, Notice, Spinner, Stepper } from "@/app/dashboard/admin/_shared/ui";

/**
 * 공용 입점 신청 (1026, 명세 CGC/04_사내툴_개발/1026_공용_입점페이지/명세서.md 4장).
 * 사장님이 링크 하나로 혼자 끝낸다 — [1] 매장 찾기 → [2] 사장님 확인(카카오) → [3] 플랜 → [4] 혜택 → [5] PIN → [6] 약관 → [7] 제출.
 * 적는 내용은 브라우저에만 남는다(중간에 나가도 이어서). 서버에는 제출 때 한 번만 간다.
 * 문구는 사장님이 하실 일 기준 · 기호 축약 없이 · 「첫 기획전 1회 무료」는 아직 쓰지 않는다(결정 5).
 */
type Plan = "FREE" | "BOOST" | "PREMIUM";
interface Terms {
  version: string; hash: string; starts_on: string;
  schedule: { starts_on: string; min_term_to: string; campaign_due: string };
  fees: Record<string, Record<Plan, number>>;
  articles: { no: string; title: string; body: string[] }[];
  checks: { id: string; article: string; text: string }[];
}
interface Found { id: string; name: string; address: string; category: string }
interface Draft {
  step: number; source: string;
  campus: string; store_name: string; address: string; category: string; hubble_id: string; manual: boolean;
  owner_name: string; phone: string; biz_no: string; rep_same: boolean; rep_name: string; email: string;
  plan: Plan;
  stamps: Record<string, string>; stamp_note: string; coupons: { benefit: string; cond: string }[];
  pin: string; pin2: string;
  checks: Record<string, string>; signature: string; open_terms: boolean;
  submitted: { id: number; status: string; message: string } | null;
}
const KEY = "wl_join_v1";
const CAMPUSES = ["경북대", "영남대", "계명대"];
const STEPS = ["매장", "사장님", "플랜", "혜택", "PIN", "약관"];  // step 1~6, 0 = 소개 · 7 = 제출 완료
const PLAN_LABEL: Record<Plan, string> = { FREE: "무료", BOOST: "Boost", PREMIUM: "Premium" };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const kdate = (s: string) => { const [y, m, d] = s.split("-"); return `${y}년 ${Number(m)}월 ${Number(d)}일`; };
const digits = (v: string) => v.replace(/\D/g, "");
const fmtPhone = (v: string) => { const d = digits(v).slice(0, 11); return d.length < 8 ? d : d.length < 11 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; };
const fmtBiz = (v: string) => { const d = digits(v).slice(0, 10); return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };
function bizOk(v: string) {
  const d = digits(v).split("").map(Number);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const s = d.slice(0, 9).reduce((a, x, i) => a + x * w[i], 0) + Math.floor((d[8] * 5) / 10);
  return (10 - (s % 10)) % 10 === d[9];
}
const empty = (): Draft => ({
  step: 0, source: "", campus: "", store_name: "", address: "", category: "", hubble_id: "", manual: false,
  owner_name: "", phone: "", biz_no: "", rep_same: true, rep_name: "", email: "", plan: "FREE",
  // 기본 세트(명세 4장 [4]) — 바꾸고 싶은 사장님만 바꾼다
  stamps: { "10": "음료 1잔" }, stamp_note: "", coupons: [{ benefit: "음료 1캔", cond: "10,000원 이상 주문 시" }],
  pin: "", pin2: "", checks: {}, signature: "", open_terms: false, submitted: null,
});

export default function JoinClient() {
  const sp = useSearchParams();
  const [d, setD] = useState<Draft>(empty);
  const [ready, setReady] = useState(false);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [logged, setLogged] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const patch = useCallback((p: Partial<Draft>) => setD((x) => ({ ...x, ...p })), []);

  // 이어하기 — 브라우저에만 남긴다. PIN 은 남기지 않는다.
  useEffect(() => {
    let saved: Draft = empty();
    try { const raw = localStorage.getItem(KEY); if (raw) saved = { ...saved, ...(JSON.parse(raw) as Partial<Draft>), pin: "", pin2: "" }; } catch { /* 무시 */ }
    const src = (sp.get("src") ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
    if (src && !saved.source) saved.source = src;
    if (sp.get("login") === "fail") setErr("카카오 로그인이 끝나지 않았습니다. 다시 눌러 주세요.");
    setD(saved); setReady(true);
  }, [sp]);
  useEffect(() => { if (ready) try { localStorage.setItem(KEY, JSON.stringify({ ...d, pin: "", pin2: "" })); } catch { /* 무시 */ } }, [d, ready]);
  useEffect(() => {
    fetch("/api/join/terms").then((r) => r.json()).then(setTerms).catch(() => setErr("화면을 불러오지 못했습니다. 새로고침해 주세요."));
    fetch("/api/join/me", { cache: "no-store" }).then((r) => r.json()).then((j) => setLogged(Boolean(j.logged))).catch(() => setLogged(false));
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [d.step]);

  const go = (n: number) => { setErr(null); patch({ step: n }); };
  const kakao = () => {
    const id = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    if (!id) { setErr("카카오 로그인 설정이 없습니다. 담당자에게 알려 주세요."); return; }
    const q = new URLSearchParams({ client_id: id, redirect_uri: `${location.origin}/auth/kakao/callback`, response_type: "code", scope: "profile_nickname", state: "join:1" });
    location.href = `https://kauth.kakao.com/oauth/authorize?${q}`;
  };

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const body = {
        store_name: d.store_name, address: d.address, campus: d.campus, category: d.category, hubble_id: d.hubble_id,
        owner_name: d.owner_name, phone: d.phone, biz_no: d.biz_no, rep_name: d.rep_same ? d.owner_name : d.rep_name, email: d.email,
        plan: d.plan, source: d.source || "direct", pin: d.pin,
        benefits: { stamps: Object.entries(d.stamps).map(([n, r]) => ({ stamps: Number(n), reward: r })), stamp_note: d.stamp_note, coupons: d.coupons.filter((c) => c.benefit.trim()) },
        consent: { checks: d.checks, signature: d.signature, signed_at: new Date().toISOString() },
        website: (document.getElementById("wl-website") as HTMLInputElement | null)?.value ?? "",
      };
      const r = await fetch("/api/join/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.login) { setLogged(false); go(1); setErr(j.detail); return; }
      if (!r.ok) { setErr(j.detail ?? "제출하지 못했습니다. 잠시 뒤 다시 눌러 주세요."); return; }
      patch({ submitted: { id: j.id, status: j.status, message: j.message }, step: 7, pin: "", pin2: "" });
    } catch { setErr("인터넷 연결을 확인하고 다시 눌러 주세요."); } finally { setBusy(false); }
  }

  if (!ready || !terms) return <Shell><div className="py-24 flex justify-center"><Spinner size={28} /></div></Shell>;
  const fee = d.campus ? terms.fees[d.campus]?.[d.plan] ?? 0 : 0;

  return (
    <Shell>
      {d.step > 0 && d.step < 7 && <div className="mb-4"><Stepper steps={STEPS} current={d.step - 1} /></div>}
      {err && <div className="mb-3"><Notice tone="red" title={err} /></div>}
      {/* 사람 눈에는 안 보이는 칸 — 자동 입력 도배를 거른다 */}
      <input id="wl-website" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0" />

      {d.step === 0 && <Intro onStart={() => go(1)} />}
      {d.step === 1 && <StepStore d={d} patch={patch} onNext={() => go(2)} />}
      {d.step === 2 && <StepOwner d={d} patch={patch} logged={logged} onKakao={kakao} onBack={() => go(1)} onNext={() => go(3)}
        onSwitch={async () => { await fetch("/api/join/logout", { method: "POST" }); setLogged(false); }} />}
      {d.step === 3 && <StepPlan d={d} patch={patch} terms={terms} onBack={() => go(2)} onNext={() => go(4)} />}
      {d.step === 4 && <StepBenefit d={d} patch={patch} onBack={() => go(3)} onNext={() => go(5)} />}
      {d.step === 5 && <StepPin d={d} patch={patch} onBack={() => go(4)} onNext={() => go(6)} />}
      {d.step === 6 && <StepTerms d={d} patch={patch} terms={terms} fee={fee} busy={busy} onBack={() => go(5)} onSubmit={submit} />}
      {d.step === 7 && <Done d={d} fee={fee} onNew={() => { setD({ ...empty(), source: d.source }); }} />}
    </Shell>
  );
}

/* ───────── 화면 조각 ───────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-[#F5F6FA]">
      <div className="max-w-[520px] mx-auto px-4 pt-5 pb-16">
        <header className="flex items-center justify-between mb-5"><BrandLockup size={24} /><span className="text-[12px] text-gray-500">파트너 입점 신청</span></header>
        <div className="bg-white rounded-[20px] border border-black/[0.05] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)] p-5">{children}</div>
        <p className="text-[11.5px] text-gray-400 text-center mt-4">문의 hello@wouldulike.kr · 코끼리(서비스명 우주라이크)</p>
      </div>
    </main>
  );
}

function H({ title, sub }: { title: string; sub?: string }) {
  return <div className="mb-4"><h1 className="text-[19px] font-extrabold text-gray-900 tracking-[-0.02em] text-balance">{title}</h1>{sub && <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{sub}</p>}</div>;
}

function Nav({ onBack, onNext, nextLabel = "다음", disabled, hint }: { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="mt-6">
      {hint && disabled && <p className="text-[12px] text-amber-700 mb-2">{hint}</p>}
      <div className="flex gap-2">
        {onBack && <Button onClick={onBack}>이전</Button>}
        <Button variant="primary" className="flex-1" disabled={disabled} onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <section>
      <H title="대구 대학생에게 사장님 가게를 알려 드립니다" sub="우주라이크는 경북대 · 영남대 · 계명대 학생들이 쓰는 맛집 앱과 인스타그램 매거진입니다." />
      <ul className="space-y-2.5 text-[14px] text-gray-700">
        <li className="flex gap-2"><b className="text-navy shrink-0">1</b>신청은 이 화면에서 끝납니다. 매장 확인 · 혜택 · 약관 동의까지 5분 정도 걸립니다.</li>
        <li className="flex gap-2"><b className="text-navy shrink-0">2</b>쿠폰 · 스탬프는 기본으로 켜 둡니다. 바꾸고 싶으실 때만 바꾸시면 됩니다.</li>
        <li className="flex gap-2"><b className="text-navy shrink-0">3</b>담당자가 확인한 뒤 연락드리고, 그 뒤로 사장님이 하실 일은 거의 없습니다.</li>
      </ul>
      <p className="text-[12.5px] text-gray-500 mt-4">무료로 시작하실 수 있고, 유료 플랜은 원하실 때 고르시면 됩니다.</p>
      <Nav onNext={onStart} nextLabel="입점 신청하기" />
    </section>
  );
}

function StepStore({ d, patch, onNext }: { d: Draft; patch: (p: Partial<Draft>) => void; onNext: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!d.campus || q.trim().length < 2) { setFound(null); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const j = await fetch(`/api/join/search?${new URLSearchParams({ campus: d.campus, q: q.trim() })}`).then((r) => r.json()).catch(() => ({ stores: [] }));
      setFound(j.stores ?? []); setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, d.campus]);
  const chosen = d.store_name && (d.hubble_id || d.manual);
  return (
    <section>
      <H title="어느 매장인가요" sub="학교를 고르고 가게 이름을 찾아 주세요. 구청에 등록된 이름으로 나옵니다." />
      <p className="text-[12.5px] font-bold text-gray-600 mb-1.5">가까운 학교</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {CAMPUSES.map((c) => <button key={c} type="button" onClick={() => patch({ campus: c, hubble_id: "", manual: false, store_name: "" })} aria-pressed={d.campus === c}
          className={`h-11 rounded-xl border text-[14px] font-bold ${d.campus === c ? "border-navy bg-navy text-white" : "border-gray-200 text-gray-600"}`}>{c}</button>)}
      </div>
      {d.campus && !chosen && (
        <>
          <Field label="가게 이름"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 다나, 혜화문식당" autoFocus /></Field>
          {loading && <p className="text-[12.5px] text-gray-400 mt-2">찾는 중…</p>}
          {found && !loading && (
            <ul className="mt-2 rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {found.map((s) => <li key={s.id}><button type="button" className="w-full text-left px-3 py-2.5 hover:bg-gray-50" onClick={() => patch({ store_name: s.name, address: s.address, category: s.category, hubble_id: s.id, manual: false })}>
                <b className="text-[14px] text-gray-900">{s.name}</b><span className="block text-[12px] text-gray-500">{s.category} · {s.address}</span></button></li>)}
              <li><button type="button" className="w-full text-left px-3 py-2.5 text-[13px] text-navy font-semibold" onClick={() => patch({ manual: true, store_name: q.trim(), hubble_id: "" })}>목록에 없어요 — 직접 적을게요</button></li>
            </ul>
          )}
        </>
      )}
      {chosen && (
        <div className="rounded-xl bg-navy/[0.04] p-3 space-y-2">
          {d.manual ? (
            <>
              <Field label="가게 이름"><Input value={d.store_name} onChange={(e) => patch({ store_name: e.target.value })} /></Field>
              <Field label="주소"><Input value={d.address} onChange={(e) => patch({ address: e.target.value })} placeholder="도로명 주소" /></Field>
              <Field label="업종"><Input value={d.category} onChange={(e) => patch({ category: e.target.value })} placeholder="예: 한식, 카페, 주점" /></Field>
            </>
          ) : (
            <><p className="text-[15px] font-bold text-gray-900">{d.store_name}</p><p className="text-[12.5px] text-gray-500">{d.category} · {d.address}</p></>
          )}
          <button type="button" className="text-[12.5px] text-gray-500 underline" onClick={() => patch({ store_name: "", hubble_id: "", manual: false, address: "", category: "" })}>다른 매장으로 다시 찾기</button>
        </div>
      )}
      <Nav onNext={onNext} disabled={!chosen || !d.store_name.trim() || (d.manual && !d.address.trim())} hint="매장을 골라 주세요." />
    </section>
  );
}

function StepOwner({ d, patch, logged, onKakao, onBack, onNext, onSwitch }: { d: Draft; patch: (p: Partial<Draft>) => void; logged: boolean | null; onKakao: () => void; onBack: () => void; onNext: () => void; onSwitch: () => void }) {
  if (logged === null) return <div className="py-10 flex justify-center"><Spinner /></div>;
  if (!logged) return (
    <section>
      <H title="사장님 확인" sub="신청하신 분을 확인하려고 카카오로 로그인합니다. 승인되면 이 카카오 계정으로 우주라이크에서 사장님 화면을 바로 보실 수 있습니다." />
      <button type="button" onClick={onKakao} className="w-full h-12 rounded-xl bg-[#FEE500] text-[#191600] font-bold text-[15px]">카카오로 계속하기</button>
      <p className="text-[12px] text-gray-400 mt-2">적어 두신 내용은 이 기기에 남아 있어서, 돌아오면 이어서 하실 수 있습니다.</p>
      <Nav onBack={onBack} onNext={() => undefined} disabled nextLabel="다음" />
    </section>
  );
  const bizBad = d.biz_no.length > 0 && digits(d.biz_no).length === 10 && !bizOk(d.biz_no);
  const ok = d.owner_name.trim() && digits(d.phone).length >= 10 && bizOk(d.biz_no) && (d.rep_same || d.rep_name.trim());
  return (
    <section>
      <H title="사장님 정보" sub="계약서와 세금계산서에 들어가는 정보입니다." />
      <div className="space-y-3">
        <Field label="성함"><Input value={d.owner_name} onChange={(e) => patch({ owner_name: e.target.value })} autoComplete="name" /></Field>
        <Field label="휴대폰 번호"><Input value={d.phone} onChange={(e) => patch({ phone: fmtPhone(e.target.value) })} inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" /></Field>
        <Field label="사업자등록번호" error={bizBad ? "번호를 다시 확인해 주세요." : undefined}><Input value={d.biz_no} onChange={(e) => patch({ biz_no: fmtBiz(e.target.value) })} inputMode="numeric" placeholder="000-00-00000" /></Field>
        <label className="flex items-center gap-2 text-[13.5px] text-gray-700"><input type="checkbox" checked={d.rep_same} onChange={(e) => patch({ rep_same: e.target.checked })} className="accent-[#060073] w-4 h-4" />제가 사업자등록증의 대표자입니다</label>
        {!d.rep_same && <Field label="대표자 성함"><Input value={d.rep_name} onChange={(e) => patch({ rep_name: e.target.value })} /></Field>}
        <Field label="이메일 (선택)" hint="계약서 사본과 세금계산서를 받으실 주소입니다."><Input value={d.email} onChange={(e) => patch({ email: e.target.value.trim() })} inputMode="email" autoComplete="email" /></Field>
      </div>
      <button type="button" onClick={onSwitch} className="mt-3 text-[12px] text-gray-400 underline">다른 카카오 계정으로 신청하기</button>
      <Nav onBack={onBack} onNext={onNext} disabled={!ok} hint="빈 칸이나 맞지 않는 번호가 있습니다." />
    </section>
  );
}

function StepPlan({ d, patch, terms, onBack, onNext }: { d: Draft; patch: (p: Partial<Draft>) => void; terms: Terms; onBack: () => void; onNext: () => void }) {
  const fees = terms.fees[d.campus] ?? terms.fees["경북대"];
  const rows: { p: Plan; what: string }[] = [
    { p: "FREE", what: "앱에 매장 등록 · 기본 쿠폰과 스탬프 · 마일리지 추첨 참여" },
    { p: "BOOST", what: "무료 플랜 전부 + 매주 파트너 묶음 카드뉴스에 월 1회 · 한정 쿠폰 캠페인 · 앱 배너" },
    { p: "PREMIUM", what: "Boost 전부 + 파트너 묶음 카드뉴스 월 2회 · 큐레이션 편" },
  ];
  return (
    <section>
      <H title="플랜을 골라 주세요" sub="처음엔 무료로 시작하시는 걸 권합니다. 유료 플랜은 담당자가 연락드린 뒤 시작합니다." />
      <div className="space-y-2">
        {rows.map(({ p, what }) => (
          <button key={p} type="button" onClick={() => patch({ plan: p })} aria-pressed={d.plan === p}
            className={`w-full text-left rounded-xl border p-3 ${d.plan === p ? "border-navy ring-2 ring-navy/15 bg-navy/[0.03]" : "border-gray-200"}`}>
            <span className="flex justify-between items-baseline"><b className="text-[15px] text-gray-900">{PLAN_LABEL[p]}</b>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums">{fees[p] ? `월 ${won(fees[p])}` : "0원"}</span></span>
            {fees[p] > 0 && <span className="block text-right text-[11.5px] text-gray-400">부가세 포함 {won(Math.round(fees[p] * 1.1))}</span>}
            <span className="block text-[12.5px] text-gray-600 mt-1">{what}</span>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-gray-400 mt-3">시작은 다음 달 1일({kdate(terms.starts_on)})이고, 그때까지는 준비 기간이라 이용료가 없습니다. 위약금은 없습니다.</p>
      <Nav onBack={onBack} onNext={onNext} />
    </section>
  );
}

function StepBenefit({ d, patch, onBack, onNext }: { d: Draft; patch: (p: Partial<Draft>) => void; onBack: () => void; onNext: () => void }) {
  const steps = Object.keys(d.stamps).map(Number).sort((a, b) => a - b);
  const blank = steps.filter((n) => !d.stamps[String(n)]?.trim());
  const toggle = (n: number) => { const s = { ...d.stamps }; if (String(n) in s) delete s[String(n)]; else s[String(n)] = ""; patch({ stamps: s }); };
  return (
    <section>
      <H title="손님께 드릴 혜택" sub="기본으로 하나씩 깔아 두었습니다. 가게에 맞게 바꾸시면 됩니다." />
      <div className="rounded-xl border-2 border-navy p-3 mb-3">
        <p className="text-[14px] font-bold text-gray-900">스탬프 <span className="text-red-600 text-[12px] ml-1">필수</span></p>
        <p className="text-[12.5px] text-gray-600 mb-2">방문할 때마다 하나씩 찍힙니다. 보상을 드릴 칸을 고르고, 무엇을 드릴지 적어 주세요.</p>
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => { const on = String(n) in d.stamps; return (
            <button key={n} type="button" onClick={() => toggle(n)} aria-pressed={on} className={`h-10 rounded-lg border text-[13.5px] font-bold ${on ? "border-navy bg-navy text-white" : "border-gray-200 text-gray-500"}`}>{n}</button>); })}
        </div>
        <div className="space-y-2">
          {steps.map((n) => <Field key={n} label={`${n}개 모으면`}><Input value={d.stamps[String(n)]} onChange={(e) => patch({ stamps: { ...d.stamps, [String(n)]: e.target.value } })} placeholder="예: 음료 1잔, 사이드 메뉴 1개" /></Field>)}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="text-[14px] font-bold text-gray-900">첫 방문 쿠폰 <span className="text-gray-400 text-[12px] font-normal ml-1">선택</span></p>
        <div className="space-y-2 mt-2">
          {d.coupons.map((c, i) => (
            <div key={i} className="grid gap-1.5">
              <Input value={c.benefit} onChange={(e) => patch({ coupons: d.coupons.map((x, j) => (j === i ? { ...x, benefit: e.target.value } : x)) })} placeholder="혜택 — 예: 음료 1캔" aria-label="쿠폰 혜택" />
              <Input value={c.cond} onChange={(e) => patch({ coupons: d.coupons.map((x, j) => (j === i ? { ...x, cond: e.target.value } : x)) })} placeholder="조건 — 예: 10,000원 이상 주문 시" aria-label="쿠폰 조건" />
              <button type="button" className="text-[12px] text-gray-400 underline justify-self-start" onClick={() => patch({ coupons: d.coupons.filter((_, j) => j !== i) })}>이 쿠폰 빼기</button>
            </div>))}
          {d.coupons.length < 3 && <button type="button" className="text-[13px] text-navy font-semibold" onClick={() => patch({ coupons: [...d.coupons, { benefit: "", cond: "" }] })}>쿠폰 추가</button>}
        </div>
      </div>
      <Nav onBack={onBack} onNext={onNext} disabled={!steps.length || blank.length > 0} hint={!steps.length ? "스탬프 보상 칸을 하나 이상 골라 주세요." : `${blank.join("개, ")}개 칸에 무엇을 드릴지 적어 주세요.`} />
    </section>
  );
}

function StepPin({ d, patch, onBack, onNext }: { d: Draft; patch: (p: Partial<Draft>) => void; onBack: () => void; onNext: () => void }) {
  const ok = /^\d{4}$/.test(d.pin) && d.pin === d.pin2;
  return (
    <section>
      <H title="매장 PIN 4자리" sub="손님이 쿠폰을 쓰거나 스탬프를 찍을 때, 직원분이 손님 휴대폰에 넣는 번호입니다. 가게 분들만 아시는 번호로 정해 주세요." />
      <div className="space-y-3">
        <Field label="PIN"><Input value={d.pin} onChange={(e) => patch({ pin: digits(e.target.value).slice(0, 4) })} inputMode="numeric" type="password" autoComplete="new-password" placeholder="숫자 4자리" /></Field>
        <Field label="한 번 더" error={d.pin2.length === 4 && d.pin !== d.pin2 ? "두 번 적은 번호가 다릅니다." : undefined}><Input value={d.pin2} onChange={(e) => patch({ pin2: digits(e.target.value).slice(0, 4) })} inputMode="numeric" type="password" autoComplete="new-password" /></Field>
      </div>
      <p className="text-[12px] text-gray-400 mt-2">나중에 사장님 화면에서 바꾸실 수 있습니다.</p>
      <Nav onBack={onBack} onNext={onNext} disabled={!ok} hint="숫자 4자리를 두 번 똑같이 적어 주세요." />
    </section>
  );
}

function StepTerms({ d, patch, terms, fee, busy, onBack, onSubmit }: { d: Draft; patch: (p: Partial<Draft>) => void; terms: Terms; fee: number; busy: boolean; onBack: () => void; onSubmit: () => void }) {
  const all = terms.checks.every((c) => d.checks[c.id]);
  const signOk = d.signature.trim().length >= 2;
  const toggle = (id: string) => { const c = { ...d.checks }; if (c[id]) delete c[id]; else c[id] = new Date().toISOString(); patch({ checks: c }); };
  return (
    <section>
      <H title="약관 동의" sub="중요한 내용을 하나씩 확인해 주세요. 전부 확인하신 뒤 성함을 적으시면 신청이 들어갑니다." />
      <div className="rounded-xl bg-gray-50 p-3 text-[12.5px] text-gray-600 space-y-0.5 mb-3">
        <p><b className="text-gray-900">{d.store_name}</b> · {d.campus} · {PLAN_LABEL[d.plan]}{fee ? ` 월 ${won(fee)}(부가세 별도)` : " (이용료 없음)"}</p>
        <p>개시일 {kdate(terms.starts_on)} · 최소 이용기간 {kdate(terms.schedule.min_term_to)}까지</p>
      </div>
      <ul className="space-y-2">
        {terms.checks.map((c) => (
          <li key={c.id}><label className={`flex gap-2.5 rounded-xl border p-3 cursor-pointer ${d.checks[c.id] ? "border-navy bg-navy/[0.03]" : "border-gray-200"}`}>
            <input type="checkbox" checked={Boolean(d.checks[c.id])} onChange={() => toggle(c.id)} className="mt-0.5 accent-[#060073] w-4 h-4 shrink-0" />
            <span className="text-[13px] text-gray-800 leading-relaxed">{c.text}<span className="block text-[11px] text-gray-400 mt-0.5">약관 {c.article}</span></span></label></li>))}
      </ul>
      <button type="button" onClick={() => patch({ open_terms: !d.open_terms })} className="mt-3 text-[13px] text-navy font-semibold">{d.open_terms ? "약관 전문 접기" : "약관 전문 보기"}</button>
      {d.open_terms && (
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-gray-200 p-3 text-[12.5px] text-gray-700 space-y-3">
          {terms.articles.map((a) => <div key={a.no}><p className="font-bold text-gray-900">{a.no} ({a.title})</p><ol className="list-decimal pl-4 space-y-1 mt-1">{a.body.map((b, i) => <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }} />)}</ol></div>)}
        </div>
      )}
      <div className="mt-4"><Field label="서명 — 성함을 적어 주세요" hint="이름을 적으시면 위 내용에 동의하신 것으로 계약이 성립합니다."><Input value={d.signature} onChange={(e) => patch({ signature: e.target.value })} placeholder={d.owner_name || "성함"} /></Field></div>
      <Nav onBack={onBack} onNext={onSubmit} disabled={!all || !signOk || busy} nextLabel={busy ? "제출하는 중…" : "동의하고 신청하기"} hint={!all ? "확인하지 않은 항목이 있습니다." : "성함을 적어 주세요."} />
    </section>
  );
}

function Done({ d, fee, onNew }: { d: Draft; fee: number; onNew: () => void }) {
  const dup = d.submitted?.status === "duplicate";
  return (
    <section className="text-center py-4">
      <p className="text-[40px]" aria-hidden="true">✓</p>
      <H title={dup ? "신청을 받았습니다" : "신청이 들어갔습니다"} />
      <p className="text-[14px] text-gray-700 leading-relaxed">{d.submitted?.message ?? "담당자가 확인한 뒤 연락드립니다(영업일 1일)."}</p>
      {fee > 0 && !dup && <p className="text-[13px] text-gray-600 mt-3 rounded-xl bg-gray-50 p-3">{PLAN_LABEL[d.plan]} 플랜은 담당자가 연락드리면서 입금 방법을 안내드립니다. 첫 이용료는 개시일부터 7일 안에 내시면 됩니다.</p>}
      <p className="text-[12.5px] text-gray-500 mt-4">승인되면 이 카카오 계정으로 우주라이크에 들어오시면 바로 사장님 화면이 열립니다.</p>
      <button type="button" onClick={onNew} className="mt-6 text-[12.5px] text-gray-400 underline">다른 매장도 신청하기</button>
    </section>
  );
}
