"use client";

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconDownload, IconPhoto, IconFileTypePdf, IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import type { StoreRow } from "@/lib/draft/types";
import {
  ISSUER_FALLBACK, PLAN_DESC, PLAN_NAME, addDays, bizNo, defaultQuoteFee, dotDate, kdate, minTermTo, nextMonthFirst, planFromTier, quoteNo, todaySeoul, won,
  type IssuerInfo, type QuotePlan, type QuoteValues,
} from "@/lib/quote/quote";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "../_shared/ui";

/**
 * 견적서 발급 (정산 › 견적서, 0929 민열님).
 *
 * 왼쪽에서 매장을 고르면 플랜·이용료·혜택이 매장 운영값으로 채워지고, 오른쪽 견적서에 바로 그려진다.
 * **발급할 때마다 바뀌는 칸**은 번호를 붙여 견적서 위에 점선으로 표시하고(내려받을 때는 빠진다),
 * 아래 확인 목록에서 기본값과 다르거나 비어 있는 칸을 짚는다.
 *
 * 견적서는 문서라 다크 모드를 따르지 않는다 — 전부 인라인 색으로 그린다(globals 의 다크 덮개가 못 건드리게).
 * PDF 는 A4 가로 한 장, 이미지는 PNG/JPG. 내려받으면 매장 '견적서 발송' 날짜를 발급일로 적어 둔다.
 */

const W = 1123, H = 794; // A4 가로 @96dpi
const NAVY = "#050072", INK = "#14143C", SOFT = "#5B5F7A", LINE = "#E3E4F0", TINT = "#F4F4FB", MARK = "#E0A23C";

type Key = "store" | "issued" | "valid" | "plan" | "fee" | "starts" | "benefit" | "owner" | "bank";
const CHECK_ORDER: Key[] = ["store", "issued", "valid", "plan", "fee", "starts", "benefit", "owner", "bank"];
const CHECK_LABEL: Record<Key, string> = {
  store: "대상 매장", issued: "발급일", valid: "유효기간", plan: "플랜", fee: "월 이용료", starts: "개시일", benefit: "혜택", owner: "대표자·사업자번호", bank: "입금 계좌",
};

export default function QuoteBoard({ actor }: { actor: string }) {
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [issuer, setIssuer] = useState<IssuerInfo>(ISSUER_FALLBACK);
  const [campus, setCampus] = useState("all");
  const [rid, setRid] = useState<number | null>(null);
  const [v, setV] = useState<QuoteValues>(() => blank());
  const [mark, setMark] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** 혜택을 어디서 가져왔나 — 앱에 실제 등록된 값(쿠폰·스탬프 설정)이 우선, 없으면 매장 운영값 */
  const [benefitSrc, setBenefitSrc] = useState<"app" | "ops" | "loading" | null>(null);
  const picking = useRef<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/astro/stores").then((r) => r.json()).then((d) => setStores((d.stores ?? []) as StoreRow[])).catch(() => setStores([]));
    fetch("/api/astro/invoices/settings").then((r) => r.json()).then((d) => {
      const i = d.issuer ?? {};
      setIssuer({
        // 설정의 상호가 "코끼리 (우주라이크)" 로 들어가 있다 — 견적서가 서비스명을 따로 적으므로 괄호는 뺀다
        name: String(i.name || ISSUER_FALLBACK.name).replace(/\s*\(.*?\)\s*/g, "").trim() || ISSUER_FALLBACK.name, ceo: i.ceo || ISSUER_FALLBACK.ceo, biz_no: i.biz_no || ISSUER_FALLBACK.biz_no,
        address: i.address || ISSUER_FALLBACK.address, email: i.email || ISSUER_FALLBACK.email,
        bank_name: i.bank_name || "", bank_account: i.bank_account || "", bank_holder: i.bank_holder || "",
      });
    }).catch(() => {});
  }, []);

  const list = useMemo(() => (stores ?? [])
    .filter((s) => s.is_affiliate !== false && !s.ops?.is_test)
    .filter((s) => campus === "all" || s.ops?.campus === campus)
    .sort((a, b) => a.name.localeCompare(b.name, "ko")), [stores, campus]);
  const campuses = useMemo(() => Array.from(new Set((stores ?? []).map((s) => s.ops?.campus).filter(Boolean) as string[])).sort(), [stores]);
  const store = useMemo(() => (stores ?? []).find((s) => s.restaurant_id === rid) ?? null, [stores, rid]);

  /** 매장을 고르면 운영값으로 채운다. 발급일은 오늘, 유효기간 14일, 개시일은 약관대로 다음 달 1일. */
  function pick(id: number | null) {
    setRid(id); setMsg(null); picking.current = id;
    const s = (stores ?? []).find((x) => x.restaurant_id === id);
    if (!s) { setV(blank()); setBenefitSrc(null); return; }
    const o = s.ops;
    const plan = planFromTier(s.tier);
    const issued = todaySeoul();
    const started = o?.contract_started_on && o.contract_started_on >= issued ? o.contract_started_on : nextMonthFirst(issued);
    setV({
      no: quoteNo(issued, s.restaurant_id), issued_on: issued, valid_to: addDays(issued, 14),
      store_name: o?.map_name || s.name, owner_name: o?.owner_name ?? "", biz_no: o?.biz_no ?? "", campus: o?.campus ?? "",
      plan, plan_desc: PLAN_DESC[plan],
      fee: pickFee(plan, o?.campus, o?.monthly_fee),
      starts_on: started,
      coupon_basic: o?.coupon_basic ?? "", coupon_limited: o?.coupon_limited ?? "",
      stamp: [o?.stamp_count ? `${o.stamp_count}개` : "", o?.stamp_reward ?? ""].filter(Boolean).join(" · "),
      exclusions: o?.exclusions ?? "", note: "",
    });
    setBenefitSrc("loading");
    loadAppBenefits(s.restaurant_id);
  }

  /**
   * 앱에 실제 등록된 혜택으로 덮는다 (민열님 0929 "혜택도 매장 선택하면 연동되게").
   * 계약 탭 [상세]와 같은 /api/onboard/detail — 기본 쿠폰(GENERAL)·특별 쿠폰(SPECIAL)·스탬프 단계·온보딩 입력값.
   * 앱에 값이 있는 칸만 덮고, 빈 칸은 운영값을 그대로 둔다. 그 사이 다른 매장을 고르면 버린다.
   */
  async function loadAppBenefits(id: number) {
    try {
      const d = await fetch(`/api/onboard/detail?rid=${id}&only=check`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      if (picking.current !== id) return;
      const c = d?.check as { coupons?: { title: string; subtitle: string }[]; special?: { title: string; subtitle: string; active?: boolean }[]; stamp?: { on: boolean; steps: { at: number; reward: string }[]; notes?: string } } | undefined;
      const e = d?.entered as { owner_name?: string; biz_no?: string } | null | undefined;
      const line = (b: { title: string; subtitle: string }) => [b.title, b.subtitle].filter(Boolean).join(" — ");
      const basic = (c?.coupons ?? []).filter((b) => b.title).map(line).join(" / ");
      const special = (c?.special ?? []).filter((b) => b.title && b.active !== false).map(line).join(" / ");
      const stamp = c?.stamp?.on ? c.stamp.steps.filter((t) => t.at > 0).map((t) => `${t.at}개 ${t.reward}`.trim()).join(" / ") : "";
      const any = Boolean(basic || special || stamp);
      setV((p) => ({
        ...p,
        coupon_basic: basic || p.coupon_basic,
        coupon_limited: special || p.coupon_limited,
        stamp: stamp || p.stamp,
        // 스탬프 유의사항("테이블당 1회, 중복 사용 금지" 등)은 제외 조건이 비었을 때만 채운다
        exclusions: p.exclusions || (c?.stamp?.on ? c.stamp.notes ?? "" : ""),
        owner_name: p.owner_name || e?.owner_name || "",
        biz_no: p.biz_no || e?.biz_no || "",
      }));
      setBenefitSrc(any ? "app" : "ops");
    } catch {
      if (picking.current === id) setBenefitSrc("ops");
    }
  }

  const set = <K extends keyof QuoteValues>(k: K, val: QuoteValues[K]) => setV((p) => {
    const n = { ...p, [k]: val };
    if (k === "issued_on") { n.no = quoteNo(String(val), rid); }
    if (k === "plan") { n.plan_desc = PLAN_DESC[val as QuotePlan]; n.fee = defaultQuoteFee(val as QuotePlan, n.campus); }
    return n;
  });

  /* ── 확인 목록: 발급할 때마다 손봐야 하는 칸 ── */
  const checks = useMemo(() => {
    const o = store?.ops;
    const def = defaultQuoteFee(v.plan, v.campus);
    const warn: Partial<Record<Key, string>> = {};
    const ok: Partial<Record<Key, string>> = {};
    if (!store) warn.store = "매장을 고르세요"; else ok.store = `${v.store_name}${v.campus ? ` · ${v.campus}` : ""}`;
    ok.issued = kdate(v.issued_on);
    if (v.valid_to < v.issued_on) warn.valid = "발급일보다 이릅니다"; else ok.valid = `${kdate(v.valid_to)}까지`;
    const tierPlan = store ? planFromTier(store.tier) : null;
    if (tierPlan && tierPlan !== v.plan) warn.plan = `매장 플랜은 ${PLAN_NAME[tierPlan]}인데 ${PLAN_NAME[v.plan]}로 발급합니다`; else ok.plan = PLAN_NAME[v.plan];
    if (v.plan !== "FREE" && v.fee !== def) warn.fee = `기본 단가 ${won(def)}와 다릅니다 (${v.campus || "상권 미지정"} ${PLAN_NAME[v.plan]})`;
    else if (o?.monthly_fee != null && v.plan !== "FREE" && o.monthly_fee !== v.fee) warn.fee = o.monthly_fee === Math.round(v.fee * 1.1) ? `매장 운영값 ${won(o.monthly_fee)}은 부가세 포함 금액이라 기본 단가 ${won(v.fee)}을 넣었습니다 — 파트너 매장에서 운영값도 고쳐 주세요` : `매장 운영값 ${won(o.monthly_fee)}과 다릅니다`;
    else ok.fee = v.plan === "FREE" ? "0원" : `${won(v.fee)} + 부가세`;
    if (!v.starts_on.endsWith("-01")) warn.starts = "약관상 개시일은 매월 1일입니다";
    else if (v.starts_on < v.issued_on) warn.starts = "발급일보다 이른 개시일입니다";
    else ok.starts = kdate(v.starts_on);
    if (benefitSrc === "loading") warn.benefit = "앱에 등록된 혜택을 불러오는 중…";
    else if (!v.coupon_basic && !v.stamp && !v.coupon_limited) warn.benefit = "앱에도 운영값에도 없음 — 견적서에는 '온보딩 화면에서 사장님이 등록'으로 나갑니다";
    else ok.benefit = benefitSrc === "app" ? "앱에 등록된 쿠폰·스탬프" : "매장 운영값 (앱에는 아직 없음)";
    if (!v.owner_name || !v.biz_no) warn.owner = "비워도 발급은 됩니다 — 받는 쪽 정보가 빠진 채로 나갑니다"; else ok.owner = `${v.owner_name} · ${v.biz_no}`;
    if (v.plan !== "FREE" && !issuer.bank_account) warn.bank = "세금계산서 › 발행 주체 설정에 계좌가 없습니다"; else ok.bank = v.plan === "FREE" ? "무료 플랜은 표시 안 함" : `${issuer.bank_name} ${issuer.bank_account}`;
    return CHECK_ORDER.map((k, i) => ({ k, n: i + 1, warn: warn[k], ok: ok[k] }));
  }, [store, v, issuer, benefitSrc]);
  const warnCount = checks.filter((c) => c.warn).length;

  async function download(fmt: "pdf" | "png" | "jpg") {
    if (!sheet.current || !store) return;
    setBusy(fmt); setMsg(null);
    const prevMark = mark;
    setMark(false);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { toPng, toJpeg } = await import("html-to-image");
      const opt = { pixelRatio: 2.5, cacheBust: true, backgroundColor: "#ffffff", width: W, height: H };
      const base = `견적서_${v.store_name.replace(/[\\/:*?"<>|\s]+/g, "")}_${v.issued_on.replaceAll("-", "").slice(2)}`;
      if (fmt === "pdf") {
        const png = await toPng(sheet.current, opt);
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        pdf.setProperties({ title: `견적서 ${v.no}`, subject: v.store_name, author: issuer.name });
        pdf.addImage(png, "PNG", 0, 0, 297, 210);
        pdf.save(`${base}.pdf`);
      } else {
        const url = fmt === "png" ? await toPng(sheet.current, opt) : await toJpeg(sheet.current, { ...opt, quality: 0.95 });
        const a = document.createElement("a"); a.href = url; a.download = `${base}.${fmt}`; a.click();
      }
      // 발송 기록 — 매장의 '견적서 발송' 칸(quote_sent_at)에 발급일을 적는다
      const res = await fetch(`/api/astro/stores/${store.restaurant_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote_sent_at: v.issued_on, updated_by: `${actor} · 견적서 ${v.no}` }) });
      setMsg({ ok: true, text: `${fmt.toUpperCase()}로 내려받았습니다.${res.ok ? " 매장의 견적서 발송일을 적어 두었습니다." : ` (발송일 기록 실패 ${res.status})`}` });
    } catch (e) {
      setMsg({ ok: false, text: `만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setMark(prevMark); setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="견적서" description="매장을 고르면 플랜·이용료·혜택이 채워집니다. 번호 붙은 점선 칸이 발급할 때마다 바뀌는 곳이고, 내려받은 파일에는 점선이 빠집니다." />
      <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ── 왼쪽: 값 ── */}
        <div className="space-y-4 min-w-0">
          <Card title="대상 매장">
            <div className="space-y-3">
              <Field label="캠퍼스">
                <Select value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="all">전체</option>
                  {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="매장" required>
                <Select value={rid ?? ""} onChange={(e) => pick(e.target.value ? Number(e.target.value) : null)} disabled={stores === null}>
                  <option value="">{stores === null ? "불러오는 중…" : "매장을 고르세요"}</option>
                  {list.map((s) => <option key={s.restaurant_id} value={s.restaurant_id}>{s.name} · {PLAN_NAME[planFromTier(s.tier)]}{s.ops?.campus ? ` · ${s.ops.campus}` : ""}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="대표자"><Input value={v.owner_name} onChange={(e) => set("owner_name", e.target.value)} /></Field>
                <Field label="사업자번호"><Input value={v.biz_no} onChange={(e) => set("biz_no", e.target.value)} placeholder="000-00-00000" /></Field>
              </div>
            </div>
          </Card>

          <Card title="날짜·플랜">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="발급일"><Input type="date" value={v.issued_on} onChange={(e) => set("issued_on", e.target.value)} /></Field>
                <Field label="유효기간"><Input type="date" value={v.valid_to} onChange={(e) => set("valid_to", e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="플랜">
                  <Select value={v.plan} onChange={(e) => set("plan", e.target.value as QuotePlan)}>
                    {(["FREE", "BOOST", "PREMIUM"] as QuotePlan[]).map((p) => <option key={p} value={p}>{PLAN_NAME[p]}</option>)}
                  </Select>
                </Field>
                <Field label="월 이용료 (부가세 별도)"><Input type="number" inputMode="numeric" step={1000} value={v.fee} onChange={(e) => set("fee", Number(e.target.value) || 0)} disabled={v.plan === "FREE"} /></Field>
              </div>
              <Field label="개시일" hint="약관상 동의한 달의 다음 달 1일"><Input type="date" value={v.starts_on} onChange={(e) => set("starts_on", e.target.value)} /></Field>
              <Field label="플랜 내용"><Textarea rows={3} value={v.plan_desc} onChange={(e) => set("plan_desc", e.target.value)} /></Field>
            </div>
          </Card>

          <Card title="혜택" description={benefitSrc === "app" ? "앱에 등록된 쿠폰·스탬프를 불러왔습니다. 고치면 견적서에만 반영됩니다." : benefitSrc === "loading" ? "앱에 등록된 혜택을 불러오는 중…" : benefitSrc === "ops" ? "앱에 등록된 혜택이 없어 매장 운영값을 넣었습니다." : undefined}>
            <div className="space-y-3">
              <Field label="기본 쿠폰 (상시)"><Input value={v.coupon_basic} onChange={(e) => set("coupon_basic", e.target.value)} /></Field>
              <Field label="캠페인 한정 쿠폰"><Input value={v.coupon_limited} onChange={(e) => set("coupon_limited", e.target.value)} disabled={v.plan === "FREE"} /></Field>
              <Field label="스탬프"><Input value={v.stamp} onChange={(e) => set("stamp", e.target.value)} placeholder="5 / 10개 · 음료 1잔 / 메인 1개" /></Field>
              <Field label="식사권 제외 조건"><Input value={v.exclusions} onChange={(e) => set("exclusions", e.target.value)} /></Field>
              <Field label="비고 (견적서 하단)"><Textarea rows={2} value={v.note} onChange={(e) => set("note", e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        {/* ── 오른쪽: 확인 목록 + 미리보기 ── */}
        <div className="space-y-4 min-w-0">
          <Card title={`발급 전 확인 ${warnCount ? `· 볼 곳 ${warnCount}` : "· 이상 없음"}`}>
            <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {checks.map((c) => (
                <li key={c.k} className="flex items-start gap-2 text-[13px] min-w-0">
                  <span className="mt-[1px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0" style={{ background: MARK }}>{c.n}</span>
                  <span className="min-w-0">
                    <b className="font-semibold text-gray-800">{CHECK_LABEL[c.k]}</b>{" "}
                    {c.warn
                      ? <span className="text-amber-700"><IconAlertTriangle size={13} className="inline -mt-0.5" aria-hidden="true" /> {c.warn}</span>
                      : <span className="text-gray-500"><IconCircleCheck size={13} className="inline -mt-0.5 text-emerald-600" aria-hidden="true" /> {c.ok}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<IconFileTypePdf size={16} />} disabled={!store || !!busy} onClick={() => download("pdf")}>{busy === "pdf" ? "만드는 중…" : "PDF"}</Button>
            <Button icon={<IconPhoto size={16} />} disabled={!store || !!busy} onClick={() => download("png")}>{busy === "png" ? "만드는 중…" : "PNG"}</Button>
            <Button icon={<IconDownload size={16} />} disabled={!store || !!busy} onClick={() => download("jpg")}>{busy === "jpg" ? "만드는 중…" : "JPG"}</Button>
            <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> 바뀌는 칸 표시
            </label>
          </div>
          {msg && <Notice tone={msg.ok ? "blue" : "red"} title={msg.text} />}

          <Preview>
            <Sheet ref={sheet} v={v} issuer={issuer} mark={mark} />
          </Preview>
        </div>
      </div>
    </div>
  );
}

/**
 * 월 이용료 기본값. 매장 운영값을 따르되, 운영값이 **기본 단가 × 1.1**(부가세 포함 금액)이면 기본 단가로 채운다 —
 * 북성로 33,000·88왕족발 88,000 처럼 합계가 들어가 있는 매장이 있어 그대로 쓰면 부가세가 두 번 붙는다 (0929).
 */
function pickFee(plan: QuotePlan, campus: string | null | undefined, stored: number | null | undefined): number {
  const def = defaultQuoteFee(plan, campus);
  if (plan === "FREE") return 0;
  if (stored == null || stored === 0) return def;
  if (stored === Math.round(def * 1.1)) return def;
  return stored;
}

function blank(): QuoteValues {
  const issued = todaySeoul();
  return {
    no: quoteNo(issued, null), issued_on: issued, valid_to: addDays(issued, 14), store_name: "", owner_name: "", biz_no: "", campus: "",
    plan: "BOOST", plan_desc: PLAN_DESC.BOOST, fee: 30000, starts_on: nextMonthFirst(issued),
    coupon_basic: "", coupon_limited: "", stamp: "", exclusions: "", note: "",
  };
}

/** A4 한 장을 칸 폭에 맞춰 줄여 보여 준다. 내려받을 때는 원래 크기 그대로 찍는다. */
function Preview({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="w-full overflow-hidden rounded-[14px] border border-black/[0.08] shadow-sm" style={{ height: H * scale, background: "#fff" }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

/* ═══════════ 견적서 한 장 (인라인 색 — 다크 모드 영향 없음) ═══════════ */

const NUM: Record<Key, number> = Object.fromEntries(CHECK_ORDER.map((k, i) => [k, i + 1])) as Record<Key, number>;

/** 발급할 때마다 바뀌는 칸 — 표시를 켜면 점선 + 확인 목록 번호 */
function V({ k, on, children, block }: { k: Key; on: boolean; children: ReactNode; block?: boolean }) {
  if (!on) return <>{children}</>;
  return (
    <span style={{ position: "relative", display: block ? "block" : "inline-block", outline: `1.5px dashed ${MARK}`, outlineOffset: 2, borderRadius: 3 }}>
      {children}
      <span style={{ position: "absolute", top: -9, right: -9, width: 16, height: 16, borderRadius: 8, background: MARK, color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center" }}>{NUM[k]}</span>
    </span>
  );
}

const box: CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", background: "#fff" };
const th: CSSProperties = { width: 92, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: SOFT, background: TINT, verticalAlign: "top", borderBottom: `1px solid ${LINE}`, textAlign: "left" };
const td: CSSProperties = { padding: "7px 12px", fontSize: 12.5, color: INK, borderBottom: `1px solid ${LINE}`, verticalAlign: "top", lineHeight: 1.5 };

const Sheet = forwardRef<HTMLDivElement, { v: QuoteValues; issuer: IssuerInfo; mark: boolean }>(function Sheet({ v, issuer, mark }, ref) {
  const paid = v.plan !== "FREE";
  const vat = Math.round(v.fee * 0.1);
  const total = v.fee + vat;
  const endMin = minTermTo(v.starts_on);
  const empty = <span style={{ color: "#A3A6BF" }}>온보딩 화면에서 사장님이 등록하신 내용으로 확정</span>;
  const benefits: [string, ReactNode][] = [
    ["기본 쿠폰 (상시)", v.coupon_basic || empty],
    ...(paid ? [["캠페인 한정 쿠폰", v.coupon_limited || <span key="c" style={{ color: "#A3A6BF" }}>캠페인 편입 때 매장과 정함</span>] as [string, ReactNode]] : []),
    ["스탬프", v.stamp || empty],
    ["식사권 제외 조건", v.exclusions || "없음"],
  ];
  return (
    <div ref={ref} style={{ width: W, height: H, background: "#fff", color: INK, fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", padding: "30px 40px 22px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 13 }}>
      {/* 머리 */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/appicon.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.22em", color: NAVY }}>WOULDULIKE</div>
            <div style={{ fontSize: 11, color: SOFT }}>우주라이크 · {issuer.name}</div>
          </div>
          <div style={{ marginLeft: 26, display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.3em", color: NAVY }}>견적서</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: "#6366E0" }}>QUOTATION · 우주라이크 파트너</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 12, color: SOFT, whiteSpace: "nowrap" }}>
          <span>견적번호 <b style={{ color: INK }}>{v.no}</b></span>
          <span>발급일 <V k="issued" on={mark}><b style={{ color: INK }}>{dotDate(v.issued_on)}</b></V></span>
          <span>유효기간 <V k="valid" on={mark}><b style={{ color: INK }}>{dotDate(v.valid_to)}까지</b></V></span>
        </div>
      </div>
      <div style={{ height: 2, background: NAVY }} />

      {/* 공급자 · 수신 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Party label="공급자" rows={[
          ["상호", <><b>{issuer.name}</b> (서비스명 우주라이크) · 대표자 {issuer.ceo}</>],
          ["등록번호", <><b>{issuer.biz_no}</b> · 일반과세자</>],
          ["사업장", issuer.address],
          ["연락처", `${issuer.email} · 인스타그램 @w_ouldulike`],
        ]} />
        <Party label="수신" accent rows={[
          ["매장명", <V k="store" on={mark}><b style={{ fontSize: 14 }}>{v.store_name || "매장을 고르세요"}</b>{v.campus ? <span style={{ color: SOFT }}> · {v.campus}</span> : null} <span style={{ color: SOFT }}>귀중</span></V>],
          ["대표자", <V k="owner" on={mark}>{[v.owner_name, v.biz_no && bizNo(v.biz_no)].filter(Boolean).join(" · ") || <span style={{ color: "#A3A6BF" }}>—</span>}</V>],
          ["이용 플랜", <V k="plan" on={mark} block><b>{PLAN_NAME[v.plan]}</b> — {v.plan_desc}</V>],
          ["개시일", <V k="starts" on={mark}><b>{kdate(v.starts_on)}</b> · 최소 이용기간 {dotDate(v.starts_on)} ~ {dotDate(endMin)} (1개월) · 이후 해지 시까지 월 단위</V>],
        ]} />
      </div>

      {/* 이용료 · 혜택 */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionTitle>이용료 및 납부</SectionTitle>
          <div style={box}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr><th style={th}>월 이용료</th><td style={td}><V k="fee" on={mark}><b>{won(v.fee)}</b> / 월 (공급가액)</V></td></tr>
                <tr><th style={th}>부가가치세</th><td style={td}>{won(vat)} (10%)</td></tr>
                <tr><th style={th}>월 합계</th><td style={{ ...td, fontSize: 15, fontWeight: 800, color: NAVY }}>{won(total)} <span style={{ fontSize: 11, fontWeight: 500, color: SOFT }}>/ 월 · 부가세 포함</span></td></tr>
                {paid ? (
                  <>
                    <tr><th style={th}>납부 시기</th><td style={td}>첫 달은 <b>개시일부터 7일 이내</b>, 이후 매월 <b>전월 말일까지</b>. 일할 계산 없음(개시일이 매월 1일)</td></tr>
                    <tr><th style={th}>그만둘 때</th><td style={{ ...td, borderBottom: 0 }}>매월 말일까지 문자·카톡·메일로 알려 주시면 <b>다음 달 1일자로 종료</b>. 위약금·해지 수수료 없음, 쓰지 않은 달은 <b>14일 안에 전액 환급</b></td></tr>
                  </>
                ) : (
                  <tr><th style={th}>무료 플랜</th><td style={{ ...td, borderBottom: 0 }}>이용료가 없습니다. Boost로 바꾸시면 {v.campus === "경북대" ? "월 30,000원" : "월 45,000원"}(부가세 별도)입니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionTitle>혜택 <span style={{ fontSize: 11, fontWeight: 500, color: SOFT }}>앱에 등록되어 손님께 제공되는 내용</span></SectionTitle>
          <V k="benefit" on={mark} block>
            <div style={box}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {benefits.map(([k, val], i) => <tr key={k}><th style={{ ...th, width: 110, ...(i === benefits.length - 1 ? { borderBottom: 0 } : {}) }}>{k}</th><td style={{ ...td, ...(i === benefits.length - 1 ? { borderBottom: 0 } : {}) }}>{val}</td></tr>)}
                </tbody>
              </table>
            </div>
          </V>
          <p style={{ fontSize: 11, color: SOFT, lineHeight: 1.55, margin: 0 }}>쿠폰·스탬프 혜택의 비용은 매장이, 마일리지 추첨 당첨 식사권(액면 1만원)의 대금은 회사가 부담하며 매월 10일까지 정산합니다.</p>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      {/* 합계 띠 */}
      <div style={{ background: NAVY, color: "#fff", borderRadius: 10, padding: "14px 22px", display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontSize: 13, opacity: 0.8 }}>{paid ? `${PLAN_NAME[v.plan]} 월 이용료` : "무료 플랜"}</span>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>{won(total)}</span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>/ 월 · 부가세 포함{paid ? ` (공급가 ${won(v.fee)} + 부가세 ${won(vat)})` : ""}</span>
      </div>

      {/* 하단 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 15rem", gap: 16, alignItems: "end" }}>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: SOFT, lineHeight: 1.7 }}>
          <li>계약은 온보딩 화면의 약관 동의로 성립하며, 기간의 정함 없이 해지할 때까지 월 단위로 계속됩니다. 계속을 이유로 이용료가 오르지 않습니다.</li>
          <li>입금이 확인되면 해당 월분 <b style={{ color: INK }}>세금계산서</b>를 발행합니다. 이용료를 바꾸려면 30일 전에 알려 드립니다.</li>
          {paid && <li><V k="bank" on={mark}>입금 계좌 <b style={{ color: INK }}>{issuer.bank_account ? `${issuer.bank_name} ${issuer.bank_account}` : "세금계산서에 기재"}</b>{issuer.bank_holder ? ` · 예금주 ${issuer.bank_holder}` : ""}</V> — 세금계산서에 적힌 계좌 외로는 입금을 요청하지 않습니다.</li>}
          {v.note && <li style={{ color: INK }}>{v.note}</li>}
        </ul>
        <div style={{ ...box, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: SOFT }}>공급자</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>{kdate(v.issued_on)}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginTop: 2 }}>{issuer.name} (우주라이크)</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#A3A6BF", borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
        <span>우주라이크({issuer.name}) · 사업자등록번호 {issuer.biz_no} · {issuer.email} · @w_ouldulike</span>
        <span>{v.no} · 1 / 1</span>
      </div>
    </div>
  );
});

function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 800, color: INK, display: "flex", alignItems: "baseline", gap: 8, borderLeft: `3px solid ${NAVY}`, paddingLeft: 8 }}>{children}</div>;
}

function Party({ label, rows, accent }: { label: string; rows: [string, ReactNode][]; accent?: boolean }) {
  return (
    <div style={{ ...box, display: "flex" }}>
      <div style={{ width: 30, background: accent ? "#6366E0" : NAVY, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", writingMode: "vertical-rl", letterSpacing: "0.4em" }}>{label}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([k, val], i) => (
            <tr key={k}>
              <th style={{ ...th, width: 76, ...(i === rows.length - 1 ? { borderBottom: 0 } : {}) }}>{k}</th>
              <td style={{ ...td, ...(i === rows.length - 1 ? { borderBottom: 0 } : {}) }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
