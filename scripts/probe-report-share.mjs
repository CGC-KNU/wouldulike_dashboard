#!/usr/bin/env node
/**
 * probe-report-share — 승인된 매장 리포트를 PROBE 가 #ops-partner 에 PNG·HTML 로 올린다 (민찬 0928).
 *
 *   .github/workflows/probe-report-share.yml 이 10분마다 부른다. 손으로:
 *   DASH=https://app.wouldulike.kr BACKEND=… CRON_TOKEN=… SLACK_TOKEN=… CHANNEL=C0BPSQ7F8LC \
 *   DRY_RUN=true node probe-report-share.mjs
 *
 * 한 건마다:
 *   1. 백엔드 slack-queue — 승인됐는데 그 승인을 아직 안 올린 것(백엔드 #79)
 *   2. 대시보드 cron-preview — 담당자 미리보기(/r/preview-<id>)와 **같은 HTML**
 *   3. 크롬(playwright-core)으로 열고, 담당자가 누르는 그 함수(window.__reportFiles)로 PNG 3장 · HTML 을 만든다
 *      — 그래서 #ops-partner 파일이 사장님께 간 파일과 같다
 *   4. 슬랙 3단계 업로드(파일 여러 개 → 메시지 하나)
 *   5. 백엔드 slack-posted — 같은 승인은 두 번 안 올린다
 *
 * 이미지: 양식은 바깥 이미지를 우리 도메인 /api/img 로 돌리는데, 그 창구는 로그인 쿠키가 없으면 /login 으로
 * 튄다(0928 확인). 러너에는 쿠키가 없으므로 /api/img 요청을 가로채 **같은 허용 호스트만** 직접 받아 준다.
 *
 * playwright-core 는 저장소 의존성이 아니다 — 워크플로가 임시 폴더에 깔고 이 파일을 거기로 복사해 돌린다.
 * 브라우저는 러너에 깔린 크롬(channel "chrome")을 쓴다.
 *
 * **로그에는 id 와 파일 크기만 남긴다.** 이 저장소는 공개라 Actions 로그를 누구나 본다 — 매장 이름·제목·승인자·
 * 본문은 찍지 않는다. 로컬에서 본문을 보려면 SHOW_BODY=1.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const env = (k, d) => process.env[k] ?? d;
const DASH = env("DASH", "https://app.wouldulike.kr").replace(/\/$/, "");
const BACKEND = (env("BACKEND") ?? "").replace(/\/$/, "");
const CRON_TOKEN = env("CRON_TOKEN", "");
const SLACK_TOKEN = env("SLACK_TOKEN", "");
const CHANNEL = env("CHANNEL", "");
const DRY_RUN = env("DRY_RUN", "true") === "true";
const ONLY_ID = env("ONLY_ID", "");
const OUT_DIR = env("OUT_DIR", "probe-report-files");
const CHROME_CHANNEL = env("CHROME_CHANNEL", "chrome");
const SHOW_BODY = env("SHOW_BODY", "") === "1";

/** /api/img 와 같은 허용 호스트 — 아무 주소나 받아 주지 않는다 */
const ALLOWED_EXACT = new Set(["wouldulike-default-bucket-lunching.s3.amazonaws.com", "wouldulike-default-bucket-lunching.s3.ap-northeast-2.amazonaws.com"]);
const ALLOWED_SUFFIX = [".cdninstagram.com", ".fbcdn.net"];
const allowed = (host) => ALLOWED_EXACT.has(host) || ALLOWED_SUFFIX.some((s) => host.endsWith(s));

function die(msg) { console.error(`::error::${msg}`); process.exit(1); }
if (!BACKEND) die("BACKEND(백엔드 주소)가 없습니다");
if (!CRON_TOKEN) die("CRON_TOKEN 이 없습니다");
if (!DRY_RUN && (!SLACK_TOKEN || !CHANNEL)) die("SLACK_TOKEN · CHANNEL 이 없습니다");

async function backend(pathname, init = {}) {
  const res = await fetch(`${BACKEND}${pathname}`, { ...init, headers: { "X-CRON-TOKEN": CRON_TOKEN, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`백엔드 ${pathname} HTTP ${res.status} — ${body.detail ?? ""}`);
  return body;
}

// ── 파일 만들기 ────────────────────────────────────────────────────────
async function makeFiles(browser, id) {
  const res = await fetch(`${DASH}/api/probe/reports/cron-preview?id=${encodeURIComponent(id)}`, { headers: { "X-CRON-TOKEN": CRON_TOKEN } });
  if (!res.ok) throw new Error(`미리보기 HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const html = await res.text();
  const name = decodeURIComponent(res.headers.get("x-report-filename") ?? id);

  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120_000);
  // 실패하면 무엇이 막혔는지 남긴다 — 공개 로그라 **호스트와 상태만**(주소 전체는 안 찍는다)
  const notes = [];
  const host = (u) => { try { return new URL(u).host; } catch { return "?"; } };
  page.on("requestfailed", (q) => notes.push(`요청 실패 ${q.resourceType()} ${host(q.url())} ${q.failure()?.errorText ?? ""}`));
  page.on("response", (res) => { if (res.status() >= 400) notes.push(`HTTP ${res.status()} ${res.request().resourceType()} ${host(res.url())}`); });
  // 우리 도메인에서 연 것처럼 — 상대 주소(/api/img)가 DASH 로 간다
  const entry = `${DASH}/__probe_preview/${encodeURIComponent(id)}`;
  await page.route(entry, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await page.route(`${DASH}/api/img?*`, async (r) => {
    try {
      const u = new URL(new URL(r.request().url()).searchParams.get("u") ?? "");
      if (u.protocol !== "https:" || !allowed(u.hostname)) { notes.push(`img 프록시: 허용 안 된 호스트 ${u.hostname}`); return r.abort(); }
      const img = await fetch(u, { redirect: "error" });
      if (!img.ok) { notes.push(`img 프록시: ${u.hostname} HTTP ${img.status}`); return r.abort(); }
      await r.fulfill({ status: 200, contentType: img.headers.get("content-type") ?? "image/jpeg", body: Buffer.from(await img.arrayBuffer()) });
    } catch (e) {
      notes.push(`img 프록시: ${e instanceof Error ? e.message : e}`);
      await r.abort();
    }
  });
  await page.goto(entry, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__reportFiles));

  // 화면에서 이미 깨진 이미지·배경 — 종류만(공개 로그)
  const broken = await page.evaluate(() => {
    const kind = (u) => { if (!u) return "빈 주소"; if (u.startsWith("data:")) return u.slice(0, u.indexOf(";")) + ` ${Math.round(u.length / 1024)}KB`; try { const x = new URL(u, location.href); return x.origin === location.origin ? `같은 출처 ${x.pathname.split("/").slice(0, 3).join("/")}` : x.host; } catch { return "?"; } };
    const imgs = [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => `img(${kind(i.getAttribute("src"))})`);
    // html-to-image 가 다시 받아 오는 CSS 자원 — 배경·마스크·목록 기호·테두리 그림
    const PROPS = ["backgroundImage", "maskImage", "webkitMaskImage", "listStyleImage", "borderImageSource"];
    const bgs = [...document.querySelectorAll("*")].flatMap((el) => { const cs = getComputedStyle(el); return PROPS.map((k) => [k, cs[k]]); })
      .filter(([, v]) => v && v !== "none" && v.includes("url(")).map(([k, v]) => `${k}(${kind((v.match(/url\(["']?([^"')]+)/) || [])[1] || "")})`);
    return { imgs, bgs: [...new Set(bgs)], total: document.images.length };
  });
  if (broken.imgs.length) notes.push(`깨진 이미지 ${broken.imgs.length}/${broken.total}: ${broken.imgs.slice(0, 4).join(", ")}`);
  if (broken.bgs.length) notes.push(`CSS 그림: ${broken.bgs.slice(0, 4).join(", ")}`);

  let png;
  try {
    png = await page.evaluate(async () => {
      const toB64 = (b) => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = no; f.readAsDataURL(b); });
      let pages;
      try {
        pages = await window.__reportFiles.pngPages();
      } catch (e) {
        // 이미지 로드 실패는 Error 가 아니라 Event 로 온다 — 그대로 던지면 "Event" 한 단어뿐이다
        const t = e && e.target, src = t && (t.currentSrc || t.src || (t.getAttribute && t.getAttribute("href")));
        let where = "";
        // data: 면 형식과 크기만(내용은 안 찍는다) — 크롬이 못 읽는 형식(HEIC 등)이나 잘린 파일을 가려낸다
        try { where = src ? (src.startsWith("data:") ? `${src.slice(0, Math.min(40, src.indexOf(",") + 1 || 40))} ${Math.round(src.length / 1024)}KB` : new URL(src, location.href).host) : ""; } catch { where = "?"; }
        throw new Error(e && e.message ? e.message : `${(t && t.tagName) || ""} ${e && e.type || "이벤트"} ${where}`.trim());
      }
      const out = [];
      for (const p of pages) out.push({ no: p.no, b64: await toB64(p.blob) });
      return { pages: out, missed: window.__reportFiles.png.missed || 0 };
    });
  } catch (e) {
    await page.close();
    throw new Error(`PNG 를 만들지 못했습니다 — ${e instanceof Error ? e.message.replace(/^page\.evaluate: (Error: )?/, "") : e}${notes.length ? ` | ${[...new Set(notes)].slice(0, 6).join(" · ")}` : ""}`);
  }
  const staticHtml = await page.evaluate(() => window.__reportFiles.html());
  const htmlMissed = await page.evaluate(() => window.__reportFiles.html.missed || 0);
  await page.close();

  await mkdir(OUT_DIR, { recursive: true });
  const files = [];
  for (const p of png.pages) {
    const f = { name: `${name}_${p.no}.png`, buf: Buffer.from(p.b64, "base64") };
    await writeFile(path.join(OUT_DIR, f.name), f.buf);
    files.push(f);
  }
  const h = { name: `${name}.html`, buf: Buffer.from(staticHtml, "utf8") };
  await writeFile(path.join(OUT_DIR, h.name), h.buf);
  files.push(h);
  return { files, missed: Math.max(png.missed, htmlMissed) };
}

// ── 메시지 ────────────────────────────────────────────────────────────
const kst = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

function message(r, made) {
  const pngs = made.files.filter((f) => f.name.endsWith(".png")).length;
  return [
    `:page_facing_up: *매장 리포트 승인* — ${r.store_name || "매장"}${r.revision ? " *(수정본)*" : ""}`,
    `• ${r.title || r.id}`,
    `• 승인 ${r.approved_by || "-"} · ${r.approved_at ? kst(r.approved_at) : "-"}`,
    `• 파일 PNG ${pngs}장 · HTML (담당자 미리보기에서 받는 것과 같습니다)`,
    ...(made.missed ? [`:warning: 이미지 ${made.missed}개를 파일에 넣지 못했습니다 — 미리보기에서 다시 받아 주세요`] : []),
    `<${DASH}/dashboard/admin?tab=probe-reports&plan=${r.plan_id}|리포트 열기>`,
  ].join("\n");
}

// ── 슬랙 ──────────────────────────────────────────────────────────────
async function slack(method, init) {
  const res = await fetch(`https://slack.com/api/${method}`, { method: "POST", ...init, headers: { Authorization: `Bearer ${SLACK_TOKEN}`, ...(init.headers ?? {}) } });
  const d = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  if (!d.ok) throw new Error(`슬랙 ${method} 실패: ${d.error}${d.error === "not_in_channel" ? " — PROBE 가 채널에 초대돼 있는지 보세요" : ""}`);
  return d;
}

async function post(made, text) {
  const uploaded = [];
  for (const f of made.files) {
    const u = await slack("files.getUploadURLExternal", { body: new URLSearchParams({ filename: f.name, length: String(f.buf.length) }) });
    const fd = new FormData();
    fd.append("file", new Blob([f.buf]), f.name);
    const up = await fetch(u.upload_url, { method: "POST", body: fd });
    if (!up.ok) throw new Error(`파일 올리기 실패 HTTP ${up.status} — ${f.name}`);
    uploaded.push({ id: u.file_id, title: f.name });
  }
  await slack("files.completeUploadExternal", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ files: uploaded, channel_id: CHANNEL, initial_comment: text }),
  });
}

// ── 본체 ──────────────────────────────────────────────────────────────
const queue = (await backend("/api/probe/reports/slack-queue/")).reports ?? [];
let todo = ONLY_ID ? queue.filter((r) => r.id === ONLY_ID) : queue;
if (ONLY_ID && !todo.length) {
  if (!DRY_RUN) die(`${ONLY_ID} 는 큐에 없습니다(이미 올렸거나 승인 전) — 실제로 올리지 않습니다`);
  todo = [{ id: ONLY_ID, store_name: "", title: "", approved_by: "", approved_at: null, plan_id: "", revision: false }];
}
console.log(`올릴 리포트 ${todo.length}건${DRY_RUN ? " (dry_run — 만들기만)" : ""}`);
if (!todo.length) process.exit(0);

const browser = await chromium.launch({ channel: CHROME_CHANNEL });
let failed = 0;
for (const r of todo) {
  try {
    const made = await makeFiles(browser, r.id);
    const text = message(r, made);
    const pngs = made.files.filter((f) => f.name.endsWith(".png"));
    const kb = (fs) => Math.round(fs.reduce((a, f) => a + f.buf.length, 0) / 1024);
    console.log(`${r.id}${r.revision ? " (수정본)" : ""} — PNG ${pngs.length}장 ${kb(pngs)}KB · HTML ${kb(made.files.filter((f) => f.name.endsWith(".html")))}KB${made.missed ? ` · 이미지 ${made.missed}개 누락` : ""}`);
    if (SHOW_BODY) console.log(`${text}\n파일: ${made.files.map((f) => f.name).join(", ")}`);
    if (DRY_RUN) continue;
    await post(made, text);
    await backend(`/api/probe/reports/${encodeURIComponent(r.id)}/slack-posted/`, { method: "POST", body: JSON.stringify({ approved_at: r.approved_at }) });
    console.log(`${r.id} — #ops-partner 에 올렸습니다`);
  } catch (e) {
    failed++;
    console.error(`::error::${r.id} — ${e instanceof Error ? e.message : e}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
