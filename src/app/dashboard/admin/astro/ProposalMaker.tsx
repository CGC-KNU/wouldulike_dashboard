"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconDownload, IconSearch, IconUpload } from "@tabler/icons-react";
import { KIND_LABEL, type Store } from "@/lib/hubble";
import { campusStores, searchStores } from "@/lib/hubbleLookup";
import { Button, Notice, SlideOver } from "../_shared/ui";

/**
 * 제안서 만들기 (1012 민열님) — 파트너 계약 탭 「새로고침」 옆.
 * ① 매장을 허블에서 찾는다(허블 매장명 = 공식 매장명) → ② 표지 제목을 정한다 → ③ 미리 보고 PDF 로 받는다.
 * 양식은 가장 최신 파트너 제안서(CGC/01_계약_영업/0911_제안서_6P, 9/15판)를 백엔드 `proposal:6p` 에 올려 둔 것.
 * 실적 숫자가 들어 있어 이 저장소(공개)에 두지 않는다. 양식이 바뀌면 여기 「양식 바꾸기」로 새 HTML 을 올린다.
 * 표지 말고는 손대지 않는다 — 상권 전환(경북대 · 영남대 · 계명대)은 양식에 이미 있는 apply() 를 그대로 부른다.
 */
const CAMPUS_KEY: Record<string, string> = { 경북대: "kbu", 영남대: "ynu", 계명대: "kmu" };
type Tpl = { html: string; version?: string; name?: string };

/** 「사장님 가게를\n*경북대* 학생들의 *단골집*으로」 → HTML (줄바꿈 · *강조*) */
function toHtml(t: string) {
  const esc = t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return esc.replace(/\*([^*]+)\*/g, "<i>$1</i>").replace(/\n/g, "<br>");
}

export default function ProposalMaker({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const [tpl, setTpl] = useState<Tpl | null | undefined>(undefined);
  const [campus, setCampus] = useState("경북대");
  const [stores, setStores] = useState<Store[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Store | null>(null);
  const [storeName, setStoreName] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || tpl !== undefined) return;
    fetch("/api/proposal/6p", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setTpl(d?.data ?? null)).catch(() => setTpl(null));
  }, [open, tpl]);
  useEffect(() => {
    if (!open) return;
    setStores(null);
    campusStores(campus).then(setStores).catch(() => setStores([]));
  }, [open, campus]);
  const found = useMemo(() => (stores ? searchStores(stores, q) : []), [stores, q]);

  function choose(s: Store) {
    setPick(s); setStoreName(s.n); setQ("");
    setTitle(`사장님 가게를\n*${campus}* 학생들의 *단골집*으로`);
  }

  // 미리보기 — 양식을 iframe 에 띄우고 상권 · 표지만 바꾼다. 인쇄용 크기(1280×720)로 맞춰 둔다.
  const srcDoc = useMemo(() => {
    if (!tpl?.html) return "";
    const css = `<style id="pm">.bar,.cap,.hint{display:none!important}.shell{max-width:none!important;padding:0!important}.deck{gap:0!important}
      .ms{width:1280px!important;height:720px!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;box-shadow:none!important}
      .cover .pm-store{font-size:2.3cqw;font-weight:800;color:#fff;margin-top:2cqw;letter-spacing:-.02em}
      .cover .pm-store small{display:block;font-size:1.25cqw;font-weight:600;color:rgba(255,255,255,.7);margin-top:.5cqw}</style>`;
    return tpl.html.replace("</head>", `${css}</head>`);
  }, [tpl]);

  useEffect(() => {
    const f = frame.current;
    if (!f || !srcDoc) return;
    const paint = () => {
      const w = f.contentWindow as (Window & { apply?: (k: string) => void }) | null;
      const d = f.contentDocument;
      if (!w || !d) return;
      try { w.apply?.(CAMPUS_KEY[campus] ?? "kbu"); } catch { /* 양식에 apply 가 없으면 상권 전환 없이 */ }
      const cover = d.querySelector(".cover");
      if (!cover) return;
      const h2 = cover.querySelector("h2");
      if (h2 && title.trim()) h2.innerHTML = toHtml(title.trim());
      let st = cover.querySelector(".pm-store") as HTMLElement | null;
      if (storeName.trim()) {
        if (!st) { st = d.createElement("div"); st.className = "pm-store"; h2?.after(st); }
        st.innerHTML = `${toHtml(storeName.trim())} 사장님께 드리는 제안${pick ? `<small>${toHtml(pick.a)}</small>` : ""}`;
      } else st?.remove();
    };
    if (f.contentDocument?.readyState === "complete" && f.contentDocument.querySelector(".cover")) paint();
    f.onload = paint;
  }, [srcDoc, campus, title, storeName, pick]);

  // PDF — 양식에 이미 있는 인쇄 설정(@page 1280×720, 한 장씩 끊기)을 그대로 쓴다. 이미지로 뜨면 첫 장에서 멈췄고(1012),
  // 인쇄로 만들면 글자가 벡터라 더 선명하다. 파일 이름은 문서 제목으로 잡힌다.
  function download() {
    const w = frame.current?.contentWindow;
    const d = frame.current?.contentDocument;
    if (!w || !d) return;
    const safe = (storeName.trim() || "매장").replace(/[\\/:*?"<>|]/g, "");
    d.title = `우주라이크_제안서_${safe}_${campus}`;
    const prev = document.title;
    document.title = d.title;
    w.focus();
    w.print();
    setTimeout(() => { document.title = prev; }, 1500);
  }

  async function upload(f: File) {
    setBusy("양식 올리는 중…"); setErr(null);
    try {
      const html = await f.text();
      if (!html.includes('class="ms') || !html.includes("cover")) throw new Error("파트너 제안서 6P 양식이 아닌 것 같습니다(.ms · .cover 없음).");
      const r = await fetch("/api/proposal/6p", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { html, name: f.name, version: new Date().toISOString().slice(0, 10) } }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
      setTpl({ html, name: f.name, version: new Date().toISOString().slice(0, 10) });
    } catch (e) { setErr(`양식을 올리지 못했습니다 — ${(e as Error).message}`); } finally { setBusy(null); }
  }

  const inputCls = "w-full rounded-lg border border-black/10 px-2.5 py-1.5 bg-white text-[13px]";
  return (
    <SlideOver open={open} onClose={onClose} title="제안서 만들기" subtitle={tpl ? `파트너 제안서 6P · 양식 ${tpl.version ?? ""}` : "파트너 제안서 6P"} width="lg"
      footer={
        <div className="flex items-center gap-2 w-full">
          {isAdmin && <><input ref={file} type="file" accept=".html,text/html" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            <Button icon={<IconUpload size={15} />} onClick={() => file.current?.click()} disabled={!!busy}>양식 바꾸기</Button></>}
          <span className="flex-1 text-[12px] text-gray-500 text-right">{busy}</span>
          <Button variant="primary" icon={<IconDownload size={16} />} disabled={!tpl || !storeName.trim() || !!busy} onClick={download}>PDF 받기</Button>
        </div>
      }>
      <div className="space-y-4 text-[13px]">
        {err && <Notice tone="red" title={err} />}
        {tpl === null && <Notice tone="amber" title="제안서 양식이 아직 올라와 있지 않습니다">{isAdmin ? "아래 「양식 바꾸기」로 CGC/01_계약_영업/0911_제안서_6P/우주라이크_파트너_제안서_6P.html 을 올려 주세요." : "관리자에게 양식을 올려 달라고 해 주세요."}</Notice>}

        <section>
          <p className="font-bold text-gray-900 mb-1.5">① 매장 찾기 <span className="font-normal text-gray-400">· 허블 매장명(인허가 상호)이 공식 이름입니다</span></p>
          <div className="flex gap-1.5 mb-2">
            {Object.keys(CAMPUS_KEY).map((c) => <button key={c} type="button" onClick={() => { setCampus(c); setPick(null); }} className={`px-3 py-1 rounded-full border text-[12px] font-semibold ${campus === c ? "bg-navy text-white border-navy" : "border-black/10 text-gray-600"}`}>{c}</button>)}
          </div>
          <div className="relative">
            <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={stores === null ? "허블 매장을 불러오는 중…" : `${campus} 상권 매장 이름`} className={`${inputCls} pl-8`} aria-label="매장 찾기" />
          </div>
          {q.trim() && (
            <ul className="mt-1.5 max-h-56 overflow-auto rounded-lg border border-black/[0.08] divide-y divide-black/[0.05]">
              {found.length === 0 && <li className="px-3 py-2 text-gray-400">{stores?.length ? "허블에 없는 이름입니다 — 아래 칸에 직접 적어도 됩니다." : "이 상권의 허블 데이터를 읽지 못했습니다."}</li>}
              {found.map((s) => (
                <li key={s.id}><button type="button" onClick={() => choose(s)} className="w-full text-left px-3 py-1.5 hover:bg-navy/[0.04]">
                  <b className="text-gray-900">{s.n}</b> <span className="text-[11.5px] text-gray-500">{s.c || KIND_LABEL[s.k]} · {s.gn ? `${s.gn} ` : ""}{s.d}m</span>
                  <span className="block text-[11px] text-gray-400 truncate">{s.a}</span></button></li>))}
            </ul>
          )}
          {pick && <p className="mt-1.5 text-[12px] text-green-800 bg-green-50 rounded-lg px-2.5 py-1.5">허블 매장 — <b>{pick.n}</b> · {pick.a}</p>}
        </section>

        <section className="grid gap-2">
          <p className="font-bold text-gray-900">② 표지</p>
          <label className="block"><span className="text-[11.5px] font-semibold text-gray-500">매장 이름 (표지에 「○○ 사장님께 드리는 제안」으로)</span>
            <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="허블에서 고르면 채워집니다" className={inputCls} /></label>
          <label className="block"><span className="text-[11.5px] font-semibold text-gray-500">표지 제목 (줄바꿈 그대로 · <code>*강조*</code> 는 연보라)</span>
            <textarea rows={2} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={"사장님 가게를\n*경북대* 학생들의 *단골집*으로"} className={inputCls} /></label>
        </section>

        <section>
          <p className="font-bold text-gray-900 mb-1.5">③ 미리 보기 <span className="font-normal text-gray-400">· 6장 그대로 PDF 로</span></p>
          <div className="rounded-xl border border-black/[0.08] overflow-hidden bg-[#eef0f7]" style={{ height: 300 }}>
            {srcDoc ? (
              <div style={{ width: 1280, transform: "scale(0.42)", transformOrigin: "0 0" }}>
                <iframe ref={frame} title="제안서 미리보기" srcDoc={srcDoc} style={{ width: 1280, height: 714, border: 0, background: "#fff" }} />
              </div>
            ) : <p className="p-4 text-gray-400">{tpl === undefined ? "양식을 불러오는 중…" : "양식이 없습니다."}</p>}
          </div>
          <p className="text-[12px] text-navy bg-navy/[0.05] rounded-lg px-2.5 py-1.5 mt-1.5">「PDF 받기」 → 인쇄 창에서 대상을 <b>PDF로 저장</b>으로 두고 저장하세요. 크기 · 여백은 양식이 정해 둡니다(1280×720, 6장).</p>
          <p className="text-[11.5px] text-gray-400 mt-1">표지만 바뀝니다. 요금 · 실적 숫자는 양식(9/15판) 그대로입니다 — 구독 개편 v2 는 다음 학기 적용이라 이번 학기 제안서는 이 판을 씁니다.</p>
        </section>
      </div>
    </SlideOver>
  );
}
