"use client";

import { useMemo, useState } from "react";
import type { AppGraph, ChangesDoc, PlayerDoc } from "@/lib/castor/app";
import { Notice, PageHeader, Skeleton } from "../_shared/ui";
import { useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 흐름 (기획안 Castor 절 C2 · 흐름 v2 시안, 1008). 과업 하나 = 퍼널 하나, **기기 단위**(GA4 확정 테이블).
 * 단계 k = 앞 단계를 모두 거치고, 직전 단계보다 늦게 이 이벤트가 있었던 기기 수.
 * 캠퍼스별은 이벤트에 캠퍼스 값이 없어 비워 둔다 — 지어내지 않는다. 배포 세로선은 변경 카드가 '배포'로 옮겨진 날.
 * 아래 '이벤트 감시'는 옛 계측 탭의 감시 절반 — 코드엔 있는데 이 기간 0건인 이벤트.
 */
const FAIL_LABEL: Record<string, string> = { wrong_pin: "PIN 불일치", already_used: "이미 사용", expired: "만료", other_store: "다른 매장", network: "네트워크", unknown: "알 수 없음" };

export default function CastorFlow() {
  const [days, setDays] = useState<1 | 7 | 28>(7);
  const h = useCastorHealth(days);
  const graph = useCastorDoc<AppGraph>("app_graph");
  const player = useCastorDoc<PlayerDoc>("player");
  const changes = useCastorDoc<ChangesDoc>("changes");
  const [key, setKey] = useState("store");

  const f = h?.ok ? h.flows.find((x) => x.key === key) ?? h.flows[0] : null;
  const thumbOf = (ev: string) => {
    const sid = graph.data?.events.find((e) => e.name === ev)?.screens[0];
    return sid ? player.data?.thumbs[sid] : undefined;
  };
  const releases = useMemo(() => (changes.data?.cards ?? []).flatMap((c) => (c.log ?? []).filter((l) => /→ 배포/.test(l.text)).map((l) => ({ at: l.at.slice(0, 10), title: c.title }))), [changes.data]);
  const silent = useMemo(() => {
    if (!h?.ok || !graph.data) return [];
    const live = new Map(h.events.map((e) => [e.name, e]));
    return graph.data.events.filter((e) => e.used.length && !(live.get(e.name)?.d7)).map((e) => e.name);
  }, [h, graph.data]);

  return (
    <div className="cx">
      <PageHeader title="흐름" description="과업 하나 = 퍼널 하나. GA4 확정 테이블, 기기 단위로 셉니다." />
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <div className="cx-seg" role="tablist" aria-label="기간">
          {([1, 7, 28] as const).map((d) => <button key={d} type="button" className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d === 1 ? "마지막 날" : d === 7 ? "7일" : "28일"}</button>)}
        </div>
        <span className="cx-chips"><span className="dash" title="이벤트에 캠퍼스 값이 없어 아직 나눌 수 없습니다">캠퍼스 · 전체만</span></span>
        {h?.ok && <span className="cx-fresh"><i />{h.window?.from} ~ {h.window?.to} · user_id {h.user_id_share ?? 0}%</span>}
      </div>

      {h === undefined ? <Skeleton rows={5} cols={4} /> : !h?.ok || !f ? (
        <Notice tone="amber" title="GA4 를 아직 못 읽었습니다">{h?.reason ?? "BigQuery 연결을 확인해 주세요."}</Notice>
      ) : (
        <div className="f-split">
          <nav className="f-flows" aria-label="흐름 목록">
            {h.flows.map((x) => (
              <button key={x.key} type="button" className={x.key === f.key ? "on" : ""} onClick={() => setKey(x.key)}>
                <b>{x.title}</b><span>{x.steps[0].devices.toLocaleString()} → {x.steps[x.steps.length - 1].devices.toLocaleString()} 기기</span>
              </button>
            ))}
            <button type="button" className="g" disabled><b>+ 흐름 추가</b><span>FLOW_DEFS · 다음 단계</span></button>
          </nav>

          <div className="flex flex-col gap-3 min-w-0">
            <Summary f={f} />
            <div className="hf">
              {f.steps.map((s, i) => {
                const top = Math.max(1, f.steps[0].devices);
                const prev = i ? f.steps[i - 1].devices : null;
                const rate = prev ? (s.devices / Math.max(1, prev)) * 100 : null;
                const na = s.devices === 0 && (prev ?? 1) > 0;
                const th = thumbOf(s.event);
                return (
                  <div key={s.event}>
                    {rate !== null && <div className={`hf-step${rate < 30 ? " low" : ""}`}><span>↓</span><b>{prev ? `${rate.toFixed(1)}%` : "—"}</b><em>{prev ? `${(prev - s.devices).toLocaleString()} 기기 빠짐` : "앞 단계 0"}</em></div>}
                    <div className={`hf-row${na ? " na" : ""}`}>
                      <div className="hf-l"><span className={`cx-th xs${th ? "" : " empty"}`} style={th ? { backgroundImage: `url(${th})` } : undefined} /><div><b>{s.label}</b><code>{s.event}</code></div></div>
                      <div className="hf-track"><i style={{ width: `${Math.max(s.devices ? 1.5 : 0, (s.devices / top) * 100)}%` }} /></div>
                      <div className="hf-v"><b>{s.devices.toLocaleString()}</b><em>{((s.devices / top) * 100).toFixed(1)}%</em><span className="cx-src">GA4</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="f-grid">
              <div className="cx-card">
                <div className="cx-card-h"><b>캠퍼스별</b><span className="cx-cap">표본 20 미만은 회색</span></div>
                <p className="cx-cap" style={{ lineHeight: 1.6 }}>이벤트에 캠퍼스 값이 없어 나눌 수 없습니다. 앱이 <code>campus</code> 사용자 속성을 보내면 여기 채워집니다(재민 인계 다음 묶음).</p>
              </div>
              <div className="cx-card">
                <div className="cx-card-h"><b>사용 실패 이유</b><span className="cx-cap"><code>coupon_redeem_failed</code> · {h.fail_reasons.reduce((a, r) => a + r.n, 0)}건</span></div>
                {h.fail_reasons.length === 0 ? <p className="cx-cap">이 기간 실패 기록이 없습니다.</p> : (() => {
                  const tot = h.fail_reasons.reduce((a, r) => a + r.n, 0);
                  return <div className="flex flex-col gap-1.5">{h.fail_reasons.map((r) => <div key={r.reason} className="cx-barrow"><span>{FAIL_LABEL[r.reason] ?? r.reason}</span><span className="cx-bar r"><i style={{ width: `${(r.n / tot) * 100}%` }} /></span><b>{Math.round((r.n / tot) * 100)}%</b></div>)}</div>;
                })()}
              </div>
              <div className="cx-card">
                <div className="cx-card-h"><b>상세 → 사용까지 걸린 시간</b><span className="cx-cap">{median(h.redeem_lag)} · 28일 기준</span></div>
                {(() => { const mx = Math.max(1, ...h.redeem_lag.map((r) => r.n)); const by = new Map(h.redeem_lag.map((r) => [r.d, r.n])); return (
                  <>
                    <div className="f-hist" role="img" aria-label="걸린 날짜별 기기 수">{Array.from({ length: 8 }, (_, d) => <i key={d} title={`${by.get(d) ?? 0}`} style={{ height: `${((by.get(d) ?? 0) / mx) * 100}%` }} />)}</div>
                    <div className="f-hx"><span>당일</span><span>1일</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7일+</span></div>
                  </>
                ); })()}
              </div>
            </div>

            <Trend weekly={h.weekly} releases={releases} />

            <div className="cx-card">
              <div className="cx-card-h"><b>이벤트 감시</b><span className="cx-cap">코드엔 있는데 이 기간 0건 · {silent.length}개</span></div>
              {silent.length === 0 ? <p className="cx-cap">끊긴 이벤트가 없습니다.</p> : <div className="cx-chips">{silent.map((n) => <span key={n} style={{ borderColor: "var(--cx-bad)", color: "var(--cx-bad)", cursor: "default" }}><code style={{ background: "none", color: "inherit" }}>{n}</code></span>)}</div>}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-[12.5px]">
                <span className="cx-sub md:col-span-2">화면 기록(screen_view) — &apos;(이름 없음)&apos;이 많으면 지도 이동량을 못 그립니다</span>
                {h.screen_views.slice(0, 12).map((s) => <div key={s.screen} className="flex justify-between gap-2"><span className={s.screen === "(이름 없음)" ? "text-red-600 font-semibold" : "font-mono"}>{s.screen}</span><span className="tabular-nums cx-cap">{s.views.toLocaleString()}</span></div>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ f }: { f: { steps: { label: string; devices: number }[] } }) {
  const st = f.steps, a = st[0].devices, z = st[st.length - 1].devices;
  let worst = { i: 1, lost: -1 };
  for (let i = 1; i < st.length; i++) { const lost = st[i - 1].devices - st[i].devices; if (lost > worst.lost) worst = { i, lost }; }
  const gaps = st.filter((s, i) => i > 0 && s.devices === 0 && st[i - 1].devices > 0).length;
  return (
    <div className="f-sum">
      <div><em>시작</em><b>{a.toLocaleString()}</b><span>기기</span></div>
      <div><em>끝까지</em><b>{z.toLocaleString()}</b><span>기기</span></div>
      <div><em>전체 전환</em><b>{a ? `${((z / a) * 100).toFixed(1)}%` : "—"}</b><span>시작 대비</span></div>
      <div><em>가장 큰 손실</em><b style={{ fontSize: 14 }}>{st[worst.i - 1].label} → {st[worst.i].label}</b><span>{Math.max(0, worst.lost).toLocaleString()} 기기</span></div>
      <div className={gaps ? "g" : ""}><em>측정 공백</em><b>{gaps ? `${gaps}단계` : "없음"}</b><span>{gaps ? "앞 단계는 있는데 0" : "모든 단계가 셈"}</span></div>
    </div>
  );
}

function Trend({ weekly, releases }: { weekly: { wk: string; opened: number; redeemed: number }[]; releases: { at: string; title: string }[] }) {
  const W = 640, H = 150, P = 26;
  const pts = weekly.map((w) => ({ ...w, r: w.opened ? (w.redeemed / w.opened) * 100 : 0 }));
  const mx = Math.max(10, ...pts.map((p) => p.r));
  const x = (i: number) => P + (pts.length > 1 ? (i / (pts.length - 1)) * (W - P * 2) : 0);
  const y = (v: number) => H - P - (v / mx) * (H - P * 2);
  const first = pts[0]?.wk, last = pts[pts.length - 1]?.wk;
  const rel = releases.filter((r) => first && r.at >= first).map((r) => {
    const t0 = Date.parse(first!), t1 = Date.parse(last!) + 6 * 864e5;
    return { ...r, x: P + ((Date.parse(r.at) - t0) / Math.max(1, t1 - t0)) * (W - P * 2) };
  });
  return (
    <div className="cx-card">
      <div className="cx-card-h"><b>매장 상세 → 쿠폰 사용 (주별)</b><span className="cx-cap">사용 기기 ÷ 상세 연 기기 · 세로선 = 변경 카드가 배포된 날</span></div>
      {pts.length === 0 ? <p className="cx-cap">주별 자료가 없습니다.</p> : (
        <div style={{ overflowX: "auto" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 420, maxHeight: 180 }} role="img" aria-label="주별 전환율">
            {[0, 0.5, 1].map((t) => <g key={t}><path d={`M${P} ${y(mx * t)}H${W - P}`} stroke="var(--cx-line)" /><text x={2} y={y(mx * t) + 3} fontSize="9" fill="var(--cx-mute)">{Math.round(mx * t)}%</text></g>)}
            <path d={`M${pts.map((p, i) => `${x(i)} ${y(p.r)}`).join(" L")} L${x(pts.length - 1)} ${H - P} L${x(0)} ${H - P}z`} fill="var(--cx-navy)" opacity=".08" />
            <polyline points={pts.map((p, i) => `${x(i)},${y(p.r)}`).join(" ")} fill="none" stroke="var(--cx-navy)" strokeWidth="2.5" />
            {pts.map((p, i) => <g key={p.wk}><circle cx={x(i)} cy={y(p.r)} r={i === pts.length - 1 ? 4 : 2.5} fill="var(--cx-navy)" /><text x={x(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="var(--cx-mute)">{p.wk.slice(5).replace("-", "/")}</text>
              <title>{`${p.wk} 주 · ${p.redeemed}/${p.opened} 기기`}</title></g>)}
            <text x={x(pts.length - 1)} y={y(pts[pts.length - 1].r) - 8} fontSize="10" fontWeight="700" textAnchor="end" fill="var(--cx-navy)">{pts[pts.length - 1].r.toFixed(1)}%</text>
            {rel.map((r, i) => <g key={i}><path d={`M${r.x} 6V${H - P}`} stroke="var(--cx-orange)" strokeDasharray="4 3" /><text x={r.x + 4} y={14 + i * 11} fontSize="9.5" fill="var(--cx-orange)">{r.at.slice(5).replace("-", "/")} {r.title.slice(0, 18)}</text></g>)}
          </svg>
        </div>
      )}
    </div>
  );
}

function median(lag: { d: number; n: number }[]) {
  const tot = lag.reduce((a, r) => a + r.n, 0);
  if (!tot) return "기록 없음";
  let acc = 0;
  for (const r of [...lag].sort((a, b) => a.d - b.d)) { acc += r.n; if (acc >= tot / 2) return r.d === 0 ? "중앙값 당일" : `중앙값 ${r.d}${r.d >= 7 ? "일+" : "일"}`; }
  return "—";
}
