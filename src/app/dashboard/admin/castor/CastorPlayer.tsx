"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppGraph, CastorHealth, HotStatus, PlayerDoc } from "@/lib/castor/app";

/**
 * Castor · 눌러보기 (기획안 Castor 절 C2 시안 그대로, 1008).
 *
 * 지금 = 실제 앱 캡처 위에 누를 수 있는 영역. 누르면 다음 화면으로 가고, 그 동작에서 찍히는 이벤트가 오른쪽에 쌓인다.
 * 이벤트 상태는 문서에 적힌 값이 아니라 **GA4 최근 7일 · 앱 코드**로 다시 정한다 — 새로 심을 것 · 반응 없음만 문서 값을 따른다.
 * 바뀐 뒤 = 시안 화면(HTML)을 격리된 iframe 으로 띄운다. 눌림은 postMessage 로만 받는다.
 */
const LBL: Record<HotStatus, string> = { ok: "수집 중", miss: "여기선 0건", none: "정의 안 됨", new: "새로 심을 것", dead: "반응 없음" };
const W = 804, H = 1744; // 캡처 원본 크기 — 영역 좌표의 기준

interface LogLine { id: number; t: string; ev: string; st: HotStatus; what: string }
type Mode = "now" | "after";

export function useLiveStatus(health: CastorHealth | null | undefined, graph: AppGraph | null) {
  return useMemo(() => {
    const live = new Map((health?.ok ? health.events : []).map((e) => [e.name, e.d7]));
    const code = new Set((graph?.events ?? []).map((e) => e.name));
    const named = new Set((health?.ok ? health.screen_views : []).map((s) => s.screen));
    return (ev: string, st: HotStatus): HotStatus => {
      if (st === "new" || st === "dead" || !ev || ev === "—" || !health?.ok) return st;
      const base = ev.split("(")[0].trim();
      // screen_view 는 화면 이름이 붙어야 그 화면 것으로 셀 수 있다 — 이름 없이 찍히면 '정의 안 됨'
      if (base === "screen_view") { const nm = ev.match(/\(([^)]+)\)/)?.[1]; return !nm ? "none" : named.has(nm) ? "ok" : "miss"; }
      if ((live.get(base) ?? 0) > 0) return "ok";
      return code.has(base) ? "miss" : "none";
    };
  }, [health, graph]);
}

export default function CastorPlayer({ doc, health, graph, start, onScreen }: {
  doc: PlayerDoc; health: CastorHealth | null | undefined; graph: AppGraph | null;
  /** 지도에서 화면을 누르면 그 화면부터 — {mode, key} 가 바뀔 때마다 다시 시작 */
  start?: { mode: Mode; key: string; n: number } | null;
  onScreen?: (screenId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("now");
  const [cur, setCur] = useState<string>("home");
  const [trail, setTrail] = useState<string[]>(["home"]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [showHs, setShowHs] = useState(true);
  const [fx, setFx] = useState<{ i: number; kind: "blink" | "shake" } | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const seq = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const status = useLiveStatus(health, graph);

  const first = (m: Mode) => (m === "now" ? (doc.now.home ? "home" : Object.keys(doc.now)[0]) : (doc.after.coupon_arrived ? "coupon_arrived" : Object.keys(doc.after)[0]));

  const push = useCallback((ev: string, st: HotStatus, what: string) => {
    if (!ev || ev === "—") return;
    const d = new Date();
    setLog((l) => [{ id: ++seq.current, t: `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`, ev, st, what }, ...l].slice(0, 14));
  }, []);

  const go = useCallback((m: Mode, k: string, viaEv?: string) => {
    const sc = m === "now" ? doc.now[k] : doc.after[k];
    if (!sc) return;
    setCur(k); setTrail((t) => [...t, k].slice(-8)); setHot(null);
    if (m === "now") {
      const v = doc.now[k].view;
      if (v && v[0] !== viaEv) push(v[0], status(v[0], v[1]), `${sc.title} 열림`);
      onScreen?.(doc.now[k].screen);
    } else {
      push(`screen_view(${doc.after[k].sid})`, "new", `${sc.title} 열림`);
    }
  }, [doc, push, status, onScreen]);

  const reset = useCallback((m: Mode, k?: string) => {
    setMode(m); setLog([]); const key = k ?? first(m); setTrail([]); go(m, key);
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  // 처음 · 지도에서 넘어올 때
  useEffect(() => { if (start) reset(start.mode, start.key); else reset("now"); }, [start?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // 바뀐 뒤 — iframe 이 보내는 눌림
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { castor?: number };
      if (typeof d?.castor !== "number" || mode !== "after") return;
      const h = doc.after[cur]?.hs[d.castor];
      if (!h) return;
      push(h[2], h[3], h[4]);
      if (h[1] !== cur) go("after", h[1]); else frame.current?.contentWindow?.postMessage({ blink: d.castor }, "*");
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [mode, cur, doc, push, go]);
  useEffect(() => { frame.current?.contentWindow?.postMessage({ showHs }, "*"); }, [showHs, cur]);

  const nowSc = mode === "now" ? doc.now[cur] : null;
  const aftSc = mode === "after" ? doc.after[cur] : null;
  const title = (k: string) => (mode === "now" ? doc.now[k]?.title : doc.after[k]?.title) ?? k;

  const srcDoc = useMemo(() => {
    if (!aftSc) return "";
    const sels = JSON.stringify(aftSc.hs.map((h) => h[0]));
    return `<!doctype html><html><head><meta charset="utf-8"><style>${doc.after_css}
html,body{margin:0;background:transparent;overflow:hidden}
.pl-hm{outline:2px solid rgba(47,107,255,.85);outline-offset:-2px;cursor:pointer;border-radius:8px}
.pl-hm:hover,.pl-hm:focus-visible{background-color:rgba(47,107,255,.14)!important}
body.nohs .pl-hm{outline-color:transparent}
.pl-hm.blink{animation:b .6s}@keyframes b{50%{background-color:rgba(47,107,255,.4)}}
</style></head><body>${doc.after_html[cur] ?? ""}<script>
var S=${sels},E=S.map(function(s){return document.querySelector(s)});
E.forEach(function(el,i){if(!el)return;el.classList.add('pl-hm');el.setAttribute('role','button');el.tabIndex=0;el.addEventListener('keydown',function(e){if(e.key==='Enter')parent.postMessage({castor:i},'*')});});
// 시안 위에 덮인 층이 있어도 눌린 자리 아래의 영역을 찾는다
document.addEventListener('click',function(e){var under=document.elementsFromPoint(e.clientX,e.clientY);
for(var i=0;i<E.length;i++){var el=E[i];if(el&&under.some(function(x){return x===el||el.contains(x)})){e.preventDefault();e.stopPropagation();parent.postMessage({castor:i},'*');return;}}},true);
parent.postMessage({castorReady:E.map(function(x){return !!x})},'*');
addEventListener('message',function(e){var d=e.data||{};if('showHs' in d)document.body.classList.toggle('nohs',!d.showHs);
if(typeof d.blink==='number'){var el=document.querySelector(S[d.blink]);if(el){el.classList.add('blink');setTimeout(function(){el.classList.remove('blink')},600)}}});
</script></body></html>`;
  }, [aftSc, cur, doc]);

  const items = mode === "now" ? (nowSc?.hs ?? []).map((h, i) => ({ i, label: h[7], st: status(h[5], h[6]) })) : (aftSc?.hs ?? []).map((h, i) => ({ i, label: h[4], st: h[3] }));

  function pressNow(i: number) {
    const h = nowSc?.hs[i]; if (!h) return;
    const st = status(h[5], h[6]);
    push(h[5], st, h[7]);
    if (h[6] === "dead") { setFx({ i, kind: "shake" }); setTimeout(() => setFx(null), 480); return; }
    if (h[4] !== cur && doc.now[h[4]]) go("now", h[4], h[5]); else { setFx({ i, kind: "blink" }); setTimeout(() => setFx(null), 620); }
  }

  return (
    <section className={`pl${showHs ? "" : " nohs"}`} aria-label="눌러보기">
      <div className="pl-top">
        <div className="cx-seg" role="tablist" aria-label="보기">
          <button type="button" role="tab" aria-selected={mode === "now"} className={mode === "now" ? "on" : ""} onClick={() => reset("now")}>지금 · 실제 화면</button>
          <button type="button" role="tab" aria-selected={mode === "after"} className={mode === "after" ? "on" : ""} onClick={() => reset("after")}>바뀐 뒤 · 시안</button>
        </div>
        <label className="cx-cap" style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={showHs} onChange={(e) => setShowHs(e.target.checked)} /> 누를 수 있는 곳 보이기</label>
        <span className="cx-cap">{doc.source}</span>
        <button type="button" className="cx-btn" style={{ marginLeft: "auto" }} onClick={() => reset(mode)}>처음으로</button>
      </div>
      <div className="pl-body">
        <aside className="pl-list">
          <em>화면</em>
          {(mode === "now" ? Object.entries(doc.now).map(([k, v]) => [k, v.title, v.screen] as const) : Object.entries(doc.after).map(([k, v]) => [k, v.title, v.sid] as const)).map(([k, t, sid]) => (
            <button key={k} type="button" className={`pl-s${k === cur ? " on" : ""}`} onClick={() => go(mode, k)}><b>{t}</b><code>{sid}</code></button>
          ))}
        </aside>
        <div className="pl-stage">
          <div className="pl-crumb">{trail.slice(-5).map((k, i, a) => <span key={i} style={{ display: "contents" }}><span>{title(k)}</span>{i < a.length - 1 && <i style={{ fontStyle: "normal" }}>→</i>}</span>)}</div>
          {mode === "now" && nowSc ? (
            <div className="pl-phone"><div className="pl-frame">
              <div className="pl-img" style={{ backgroundImage: `url(${nowSc.img})`, aspectRatio: `${W} / ${H}`, bottom: "auto", width: "100%" }}>
                {nowSc.hs.map((h, i) => (
                  <button key={i} type="button" aria-label={h[7]} title={h[7]} onClick={() => pressNow(i)}
                    className={`pl-h st-${h[6] === "dead" ? "dead" : "x"}${hot === i ? " hot" : ""}${fx?.i === i ? ` ${fx.kind}` : ""}`}
                    style={{ left: `${(h[0] / W) * 100}%`, top: `${(h[1] / H) * 100}%`, width: `${((h[2] - h[0]) / W) * 100}%`, height: `${((h[3] - h[1]) / H) * 100}%` }} />
                ))}
              </div>
            </div></div>
          ) : aftSc ? (
            <iframe ref={frame} title={`시안 · ${aftSc.title}`} sandbox="allow-scripts" srcDoc={srcDoc} style={{ width: 300, height: 650, border: 0, background: "transparent" }}
              onLoad={() => frame.current?.contentWindow?.postMessage({ showHs }, "*")} />
          ) : null}
          <div className="pl-hint">{mode === "now" ? "파란 영역을 누르면 다음 화면으로 · 빨간 점선 = 눌러도 반응 없는 곳" : "시안 화면입니다 — 이벤트는 전부 새로 심을 것"}</div>
        </div>
        <aside className="pl-log">
          <div className="pl-lh"><b>이 동작에서 찍히는 이벤트</b><span>{health?.ok ? `GA4 ~${health.through}` : "GA4 연결 전 · 문서 값"}</span></div>
          <ol className="pl-ol" aria-live="polite">
            {log.map((l) => <li key={l.id} className={`st-${l.st}`}><span className="t">{l.t}</span><code>{l.ev}</code><em>{LBL[l.st]}</em><small>{l.what}</small></li>)}
          </ol>
          <div className="pl-legend">
            {(["ok", "miss", "none", "new", "dead"] as HotStatus[]).map((s) => <span key={s}><i className={s} />{LBL[s]}</span>)}
          </div>
          <div className="pl-here">
            <b className="cx-card-h" style={{ fontSize: 13 }}>이 화면에서 누를 수 있는 것</b>
            <ul>
              {items.map((it) => (
                <li key={it.i} className={`st-${it.st}`} onMouseEnter={() => setHot(it.i)} onMouseLeave={() => setHot(null)}
                  onClick={() => (mode === "now" ? pressNow(it.i) : frame.current?.contentWindow?.postMessage({ blink: it.i }, "*"))}>{it.label}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
