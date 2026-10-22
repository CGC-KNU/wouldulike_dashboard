import { eventLabel, eventsIn, type AppEvent } from "./appEvents";
import { dataState } from "./appKeyReport";
import { dashed, rangeLabel } from "./appRange";
import { bold, esc, fmtCell, fmtNum, page } from "./appRangePage";
import type { AppSeries, Cell, SeriesRow, SeriesSource } from "./appSeriesData";

/**
 * Probe · **앱 지표 보고서 원본** — 모든 지표 × 기간을 단위로 자른 칸(민찬 1015). 처음부터 내부 진단용이다.
 *
 * 주간·월간 보고서를 대신한다. 행이 지표, 열이 칸(일·주·월), 끝 열이 「기간 전체」다.
 * 문장은 쓰지 않는다 — 숫자와, 그 숫자를 어떻게 셌는지(지표 정의 · 읽는 법)만 둔다. 해석은 「주요 지표 보고서」 몫이다.
 * 같은 표를 CSV 로도 낸다(스프레드시트에서 다시 쓰려고).
 *
 * 1022 기획팀 검토(민찬 채택) — 숫자는 맞았는데 **그 숫자를 어떻게 읽을지**가 파일 밖에 있었다.
 *  - 행마다 metric_id · 집계방식 · 세는 단위 · 빈칸 사유 · 흐린 칸, 비율 행엔 칸마다 분모 줄(S1 · S5)
 *  - 첫 줄에 칸마다 사건(캠페인 · 휴일 · 릴리스), 끝에 메타(생성 시각 · GA4 · DB 기준 · 리비전 · 제외 목록)(S2 · S3)
 *  - 차원이 있는 값(실패 사유 · 쿠폰 종류 · 매장 × 월 · 마일리지 회차)은 보조표 CSV 한 장으로(S7 · S8 · S9 · S11)
 */

const SOURCE: Record<SeriesSource, string> = { ga4: "GA4", backend: "DB", snapshot: "DB 월말 스냅샷" };
const EVENT_KIND: Record<AppEvent["kind"], string> = { campaign: "캠페인", holiday: "휴일", release: "릴리스" };

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
.grid tr.ev td{font-size:10.5px;color:#9A6414;background:#FBF1D9;text-align:center}
.grid tr.ev td:empty{background:#fff}
.grid tr.ev th{background:#FBF1D9}
.state{font-size:11.5px;color:var(--sub);margin-top:4px}
.defs{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:6px 14px;margin-top:10px;font-size:12px}
.defs dt{font-weight:700;color:var(--ink)}
.defs dt .src{font-weight:600;color:var(--mut);font-size:11px;margin-left:4px}
.defs dd{color:var(--tx)}
.defs .gh{grid-column:1/-1;font-weight:800;color:var(--navy);margin-top:8px}
table.rounds{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums;margin-top:8px}
table.rounds th,table.rounds td{padding:4px 8px;border-bottom:1px solid var(--line2);text-align:right;white-space:nowrap}
table.rounds th:first-child,table.rounds td:first-child{text-align:left}
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
  const tip = [c.why, c.span, c.n !== undefined && c.v !== null ? `${c.x !== undefined ? `${c.x.toLocaleString("ko-KR")} / ` : "분모 "}${c.n.toLocaleString("ko-KR")}` : ""].filter(Boolean).join(" · ");
  return `<td${cls ? ` class="${cls}"` : ""}${tip ? ` title="${esc(tip)}"` : ""}>${fmtCell(c, kind)}</td>`;
};

/** 칸마다의 사건 — 「한정쿠폰 주간 · 추석 연휴」 */
const bucketEvents = (s: AppSeries) => s.buckets.map((b) => eventLabel(eventsIn(s.events, b.start, b.end)));

/** 회차 마감일 「9/25」 */
const closeDay = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

export function renderRawReport(s: AppSeries, bar: string): string {
  const cols = s.buckets.length + 2;
  const head = `<tr><th class="lab">지표</th>${s.buckets.map((b) => `<th${b.open ? ' class="open" title="아직 끝나지 않은 칸"' : ""}>${esc(b.label)}${b.open ? "＊" : ""}</th>`).join("")}<th class="tot">기간 전체</th></tr>`;
  // 칸에는 종류만 짧게(캠페인 · 휴일 · 릴리스), 이름은 툴팁 — 긴 이름이 줄을 세로로 늘였다. CSV 에는 이름 그대로
  const evRow = `<tr class="ev"><th class="lab">사건${s.eventsOk ? "" : " (캠페인 표 못 읽음)"}</th>${s.buckets.map((b) => {
    const ev = eventsIn(s.events, b.start, b.end);
    const kinds = [...new Set(ev.map((e) => EVENT_KIND[e.kind]))].join(" · ");
    return `<td${ev.length ? ` title="${esc(eventLabel(ev))}"` : ""}>${esc(kinds)}</td>`;
  }).join("")}<td></td></tr>`;
  const body = s.groups.map((g) => {
    const rows = g.rows.map((r) =>
      `<tr><th class="lab${r.sub ? " sub" : ""}" title="${esc(`${r.note} · ${r.agg} · ${r.counts}`)}">${esc(r.label)}<span class="u">${esc(r.unit)}</span>${r.sub ? "" : `<span class="src">${SOURCE[r.source]}</span>`}</th>` +
      r.cells.map((c, i) => cellTd(c, r.kind, s.buckets[i].open)).join("") +
      cellTd(r.total, r.kind, false, "tot") + `</tr>`
    ).join("");
    return `<tr class="grp"><th class="lab">${esc(g.title)}</th><th colspan="${cols - 1}"></th></tr>${rows}`;
  }).join("");

  const defs = s.groups.map((g) =>
    `<div class="gh">${esc(g.title)}</div>` +
    g.rows.map((r) => `<dt>${esc(r.label)}<span class="src">${SOURCE[r.source]} · ${esc(r.unit)} · ${esc(r.agg)} · ${esc(r.counts)}</span></dt><dd>${esc(r.note)}</dd>`).join("")
  ).join("");

  const rounds = s.rounds === null
    ? `<p class="desc">회차 요약을 읽지 못했습니다 — 백엔드 app-stats/raffles 가 반영되기 전이면 비어 있습니다.</p>`
    : s.rounds.length
      ? `<table class="rounds"><tr><th>회차</th><th>상품</th><th>상태</th><th>응모</th><th>응모자</th><th>응모 P</th><th>당첨</th><th>식사권 사용</th></tr>${s.rounds.map((r) => `<tr><td>${esc(`${closeDay(r.closes_at)} 마감 · ${r.title}`)}</td><td>${esc(r.prize_label || "–")}</td><td>${esc(r.status)}</td><td>${fmtNum(r.entries, "count")}</td><td>${fmtNum(r.entrants, "count")}</td><td>${fmtNum(r.points, "count")}</td><td>${fmtNum(r.winners, "count")}</td><td>${fmtNum(r.voucher_redeemed, "count")}</td></tr>`).join("")}</table>`
      : `<p class="desc">이 기간에 마감한 회차가 없습니다.</p>`;

  const html = `
<header class="head">
  <span class="chip">Probe · 앱 지표 원본</span>
  <h1>앱 지표 보고서 원본</h1>
  <p class="sub">${esc(rangeLabel(s.spec))}</p>
  <p class="state">${esc(dataState(s))}${s.exclusions.length ? ` · 뺀 값: ${esc(s.exclusions.join(" · "))}` : ""}</p>
  ${s.spec.adjusted ? `<p class="sub">고른 기간을 단위의 경계(주 = 월~일, 월 = 1일~말일)로 맞췄습니다. 시작은 GA4 첫 날(2026-03-01) 앞으로 가지 않습니다.</p>` : ""}
</header>
${s.warnings.length ? `<div class="warn"><b>읽지 못한 값이 있습니다</b><ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
<section class="card grid-card"><div class="scroll"><table class="grid"><thead>${head}</thead><tbody>${evRow}${body}</tbody></table></div></section>
<section class="card"><h2>마일리지 회차 요약</h2><p class="desc">마감이 이 기간 안인 회차 — 응모가 마감일 앞에 몰려 날짜 칸으로는 읽히지 않아 회차마다 한 줄입니다. 당첨률은 앞 회차 응모분이 섞여 계산하지 않습니다.</p>${rounds}</section>
<section class="card"><h2>읽는 법</h2><ul class="notes">${s.caveats.map((c) => `<li>${bold(c)}</li>`).join("")}</ul></section>
<section class="card"><h2>지표 정의</h2><p class="desc">표의 지표 이름에 마우스를 올려도 같은 설명이 나옵니다. 출처 · 단위 · 집계방식 · 세는 단위 순입니다.</p><dl class="defs">${defs}</dl></section>
<p class="foot">우주라이크 · Probe 앱 지표 원본 · 내부 자료</p>`;

  return page({ title: `앱 지표 원본 ${rangeLabel(s.spec)}`, css: CSS, bar, body: html, wrapWidth: 1240 });
}

// ── CSV ────────────────────────────────────────────────────────────
const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (lines: string[][]) => "﻿" + lines.map((l) => l.map(csvField).join(",")).join("\r\n") + "\r\n";

/** 빈칸 사유 — 행에서 값이 빈 칸의 이유를 겹치지 않게 */
const blankWhy = (r: SeriesRow) => [...new Set(r.cells.filter((c) => c.v === null).map((c) => c.why ?? "값 없음"))].join(" / ");
/** 흐린 칸 — 표본 30 미만 · 지켜보는 중 · 보급 전. 「3칸: 표본 12 / 지켜보는 중」 */
const weakWhy = (r: SeriesRow) => {
  const w = r.cells.filter((c) => c.v !== null && c.weak);
  return w.length ? `${w.length}칸: ${[...new Set(w.map((c) => (c.why ?? "").replace(/\d+/g, "n")))].join(" / ")}` : "";
};

/**
 * 같은 표를 CSV 로. 빈 칸은 비워 둔다(0 이 아니다). 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다.
 * 칸 머리는 날짜 범위 그대로(「2026-09-01~2026-09-07」) — 스프레드시트에서 다시 정렬·필터할 수 있게.
 *
 * 열(1022 S1 · S5): metric_id · 묶음 · 지표 · 단위 · 출처 · 집계방식 · 세는 단위 · [칸…] · 기간 전체 · 기간 전체 분모 · 빈칸 사유 · 흐린 칸 · 정의.
 * 줄: 첫 줄 사건(S3) → 지표(비율은 바로 아래 「· 분모」, 실제 창이 칸과 다른 지표는 「· 실제 창」) → 빈 줄 → 메타(S2).
 */
export function seriesCsv(s: AppSeries): string {
  const blank = s.buckets.map(() => "");
  const head = ["metric_id", "묶음", "지표", "단위", "출처", "집계방식", "세는 단위", ...s.buckets.map((b) => `${dashed(b.start)}~${dashed(b.end)}${b.open ? " (진행 중)" : ""}`), "기간 전체", "기간 전체 분모", "빈칸 사유", "흐린 칸", "정의"];
  const lines = [head];
  lines.push(["events", "사건", "사건(캠페인 · 휴일 · 릴리스)", "", s.eventsOk ? "Astro 캠페인 주간 + 공휴일 · 릴리스" : "공휴일 · 릴리스만(캠페인 표 못 읽음)", "", "", ...bucketEvents(s), eventLabel(eventsIn(s.events, s.spec.start, s.spec.end)), "", "", "", "칸에 하루라도 걸친 사건. 사건 칸은 주요 지표 보고서에서 판정하지 않습니다"]);
  const val = (c: Cell) => (c.v === null ? "" : String(c.v));
  for (const g of s.groups) {
    for (const r of g.rows) {
      lines.push([r.key, g.title, r.label, r.unit, SOURCE[r.source], r.agg, r.counts, ...r.cells.map(val), val(r.total), r.total.n === undefined ? "" : String(r.total.n), blankWhy(r), weakWhy(r), r.note]);
      if (r.kind === "rate") {
        lines.push([`${r.key}__n`, g.title, `${r.label} · 분모`, "", SOURCE[r.source], "분모", r.counts, ...r.cells.map((c) => (c.n === undefined ? "" : String(c.n))), r.total.n === undefined ? "" : String(r.total.n), "", "", "", `「${r.label}」의 분모 — 30 미만이면 판정하지 않습니다`]);
      }
      if (r.cells.some((c) => c.span)) {
        lines.push([`${r.key}__span`, g.title, `${r.label} · 실제 창`, "", SOURCE[r.source], "창", "", ...r.cells.map((c) => c.span ?? ""), r.total.span ?? "", "", "", "", "칸과 다른 창으로 센 지표의 실제 창 — 코호트 · 클릭"]);
      }
    }
  }
  lines.push([]);
  const meta = (id: string, label: string, v: string) => lines.push([`meta.${id}`, "메타", label, "", "", "", "", v, ...blank.slice(1), "", "", "", "", ""]);
  meta("range", "기간 · 단위", rangeLabel(s.spec));
  meta("generated_at", "생성 시각(KST)", s.generatedAt);
  meta("ga4_through", "GA4 확정 테이블", s.through ? dashed(s.through) : "못 읽음");
  meta("db_at", "DB 기준 시각(KST)", s.dbAt ?? "못 읽음");
  meta("revision", "리비전", s.revision);
  meta("calendar", "캠페인 표(Astro)", s.eventsOk ? "읽음" : "못 읽음 — KPI 판정을 모두 미뤘습니다");
  meta("exclusions", "제외 목록", s.exclusions.length ? s.exclusions.join(" / ") : "없음");
  return toCsv(lines);
}

/**
 * 원본 보조표(long) — 차원이 있는 값 한 장(1022 S7 · S8 · S9 · S11). 원본 표에 행으로 늘리면
 * 칸마다 BigQuery 호출이 곱해져(칸당 열다섯 번) 따로 낸다. 같은 생성 시각을 첫 줄에 적는다.
 */
export function longCsv(s: AppSeries): string {
  const lines: string[][] = [["표", "칸", "차원", "지표", "값"]];
  for (const r of s.long) lines.push([r.table, `${dashed(r.start)}~${dashed(r.end)}`, r.dim, r.metric, r.v === null ? "" : String(r.v)]);
  for (const r of s.rounds ?? []) {
    const name = `${closeDay(r.closes_at)} 마감 · ${r.title}${r.prize_label ? ` · ${r.prize_label}` : ""}`;
    for (const [metric, v] of [["응모", r.entries], ["응모자", r.entrants], ["응모 P", r.points], ["당첨", r.winners], ["식사권 사용", r.voucher_redeemed]] as const) {
      lines.push(["마일리지 회차(DB)", r.closes_at.slice(0, 10), name, metric, String(v)]);
    }
  }
  if (s.rounds === null) lines.push(["마일리지 회차(DB)", "", "", "못 읽음", ""]);
  lines.push([]);
  lines.push(["메타", "", "생성 시각(KST)", s.generatedAt, ""]);
  lines.push(["메타", "", "리비전", s.revision, ""]);
  lines.push(["메타", "", "매장 × 월", s.spec.unit === "month" ? "월말 스냅샷의 매장별 행 — 그 달 이용이 있던 매장만. 0건 매장은 매장 정본(Astro 계약) 뒤" : "월 단위로 뽑을 때만 실립니다", ""]);
  return toCsv(lines);
}
