import { dashed, rangeLabel } from "./appRange";
import { bold, esc, fmtCell, page } from "./appRangePage";
import type { AppSeries, Cell, SeriesRow, SeriesSource } from "./appSeriesData";

/**
 * Probe · **앱 지표 보고서 원본** — 모든 지표 × 기간을 단위로 자른 칸(민찬 1015).
 *
 * 주간·월간 보고서를 대신한다. 행이 지표, 열이 칸(일·주·월), 끝 열이 「기간 전체」다.
 * 문장은 쓰지 않는다 — 숫자와, 그 숫자를 어떻게 셌는지(지표 정의 · 읽는 법)만 둔다. 해석은 「주요 지표 보고서」 몫이다.
 * 같은 표를 CSV 로도 낸다(스프레드시트에서 다시 쓰려고).
 */

const SOURCE: Record<SeriesSource, string> = { ga4: "GA4", firebase: "Firebase", backend: "DB", push: "푸시" };

const CSS = `
.grid-card{padding:0;overflow:hidden}
.scroll{overflow-x:auto}
table.grid{border-collapse:separate;border-spacing:0;width:100%;font-size:12px}
.grid th,.grid td{padding:6px 10px;border-bottom:1px solid var(--line2);white-space:nowrap}
.grid thead th{position:sticky;top:0;background:var(--soft2);font-size:11.5px;font-weight:700;color:var(--tx);text-align:right;border-bottom:1px solid var(--line)}
.grid thead th.lab{text-align:left}
.grid .lab{position:sticky;left:0;z-index:1;background:#fff;text-align:left;font-weight:600;color:var(--ink);min-width:220px;border-right:1px solid var(--line)}
.grid thead .lab{z-index:2;background:var(--soft2)}
.grid .lab .u{color:var(--mut);font-weight:500;font-size:11px;margin-left:3px}
.grid .lab .src{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:var(--peri);background:var(--soft);padding:1px 6px;border-radius:999px;vertical-align:1px}
.grid .lab.sub{padding-left:22px;font-weight:500;color:var(--tx)}
.grid .lab.sub::before{content:"└ ";color:var(--mut)}
.grid td{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}
.grid td.na{color:var(--mut)}
.grid td.weak{color:var(--mut)}
.grid .open{background:#FFFBF0}
.grid thead th.open{background:#FFF4DA}
.grid .tot{background:var(--soft2);font-weight:700;border-left:1px solid var(--line)}
.grid thead th.tot{background:#E6E9FA}
.grid tr.grp th{background:#fff;text-align:left;font-size:12.5px;font-weight:800;color:var(--navy);padding-top:14px;border-bottom:1px solid var(--line)}
.grid tr.grp th.lab{position:sticky;left:0}
.defs{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:6px 14px;margin-top:10px;font-size:12px}
.defs dt{font-weight:700;color:var(--ink)}
.defs dt .src{font-weight:600;color:var(--mut);font-size:11px;margin-left:4px}
.defs dd{color:var(--tx)}
.defs .gh{grid-column:1/-1;font-weight:800;color:var(--navy);margin-top:8px}
@media print{
  @page{size:A4 landscape;margin:8mm}
  body{background:#fff}
  .wrap{max-width:none;padding:0}
  .scroll{overflow:visible}
  .grid{font-size:9.5px}
  .grid th,.grid td{padding:3px 5px}
  .grid .lab{position:static;min-width:0}
  .card{border:0;padding:8px 0}
}
`;

const cellTd = (c: Cell, kind: SeriesRow["kind"], open: boolean, extra = "") => {
  const cls = [c.v === null ? "na" : c.weak ? "weak" : "", open ? "open" : "", extra].filter(Boolean).join(" ");
  // 이유·표본은 title 로 — 칸에 글자를 늘어놓으면 표가 읽히지 않는다(읽는 법에 적어 둠)
  const tip = [c.why, c.n !== undefined && c.v !== null && !c.weak ? `분모 ${c.n.toLocaleString("ko-KR")}` : ""].filter(Boolean).join(" · ");
  return `<td${cls ? ` class="${cls}"` : ""}${tip ? ` title="${esc(tip)}"` : ""}>${fmtCell(c, kind)}</td>`;
};

export function renderRawReport(s: AppSeries, bar: string): string {
  const cols = s.buckets.length + 2;
  const head = `<tr><th class="lab">지표</th>${s.buckets.map((b) => `<th${b.open ? ' class="open" title="아직 끝나지 않은 칸"' : ""}>${esc(b.label)}${b.open ? "＊" : ""}</th>`).join("")}<th class="tot">기간 전체</th></tr>`;
  const body = s.groups.map((g) => {
    const rows = g.rows.map((r) =>
      `<tr><th class="lab${r.sub ? " sub" : ""}" title="${esc(r.note)}">${esc(r.label)}<span class="u">${esc(r.unit)}</span>${r.sub ? "" : `<span class="src">${SOURCE[r.source]}</span>`}</th>` +
      r.cells.map((c, i) => cellTd(c, r.kind, s.buckets[i].open)).join("") +
      cellTd(r.total, r.kind, false, "tot") + `</tr>`
    ).join("");
    return `<tr class="grp"><th class="lab">${esc(g.title)}</th><th colspan="${cols - 1}"></th></tr>${rows}`;
  }).join("");

  const defs = s.groups.map((g) =>
    `<div class="gh">${esc(g.title)}</div>` +
    g.rows.map((r) => `<dt>${esc(r.label)}<span class="src">${SOURCE[r.source]} · ${esc(r.unit)}</span></dt><dd>${esc(r.note)}</dd>`).join("")
  ).join("");

  const through = s.through ? `GA4 확정 테이블 ${dashed(s.through)}까지` : "GA4 미연결";
  const html = `
<header class="head">
  <span class="chip">Probe · 앱 지표 원본</span>
  <h1>앱 지표 보고서 원본</h1>
  <p class="sub">${esc(rangeLabel(s.spec))} · ${esc(through)} · 만든 시각 ${esc(s.generatedAt)}</p>
  ${s.spec.adjusted ? `<p class="sub">고른 기간을 단위의 경계(주 = 월~일, 월 = 1일~말일)로 맞췄습니다. 시작은 GA4 첫 날(2026-03-01) 앞으로 가지 않습니다.</p>` : ""}
</header>
${s.warnings.length ? `<div class="warn"><b>읽지 못한 값이 있습니다</b><ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
<section class="card grid-card"><div class="scroll"><table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table></div></section>
<section class="card"><h2>읽는 법</h2><ul class="notes">${s.caveats.map((c) => `<li>${bold(c)}</li>`).join("")}</ul></section>
<section class="card"><h2>지표 정의</h2><p class="desc">표의 지표 이름에 마우스를 올려도 같은 설명이 나옵니다.</p><dl class="defs">${defs}</dl></section>
<p class="foot">우주라이크 · Probe 앱 지표 원본 · 내부 자료</p>`;

  return page({ title: `앱 지표 원본 ${rangeLabel(s.spec)}`, css: CSS, bar, body: html, wrapWidth: 1240 });
}

// ── CSV ────────────────────────────────────────────────────────────
const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * 같은 표를 CSV 로. 빈 칸은 비워 둔다(0 이 아니다). 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다.
 * 칸 머리는 날짜 범위 그대로(「2026-09-01~2026-09-07」) — 스프레드시트에서 다시 정렬·필터할 수 있게.
 */
export function seriesCsv(s: AppSeries): string {
  const head = ["묶음", "지표", "단위", "출처", ...s.buckets.map((b) => `${dashed(b.start)}~${dashed(b.end)}${b.open ? " (진행 중)" : ""}`), "기간 전체", "정의"];
  const lines = [head];
  for (const g of s.groups) {
    for (const r of g.rows) {
      const val = (c: Cell) => (c.v === null ? "" : String(c.v));
      lines.push([g.title, r.label, r.unit, SOURCE[r.source], ...r.cells.map(val), val(r.total), r.note]);
    }
  }
  return "﻿" + lines.map((l) => l.map(csvField).join(",")).join("\r\n") + "\r\n";
}
