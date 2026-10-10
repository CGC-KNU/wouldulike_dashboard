"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconX, IconArrowLeft, IconCopy, IconExternalLink, IconPhone, IconPlus } from "@tabler/icons-react";
import {
  GRADE_COLOR, KIND_LABEL, finalGrade, isNew, kakaoSearch, matchTies, naverSearch, normName, shortCampus, years,
  type LeadRow, type PartnerRow, type Tie,
  type CampusItem, type CampusesDoc, type Grade, type Obs, type ObsDoc, type Store, type StoresDoc,
} from "@/lib/hubble";
import { Notice, Skeleton } from "../_shared/ui";
import { openMap, type Engine } from "./mapEngine";

/**
 * 허블 · 지도 (1010, 명세 CGC/04_사내툴_개발/07_hubble/허블_UI명세.html A절).
 *
 * 첫 화면 = 대한민국 지도. 정문 1km 안 영업 중 식당 · 카페 · 주점이 100곳 이상인 4년제 대학가가 점으로 뜬다.
 * 점을 누르면 그 상권으로 날아가 1km 원 · 매장 마커가 깔리고 오른쪽 서랍에 목록 · 특이사항 · 적합도가 열린다.
 * 바탕지도는 카카오맵(NEXT_PUBLIC_KAKAO_JS_KEY, 1011) — 키가 없거나 도메인이 등록 안 됐으면 OpenStreetMap 으로 연다(mapEngine.ts).
 * 매장 원장은 공공 인허가, 평점 · 리뷰 · 메뉴는 카카오맵 · 네이버지도 링크로만 연다(약관상 저장 금지).
 */
type Doc<T> = { data: T | null; updated_at: string | null };
const REGIONS: { key: string; label: string; sido: string[] }[] = [
  { key: "all", label: "전국", sido: [] },
  { key: "cap", label: "수도권", sido: ["서울특별시", "인천광역시", "경기도"] },
  { key: "tk", label: "대구 · 경북", sido: ["대구광역시", "경상북도"] },
  { key: "pk", label: "부산 · 울산 · 경남", sido: ["부산광역시", "울산광역시", "경상남도"] },
  { key: "cc", label: "충청 · 세종 · 대전", sido: ["대전광역시", "세종특별자치시", "충청북도", "충청남도"] },
  { key: "hn", label: "호남", sido: ["광주광역시", "전북특별자치도", "전라남도", "전남광주통합특별시"] },
  { key: "gw", label: "강원", sido: ["강원특별자치도"] },
  { key: "jj", label: "제주", sido: ["제주특별자치도"] },
];
const SIZE = [{ key: 0, label: "전체" }, { key: 200, label: "200+" }, { key: 500, label: "500+" }, { key: 1000, label: "1000+" }];

async function getDoc<T>(key: string): Promise<Doc<T>> {
  const r = await fetch(`/api/hubble/${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `불러오지 못했습니다 (${r.status})`);
  return r.json();
}

export default function HubbleMap({ actor, onOpenLead }: { actor: string; onOpenLead?: () => void }) {
  const [meta, setMeta] = useState<CampusesDoc | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [region, setRegion] = useState("all");
  const [minN, setMinN] = useState(0);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<CampusItem | null>(null);
  const [stores, setStores] = useState<StoresDoc | null>(null);
  const [obs, setObs] = useState<Doc<ObsDoc> | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [astro, setAstro] = useState<{ partners: PartnerRow[]; leads: LeadRow[] }>({ partners: [], leads: [] });

  // 이미 파트너 · 후보 표시(1011) — ASTRO 목록을 한 번 받아 상권 매장과 이름으로 맞춘다
  const loadAstro = useCallback(() => {
    Promise.all([fetch("/api/astro/stores").then((r) => r.json()).catch(() => ({})), fetch("/api/astro/leads").then((r) => r.json()).catch(() => ({}))])
      .then(([st, ld]) => setAstro({ partners: st.stores ?? [], leads: ld.leads ?? [] }));
  }, []);
  useEffect(loadAstro, [loadAstro]);
  const ties = useMemo<Record<string, Tie>>(() => (stores && sel ? matchTies(stores.stores, astro.partners, astro.leads, shortCampus(sel)) : {}), [stores, sel, astro]);

  useEffect(() => { getDoc<CampusesDoc>("campuses").then((d) => setMeta(d.data)).catch((e) => { setErr(String(e.message ?? e)); setMeta(null); }); }, []);

  const visible = useMemo(() => {
    const r = REGIONS.find((x) => x.key === region)!;
    return (meta?.items ?? []).filter((c) => !c.below && c.n >= minN && (r.sido.length === 0 || r.sido.includes(c.sido)));
  }, [meta, region, minN]);

  // 지도 만들기 — 한 번
  useEffect(() => {
    let dead = false;
    (async () => {
      if (!mapEl.current || map.current) return;
      const { engine, note } = await openMap(mapEl.current);
      if (dead) { engine.destroy(); return; }
      map.current = engine; setMapNote(note); setReady(true);
    })();
    return () => { dead = true; map.current?.destroy(); map.current = null; };
  }, []);

  // 대학가 점
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.clear("campus");
    for (const c of visible) {
      const r = c.n >= 1000 ? 9 : c.n >= 500 ? 7 : c.n >= 200 ? 5.5 : 4.5;
      const on = sel?.key === c.key;
      m.dot("campus", c.y, c.x, { r, stroke: "#060073", weight: on ? 3 : 1.6, fill: on ? "#060073" : "#ffffff",
        title: `${c.name}${c.branch !== "본교" ? ` ${c.branch}` : ""} · 식당 ${c.n.toLocaleString()} · 적합 S·A ${c.sa}`, onClick: () => pick(c) });
    }
  }, [visible, sel?.key, meta, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = useCallback(async (c: CampusItem) => {
    setSel(c); setStoreId(null); setStores(null); setObs(null);
    map.current?.view(c.y, c.x, 15, true);
    try {
      const [s, o] = await Promise.all([getDoc<StoresDoc>(`c:${c.key}`), getDoc<ObsDoc>(`o:${c.key}`)]);
      setStores(s.data); setObs(o);
    } catch (e) { setErr(String((e as Error).message)); }
  }, []);

  // 상권 매장 · 1km 원
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.clear("store");
    if (!sel) return;
    // 문마다 1km — 경북대처럼 정문 · 북문 · 서문이 따로 상권이면 원 여러 개가 겹친다(1011 정문 보정)
    const gates = sel.gates?.length ? sel.gates : [{ n: "대표 좌표", y: sel.y, x: sel.x }];
    for (const g of gates) m.ring("store", g.y, g.x, 1000, gates.length > 1 ? 0.035 : 0.06);
    for (const s of stores?.stores ?? []) {
      const f = finalGrade(s, obs?.data?.obs?.[s.id]);
      const on = s.id === storeId;
      const t = ties[s.id];
      m.dot("store", s.y, s.x, { r: on ? 8 : t ? 6 : f.g === "S" ? 5 : 4, stroke: on ? "#FF6A3D" : GRADE_COLOR[f.g], weight: on ? 3 : 2,
        fill: t?.kind === "partner" ? PARTNER_FILL : t ? LEAD_FILL : "#fff", title: `${s.n} · ${f.g}${t ? ` · ${t.kind === "partner" ? "파트너" : `후보(${t.stage})`}` : ""}`, onClick: () => setStoreId(s.id) });
    }
    for (const g of gates) m.dot("store", g.y, g.x, { r: 6, stroke: "#fff", weight: 2, fill: "#060073", title: g.n, label: gates.length > 1 ? g.n : undefined });
  }, [sel, stores, obs, storeId, ready, ties]);

  // 매장 고르면 그 자리로
  useEffect(() => {
    const s = stores?.stores.find((x) => x.id === storeId);
    if (s) map.current?.pan(s.y, s.x);
  }, [storeId, stores]);

  async function saveObs(id: string, o: Obs | null) {
    const cur = obs?.data ?? { obs: {} };
    const next: ObsDoc = { ...cur, obs: { ...cur.obs } };
    if (o) next.obs[id] = { ...o, by: actor, at: new Date().toISOString() }; else delete next.obs[id];
    const r = await fetch(`/api/hubble/${encodeURIComponent(`o:${sel!.key}`)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, base_updated_at: obs?.updated_at ?? null }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409) { setErr("그사이 다른 사람이 고쳤습니다. 최신으로 다시 불러왔습니다."); setObs(await getDoc<ObsDoc>(`o:${sel!.key}`)); return false; }
    if (!r.ok) { setErr(d.detail ?? "저장하지 못했습니다."); return false; }
    setObs({ data: d.data, updated_at: d.updated_at });
    return true;
  }

  const hits = useMemo(() => {
    const k = normName(q);
    if (!k) return { campuses: [] as CampusItem[], stores: [] as Store[], below: [] as CampusItem[] };
    const all = meta?.items ?? [];
    return {
      campuses: all.filter((c) => !c.below && normName(c.name + c.branch + c.sido).includes(k)).slice(0, 6),
      below: all.filter((c) => c.below && normName(c.name).includes(k)).slice(0, 3),
      stores: (stores?.stores ?? []).filter((s) => normName(s.n).includes(k)).slice(0, 6),
    };
  }, [q, meta, stores]);

  const total = visible.reduce((a, c) => a + c.n, 0), totalSA = visible.reduce((a, c) => a + c.sa, 0);
  const store = stores?.stores.find((x) => x.id === storeId) ?? null;

  return (
    <div className="relative -mx-4 sm:-mx-6 -mt-2 rounded-2xl overflow-hidden border border-black/[0.06]" style={{ height: "calc(100vh - 150px)", minHeight: 560 }}>
      <div ref={mapEl} className="absolute inset-0 bg-[#DCE7F2]" aria-label="대한민국 지도 — 대학가" />

      {/* 검색 카드 */}
      <div className="absolute left-3 top-3 z-[500] w-[min(340px,calc(100%-24px))] rounded-xl bg-white border border-black/[0.08] shadow-lg p-3 text-[12.5px]">
        <div className="flex items-center gap-2 rounded-lg border-[1.5px] border-navy px-2.5 py-1.5">
          <IconSearch size={15} className="text-gray-400" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={sel ? `대학가 · ${sel.name} 매장 이름` : "대학가 이름 (상권을 고르면 매장도)"} aria-label="허블 검색"
            className="flex-1 bg-transparent outline-none text-[13px] text-gray-900" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="검색어 지우기"><IconX size={14} className="text-gray-400" /></button>}
        </div>
        {q && (
          <div className="mt-2 max-h-72 overflow-auto">
            {hits.campuses.length + hits.stores.length + hits.below.length === 0 && <p className="text-gray-500 py-2">찾는 곳이 없습니다 — 4년제 대학가와 고른 상권의 매장만 찾습니다.</p>}
            {hits.campuses.length > 0 && <p className="text-[10.5px] font-bold text-gray-400 mt-1">대학가</p>}
            {hits.campuses.map((c) => (
              <button key={c.key} type="button" onClick={() => { setQ(""); pick(c); }} className="w-full text-left flex justify-between gap-2 py-1.5 px-1 rounded hover:bg-navy/[0.05]">
                <span><b className="text-gray-900">{c.name}</b> <span className="text-gray-400">{c.branch !== "본교" ? c.branch : ""} · {c.sido.replace(/특별자치|광역|특별/g, "")}</span></span>
                <span className="tabular-nums text-gray-500">{c.n.toLocaleString()}</span>
              </button>
            ))}
            {hits.below.map((c) => (
              <div key={c.key} className="flex justify-between gap-2 py-1.5 px-1 text-gray-400" title="정문 1km 안 영업 중 식당 · 카페 · 주점이 100곳 미만이라 파트너 상권에서 뺐습니다">
                <span>{c.name} {c.branch !== "본교" ? c.branch : ""}</span><span>기준 미달(식당 {c.n}곳)</span>
              </div>
            ))}
            {hits.stores.length > 0 && <p className="text-[10.5px] font-bold text-gray-400 mt-2">매장 · {sel?.name}</p>}
            {hits.stores.map((s) => (
              <button key={s.id} type="button" onClick={() => { setQ(""); setStoreId(s.id); }} className="w-full text-left flex justify-between gap-2 py-1.5 px-1 rounded hover:bg-navy/[0.05]">
                <span><b className="text-gray-900">{s.n}</b> <span className="text-gray-400">{s.c || KIND_LABEL[s.k]} · {s.d}m</span></span>
                <GradeChip g={finalGrade(s, obs?.data?.obs?.[s.id]).g} />
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {REGIONS.map((r) => <button key={r.key} type="button" onClick={() => setRegion(r.key)} className={chip(region === r.key)}>{r.label}</button>)}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {SIZE.map((s) => <button key={s.key} type="button" onClick={() => setMinN(s.key)} className={chip(minN === s.key)}>식당 {s.label}</button>)}
        </div>
        <p className="mt-2 pt-2 border-t border-black/[0.06] text-gray-600">
          {meta === undefined ? "불러오는 중…" : meta ? <><b>파트너 상권 {visible.length}곳</b> · 기준 미달 {(meta.items.filter((c) => c.below)).length}곳 제외<br /><span className="text-[11px] text-gray-400">매장 데이터 {meta.built_at} 기준 · 행안부 인허가</span></> : "데이터가 아직 없습니다"}
        </p>
      </div>

      {/* 요약 띠 */}
      {meta && !sel && (
        <div className="absolute right-14 top-3 z-[500] hidden md:flex rounded-xl bg-white border border-black/[0.08] shadow-lg text-[11px]">
          {[["대학가", visible.length], ["영업 중 식당", total], ["적합 S·A", totalSA]].map(([k, v]) => (
            <div key={k as string} className="px-3 py-1.5 border-r last:border-0 border-black/[0.06]"><span className="block text-gray-400">{k}</span><b className="text-[15px] tabular-nums text-gray-900">{(v as number).toLocaleString()}</b></div>
          ))}
        </div>
      )}

      {/* 범례 */}
      <div className="absolute left-3 bottom-6 z-[500] rounded-lg bg-white border border-black/[0.08] px-2.5 py-1.5 text-[11px] text-gray-600 shadow">
        {sel ? <>테두리 = 적합도 {(["S", "A", "B", "C"] as Grade[]).map((g) => <span key={g} className="inline-flex items-center gap-0.5 ml-1.5"><i className="inline-block w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: GRADE_COLOR[g] }} />{g}</span>)}
          <span className="inline-flex items-center gap-0.5 ml-2.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PARTNER_FILL }} />파트너</span>
          <span className="inline-flex items-center gap-0.5 ml-1.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: LEAD_FILL }} />후보</span></> : <>점 크기 = 정문 1km 식당 수 (200 · 500 · 1000+)</>}
        {mapNote && <span className="block text-[10.5px] text-amber-700 mt-0.5">{mapNote}</span>}
      </div>

      {err && <div className="absolute left-1/2 -translate-x-1/2 top-3 z-[600] max-w-md"><Notice tone="red" title={err}><button type="button" className="underline" onClick={() => setErr(null)}>닫기</button></Notice></div>}

      {/* 오른쪽 서랍 */}
      {sel && (
        <aside className="absolute right-0 top-0 bottom-0 z-[550] w-[min(400px,100%)] bg-white border-l border-black/[0.08] shadow-xl flex flex-col" aria-label="상권">
          {store ? (
            <StorePanel s={store} campus={sel} tie={ties[store.id]} onAdded={loadAstro} obs={obs?.data?.obs?.[store.id]} actor={actor} onBack={() => setStoreId(null)} onSave={(o) => saveObs(store.id, o)} onOpenLead={onOpenLead} />
          ) : (
            <CampusPanel c={sel} doc={stores} ties={ties} obs={obs?.data?.obs ?? {}} onClose={() => { setSel(null); setStores(null); map.current?.view(36.2, 127.9, 7, true); }} onPick={setStoreId} />
          )}
        </aside>
      )}
    </div>
  );
}

const PARTNER_FILL = "#060073", LEAD_FILL = "#F2A93B";

function TieChip({ t }: { t?: Tie }) {
  if (!t) return null;
  return t.kind === "partner"
    ? <span className="shrink-0 px-1.5 h-[18px] inline-flex items-center rounded text-[10.5px] font-bold text-white" style={{ background: PARTNER_FILL }}>파트너</span>
    : <span className="shrink-0 px-1.5 h-[18px] inline-flex items-center rounded text-[10.5px] font-bold text-[#5A3A00]" style={{ background: LEAD_FILL }}>후보 · {t.stage}</span>;
}

const chip = (on: boolean) => `px-2 py-0.5 rounded-full border text-[11px] ${on ? "bg-navy text-white border-navy" : "border-black/10 text-gray-600 bg-white hover:border-navy/40"}`;

function GradeChip({ g }: { g: Grade }) {
  return <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded text-[10.5px] font-extrabold" style={{ background: GRADE_COLOR[g], color: g === "C" ? "#3A3D4A" : "#fff" }}>{g}</span>;
}

type Sort = "fit" | "dist" | "age";
function CampusPanel({ c, doc, ties, obs, onClose, onPick }: { c: CampusItem; doc: StoresDoc | null; ties: Record<string, Tie>; obs: Record<string, Obs>; onClose: () => void; onPick: (id: string) => void }) {
  const [tab, setTab] = useState<"list" | "notes" | "fit">("list");
  const [sort, setSort] = useState<Sort>("fit");
  const [kind, setKind] = useState<"all" | Store["k"]>("all");
  const [hideChain, setHideChain] = useState(true);
  const [tieView, setTieView] = useState<"all" | "hide" | "only">("all");
  const [limit, setLimit] = useState(60);
  const rows = useMemo(() => {
    const list = (doc?.stores ?? []).filter((s) => (kind === "all" || s.k === kind) && (!hideChain || !s.ch || ties[s.id]?.kind === "partner") && (tieView === "all" || (tieView === "hide" ? !ties[s.id] : !!ties[s.id]))).map((s) => ({ s, f: finalGrade(s, obs[s.id]) }));
    list.sort((a, b) => sort === "fit" ? b.f.sc - a.f.sc || a.s.d - b.s.d : sort === "dist" ? a.s.d - b.s.d : (years(a.s.o) ?? 99) - (years(b.s.o) ?? 99));
    return list;
  }, [doc, obs, sort, kind, hideChain, ties, tieView]);
  const nPartner = Object.values(ties).filter((t) => t.kind === "partner").length, nLead = Object.values(ties).length - nPartner;
  const dist = useMemo(() => {
    const m: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0 };
    for (const s of doc?.stores ?? []) m[finalGrade(s, obs[s.id]).g]++;
    return m;
  }, [doc, obs]);
  const chains = (doc?.stores ?? []).filter((s) => s.ch).length;
  const fresh = (doc?.stores ?? []).filter((s) => isNew(s.o)).length;
  const lanes = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of doc?.stores ?? []) { const road = (s.a.match(/([가-힣0-9]+(?:로|길))\s/) ?? [])[1]; if (road) m.set(road, (m.get(road) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [doc]);

  return (
    <>
      <div className="p-4 border-b border-black/[0.06]">
        <div className="flex justify-between items-start gap-2">
          <div><h2 className="text-[17px] font-extrabold text-gray-900">{c.name} {c.branch !== "본교" && <span className="text-[13px] font-semibold text-gray-500">{c.branch}</span>}</h2>
            <p className="text-[11.5px] text-gray-500">{c.addr} · {c.gate === "manual" && c.gates?.length ? `${c.gates.map((g) => g.n).join(" · ")}에서 각 1km` : "대표 좌표 기준 1km (정문 보정 전)"}</p></div>
          <button type="button" onClick={onClose} aria-label="상권 닫기" className="p-1 rounded hover:bg-black/5"><IconX size={18} /></button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-3 text-[11px]">
          {[["영업 중", c.n], ["적합 S·A", (dist.S + dist.A)], ["이미 파트너", nPartner], ["후보", nLead]].map(([k, v]) => <div key={k as string} className="rounded-lg bg-black/[0.03] px-2 py-1.5"><span className="block text-gray-400">{k}</span><b className="text-[15px] tabular-nums text-gray-900">{(v as number).toLocaleString()}</b></div>)}
        </div>
        <div className="flex gap-4 mt-3 text-[12.5px] border-b border-black/[0.06]" role="tablist">
          {([["list", "매장"], ["notes", "특이사항"], ["fit", "적합도"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`pb-1.5 ${tab === k ? "text-navy font-bold border-b-2 border-navy" : "text-gray-400"}`}>{l}</button>)}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 text-[12.5px]">
        {!doc ? <Skeleton rows={8} cols={2} /> : tab === "list" ? (
          <>
            <div className="flex flex-wrap gap-1 mb-2">
              {([["fit", "적합도순"], ["dist", "가까운 순"], ["age", "새 매장 순"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setSort(k)} className={chip(sort === k)}>{l}</button>)}
              <span className="w-1" />
              {([["all", "전체"], ["일", "음식점"], ["휴", "카페 · 분식"], ["제", "제과"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>{l}</button>)}
              <button type="button" onClick={() => setHideChain((v) => !v)} className={chip(hideChain)}>프랜차이즈 숨김</button>
              <button type="button" onClick={() => setTieView((v) => v === "all" ? "hide" : v === "hide" ? "only" : "all")} className={chip(tieView !== "all")}>{tieView === "hide" ? "파트너 · 후보 숨김" : tieView === "only" ? "파트너 · 후보만" : "파트너 · 후보 포함"}</button>
            </div>
            <ul>
              {rows.slice(0, limit).map(({ s, f }) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onPick(s.id)} className="w-full text-left flex justify-between items-center gap-2 py-2 border-b border-black/[0.05] hover:bg-navy/[0.03]">
                    <span className="min-w-0"><b className="text-gray-900">{s.n}</b>
                      <span className="block text-[11px] text-gray-400 truncate">{s.c || KIND_LABEL[s.k]} · {s.gn ? `${s.gn} ` : ""}{s.d}m · {isNew(s.o) ? "NEW" : years(s.o) !== null ? `${years(s.o)}년` : "—"}{s.ch ? ` · ${s.ch}` : ""}{obs[s.id]?.grade ? " · 팀 관찰" : ""}</span></span>
                    <span className="flex items-center gap-1"><TieChip t={ties[s.id]} /><GradeChip g={f.g} /></span>
                  </button>
                </li>
              ))}
            </ul>
            {rows.length > limit && <button type="button" onClick={() => setLimit((l) => l + 60)} className="w-full mt-2 py-2 rounded-lg border border-black/10 text-gray-600">더 보기 ({(rows.length - limit).toLocaleString()}곳 남음)</button>}
            {rows.length === 0 && <p className="text-gray-500 py-4">조건에 맞는 매장이 없습니다.</p>}
          </>
        ) : tab === "notes" ? (
          <ul className="space-y-2 text-gray-700">
            <li>업종: {Object.entries(c.kinds).map(([k, v]) => `${k} ${v}`).join(" · ")}</li>
            <li>이미 파트너 {nPartner}곳 · 후보 {nLead}곳 (ASTRO 매장 · 후보 이름 대조 — 지점 꼬리에 캠퍼스가 있으면 그 상권만)</li>
            <li>90일 안 새로 연 곳: {fresh}곳 · 프랜차이즈(이름 대조): {chains}곳 ({Math.round((chains / Math.max(1, c.n)) * 100)}%)</li>
            <li>매장이 몰린 길: {lanes.map(([r, n]) => `${r} ${n}`).join(" · ") || "—"}</li>
            <li className="text-[11.5px] text-gray-400 pt-2">팀 메모 · 상권 메모는 다음 업데이트(이번 주 변동 탭과 함께).</li>
          </ul>
        ) : (
          <div>
            {(["S", "A", "B", "C"] as Grade[]).map((g) => {
              const max = Math.max(1, ...Object.values(dist));
              return <div key={g} className="flex items-center gap-2 py-1"><GradeChip g={g} /><span className="flex-1 h-3 rounded bg-black/[0.04] overflow-hidden"><i className="block h-full rounded" style={{ width: `${(dist[g] / max) * 100}%`, background: GRADE_COLOR[g] }} /></span><b className="w-12 text-right tabular-nums">{dist[g].toLocaleString()}</b></div>;
            })}
            <p className="text-[11.5px] text-gray-500 mt-3 leading-relaxed">{doc.fit_version >= 2 ? <>산식 v2 — 골목 집적도 35 · 문까지 거리 25 · 일반음식점 5 · 독립점 5 · 90일 신규 5. 경북대 · 계명대 · 영남대 현 파트너 54곳으로 재서 정함(맞히는 정도 AUC 0.59 → 0.80). 팀 관찰 등급을 매기면 최대 25점이 더해집니다. 평점 · 리뷰는 약관상 넣지 않습니다.</> : <>산식 v1(검증 전) — 독립점 20 · 골목 집적도 15 · 업력 10 · 정문 거리 15 · 90일 신규 8. 팀 관찰 등급을 매기면 최대 25점이 더해집니다.</>}</p>
          </div>
        )}
      </div>
    </>
  );
}

type Similar = { kind: "lead" | "store"; id: string | number; name: string; stage?: string; owner?: string | null; campus?: string; address?: string; why: string };
type AddState = null | "check" | { similar: Similar[] } | { blocked: { name: string; stage: string; owner: string | null } } | { done: "created" | "linked" } | { error: string };

function StorePanel({ s, campus, tie, onAdded, obs, actor, onBack, onSave, onOpenLead }: { s: Store; campus: CampusItem; tie?: Tie; onAdded: () => void; obs?: Obs; actor: string; onBack: () => void; onSave: (o: Obs | null) => Promise<boolean>; onOpenLead?: () => void }) {
  const [tab, setTab] = useState<"info" | "fit" | "obs">("info");
  const [o, setO] = useState<Obs>(obs ?? {});
  const [saving, setSaving] = useState(false);
  const [add, setAdd] = useState<AddState>(null);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setO(obs ?? {}); setAdd(null); setReason(""); }, [s.id, obs]);
  const f = finalGrade(s, obs);
  const y = years(s.o);
  const fitRows: [string, string, string][] = [
    ...(s.p.kind !== undefined ? [
      // v2(1011) — 현 파트너 54곳으로 검증: 집적도 · 거리가 가장 잘 맞음
      ["골목 집적도", `반경 약 50m 안 ${s.dn}곳`, `${s.p.dense}/35`],
      ["문까지 거리", `${s.gn ? `${s.gn} ` : ""}${s.d}m`, `${s.p.dist}/25`],
      ["일반음식점", s.k === "일" ? "예" : KIND_LABEL[s.k], `${s.p.kind}/5`],
      ["독립점", s.ch ? `아님 — ${s.ch}` : "예", `${s.p.indep}/5`],
      ["90일 신규", isNew(s.o) ? "예" : "아님", `${s.p.new}/5`],
    ] as [string, string, string][] : [
      ["독립점", s.ch ? `아님 — ${s.ch}` : "예", `${s.p.indep}/20`],
      ["골목 집적도", `반경 약 50m 안 ${s.dn}곳`, `${s.p.dense}/15`],
      ["업력", s.o ? `${s.o.slice(0, 10)} 인허가${y !== null ? ` · ${y}년` : ""}` : "—", `${s.p.age ?? 0}/10`],
      ["정문 거리", `${s.gn ? `${s.gn} ` : ""}${s.d}m`, `${s.p.dist}/15`],
      ["90일 신규", isNew(s.o) ? "예" : "아님", `${s.p.new}/8`],
    ] as [string, string, string][]),
    ["팀 관찰", obs?.grade ? `${obs.grade} · ${obs.by ?? ""} 「${obs.why ?? ""}」` : "아직", obs?.grade ? `+${{ S: 25, A: 18, B: 10, C: 0 }[obs.grade]}` : "—"],
  ];

  // 중복 판정은 백엔드가 한다(1011) — 같은 인허가 번호는 막고, 이름 · 전화가 비슷하면 목록을 돌려준다.
  async function addLead(extra: { reason?: string; link_lead_id?: string } = {}) {
    setAdd("check");
    try {
      const r = await fetch("/api/astro/leads/from-hubble", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        hubble_id: s.id, name: s.n, address: s.a, phone: s.t || "", campus: shortCampus(campus), district: `${campus.name} ${s.gn ?? "정문"} ${s.d}m`, category: s.c || KIND_LABEL[s.k],
        stage: "미컨택", owner: actor, grade: f.g === "S" || f.g === "A" ? "A" : f.g, score: f.sc,
        angle: `허블 적합 ${f.g} — ${fitRows.filter((x) => !x[2].startsWith("0") && x[2] !== "—").map((x) => x[0]).join(" · ")}`,
        memo: `허블에서 추가 · ${s.a} · 인허가 ${s.id}`, ...extra,
      }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { onAdded(); return setAdd({ done: d.linked ? "linked" : "created" }); }
      if (r.status === 409 && d.blocked) return setAdd({ blocked: d.blocked });
      if (r.status === 409 && d.similar) return setAdd({ similar: d.similar });
      setAdd({ error: d.detail ?? `후보를 만들지 못했습니다(${r.status}).` });
    } catch {
      setAdd({ error: "네트워크 오류로 후보를 만들지 못했습니다." });
    }
  }

  return (
    <>
      <div className="p-4 border-b border-black/[0.06]">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-navy"><IconArrowLeft size={14} /> {campus.name}</button>
        <div className="flex justify-between items-start gap-2 mt-1">
          <h2 className="text-[17px] font-extrabold text-gray-900">{s.n}</h2><span className="flex items-center gap-1"><TieChip t={tie} /><GradeChip g={f.g} /></span>
        </div>
        <p className="text-[11.5px] text-gray-500">{s.c || KIND_LABEL[s.k]} · {s.gn ?? "정문"} {s.d}m · {s.o ? `인허가 ${s.o.slice(0, 10)}` : ""} · 영업 중</p>
        <p className="text-[11.5px] text-gray-600 flex items-center gap-1 mt-0.5">{s.a}
          <button type="button" aria-label="주소 복사" onClick={async () => { await navigator.clipboard.writeText(s.a); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><IconCopy size={13} /></button>{copied && <span className="text-[10.5px] text-green-700">복사함</span>}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <a href={kakaoSearch(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-black/10 text-[12px] font-semibold hover:border-navy/40"><IconExternalLink size={13} /> 카카오맵</a>
          <a href={naverSearch(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-black/10 text-[12px] font-semibold hover:border-navy/40"><IconExternalLink size={13} /> 네이버지도</a>
          {s.t && <a href={`tel:${s.t}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-black/10 text-[12px] font-semibold"><IconPhone size={13} /> {s.t}</a>}
        </div>
        <p className="text-[10.5px] text-gray-400 mt-1.5">평점 · 리뷰 · 메뉴 · 영업시간은 카카오맵 · 네이버지도에서 봅니다(약관상 허블에 저장하지 않음).</p>
        <div className="flex gap-4 mt-3 text-[12.5px] border-b border-black/[0.06]" role="tablist">
          {([["info", "특이사항"], ["fit", "적합도"], ["obs", "팀 관찰"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`pb-1.5 ${tab === k ? "text-navy font-bold border-b-2 border-navy" : "text-gray-400"}`}>{l}</button>)}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 text-[12.5px] text-gray-700">
        {tab === "info" && (
          <ul className="space-y-1.5">
            <li>인허가 업종: {s.k === "일" ? "일반음식점" : s.k === "휴" ? "휴게음식점" : "제과점영업"} · {s.c || "—"}</li>
            <li>업력: {y !== null ? `${y}년` : "—"}{isNew(s.o) ? " · 90일 안 새로 엶" : ""}</li>
            <li>프랜차이즈: {s.ch ? `${s.ch} (이름 대조)` : "아님(이름 대조 기준)"}</li>
            <li>골목: 반경 약 50m 안 {s.dn}곳</li>
            <li className="text-[11px] text-gray-400 pt-1">인허가 관리번호 {s.id}</li>
          </ul>
        )}
        {tab === "fit" && (
          <table className="w-full text-[12px]"><tbody>
            {fitRows.map(([k, v, p]) => <tr key={k} className="border-b border-black/[0.05]"><td className="py-1.5 font-semibold w-20">{k}</td><td className="py-1.5">{v}</td><td className="py-1.5 text-right tabular-nums text-gray-500">{p}</td></tr>)}
            <tr><td className="pt-2 font-bold">합계</td><td /><td className="pt-2 text-right font-bold tabular-nums">{f.sc} → {f.g}</td></tr>
          </tbody></table>
        )}
        {tab === "obs" && (
          <div className="space-y-3">
            <div><p className="font-semibold mb-1">팀 관찰 등급 <span className="text-[11px] font-normal text-gray-400">(카카오맵 · 네이버지도 보고 매김)</span></p>
              <div className="flex gap-1">{(["S", "A", "B", "C"] as Grade[]).map((g) => <button key={g} type="button" onClick={() => setO({ ...o, grade: o.grade === g ? undefined : g })} className={`w-10 py-1 rounded-lg border text-[12px] font-bold ${o.grade === g ? "text-white" : "border-black/10"}`} style={o.grade === g ? { background: GRADE_COLOR[g], borderColor: GRADE_COLOR[g] } : undefined}>{g}</button>)}</div></div>
            <label className="block"><span className="font-semibold">이유 한 줄 {o.grade && <span className="text-red-600">*</span>}</span>
              <input value={o.why ?? ""} onChange={(e) => setO({ ...o, why: e.target.value })} placeholder="예: 점심 줄 김 · 리뷰 최근 활발" className="mt-1 w-full rounded-lg border border-black/10 px-2.5 py-1.5 bg-transparent" /></label>
            <div><p className="font-semibold mb-1">사장님</p><div className="flex gap-1">{(["마당발", "보통", "모름"] as const).map((m) => <button key={m} type="button" onClick={() => setO({ ...o, mood: m })} className={chip(o.mood === m)}>{m}</button>)}</div></div>
            <label className="block"><span className="font-semibold">메모</span><textarea rows={3} value={o.memo ?? ""} onChange={(e) => setO({ ...o, memo: e.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-2.5 py-1.5 bg-transparent" /></label>
            <div className="flex gap-2 items-center">
              <button type="button" disabled={saving || (!!o.grade && !o.why?.trim())} onClick={async () => { setSaving(true); await onSave(Object.keys(o).length ? o : null); setSaving(false); }} className="px-3 py-1.5 rounded-lg bg-navy text-white font-bold disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
              {obs?.at && <span className="text-[11px] text-gray-400">{obs.by} · {obs.at.slice(5, 16).replace("T", " ")}</span>}
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-black/[0.06]">
        {add && typeof add === "object" && "similar" in add ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-900 space-y-1.5">
            <p className="font-semibold">비슷한 곳이 있습니다 — 같은 가게면 새로 만들지 말고 잇기를 누르세요.</p>
            <ul className="space-y-1">{add.similar.map((d) => (
              <li key={`${d.kind}${d.id}`} className="flex items-center gap-2">
                <span className="flex-1 min-w-0"><b>{d.name}</b> · {d.kind === "store" ? `파트너 매장${d.campus ? ` · ${d.campus}` : ""}` : `후보 · ${d.stage}${d.owner ? ` · ${d.owner}` : ""}`}
                  <span className={`block text-[11px] ${d.why === "같은 자리" ? "text-red-700 font-semibold" : "text-amber-700"}`}>{d.why}{d.address ? ` · ${d.address}` : ""}</span></span>
                {d.kind === "lead" && <button type="button" onClick={() => addLead({ link_lead_id: String(d.id) })} className="shrink-0 px-2 py-0.5 rounded bg-white border border-amber-300 font-semibold">같은 가게 — 잇기</button>}
              </li>))}</ul>
            <div className="flex gap-1.5 pt-1">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="다른 가게인 이유(필수) — 예: 지점 다름" className="flex-1 min-w-0 rounded border border-amber-300 bg-white px-2 py-1 text-gray-800" />
              <button type="button" disabled={!reason.trim()} onClick={() => addLead({ reason: reason.trim() })} className="shrink-0 px-2.5 py-1 rounded bg-white border border-amber-300 font-semibold disabled:opacity-50">다른 가게 — 추가</button>
            </div>
            <div className="flex">{onOpenLead && <button type="button" onClick={onOpenLead} className="font-semibold underline">후보 탭 열기</button>}<button type="button" onClick={() => setAdd(null)} className="ml-auto text-amber-700">취소</button></div>
          </div>
        ) : add && typeof add === "object" && "blocked" in add ? (
          <div className="flex items-center justify-between gap-2 text-[12.5px] text-navy bg-[#060073]/[0.06] rounded-lg px-3 py-2">
            <span>이미 후보입니다 — <b>{add.blocked.name}</b> · {add.blocked.stage}{add.blocked.owner ? ` · 담당 ${add.blocked.owner}` : ""}</span>{onOpenLead && <button type="button" onClick={onOpenLead} className="shrink-0 underline font-semibold">그 후보 열기</button>}</div>
        ) : add && typeof add === "object" && "done" in add ? (
          <div className="flex items-center justify-between text-[12.5px] text-green-800 bg-green-50 rounded-lg px-3 py-2">{add.done === "linked" ? "기존 후보에 이었습니다" : `후보로 추가했습니다 (미컨택 · ${actor})`}{onOpenLead && <button type="button" onClick={onOpenLead} className="underline font-semibold">ASTRO에서 보기</button>}</div>
        ) : tie?.kind === "partner" ? (
          <div className="text-[12.5px] text-white rounded-lg px-3 py-2" style={{ background: PARTNER_FILL }}>이미 파트너입니다 — {tie.name} (매장 #{tie.rid})</div>
        ) : tie && add === null ? (
          <div className="flex items-center justify-between gap-2 text-[12.5px] text-[#5A3A00] rounded-lg px-3 py-2" style={{ background: "#FCEBCB" }}>
            <span>이미 후보입니다 — <b>{tie.name}</b> · {tie.stage}{tie.owner ? ` · 담당 ${tie.owner}` : ""}</span>{onOpenLead && <button type="button" onClick={onOpenLead} className="shrink-0 underline font-semibold">그 후보 열기</button>}</div>
        ) : (
          <>
            {add && typeof add === "object" && "error" in add && <p className="text-[12px] text-red-700 mb-1.5">{add.error}</p>}
            <button type="button" disabled={add === "check"} onClick={() => addLead()} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-navy text-white font-bold disabled:opacity-60"><IconPlus size={16} /> {add === "check" ? "확인 중…" : add && typeof add === "object" && "error" in add ? "다시 시도" : "파트너 후보로 추가"}</button>
          </>
        )}
      </div>
    </>
  );
}
