#!/usr/bin/env node
/**
 * castor-parse — Next.js(App Router) 코드에서 화면 그래프를 뽑는다.
 *
 *   node scripts/castor-parse.mjs                 # graph.json 만 만든다
 *   node scripts/castor-parse.mjs --post          # 만들고 로컬 Castor 로 밀어넣는다
 *   CASTOR_INGEST=https://.../api/castor/graph CASTOR_INGEST_TOKEN=... node scripts/castor-parse.mjs --post
 *
 * `--post` 는 `/api/castor/graph` 가 인증을 요구하므로 둘 중 하나가 필요하다:
 *   · CASTOR_INGEST_TOKEN — 서버 env 와 같은 값 (CI 용)
 *   · CASTOR_COOKIE       — 로그인한 브라우저의 `access_token=...` (로컬용)
 *   로컬 미리보기(ASTRO_PREVIEW=1)에서는 둘 다 없어도 된다.
 *
 * 설계 원칙 두 가지.
 *
 * 1) **빌드 산출물을 먼저 본다.** `next build` 가 라우트 목록을 파일로 뱉으므로
 *    정규식으로 코드를 뒤지는 것보다 정확하다. 없으면 `src/app/**​/page.tsx` 글롭으로 떨어진다.
 *
 * 2) **완벽하지 않다는 걸 전제로 만든다.** 변수로 만든 경로(`router.push(url)`)나 조건부
 *    렌더는 정적 분석으로 못 잡는다. 못 잡은 것은 `unresolved` 에 세어서 화면에 그대로 보여준다.
 *    숨기면 사람이 지도를 믿어버리고, 지도가 틀렸다는 걸 늦게 안다.
 *
 * 의존성 없음 — CI 에 한 줄 얹으면 끝이다.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

/* ─── 1. 화면(노드) 수집 ─── */

function fromManifest() {
  const p = path.join(ROOT, ".next", "app-path-routes-manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    // { "/dashboard/admin/page": "/dashboard/admin", ... }
    return Object.entries(raw)
      .filter(([k]) => k.endsWith("/page"))
      .map(([k, route]) => ({
        route,
        file: path.join("src", "app", `${k.replace(/\/page$/, "")}/page.tsx`).replace(/\/\//g, "/"),
      }));
  } catch {
    return null;
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "page.tsx" || entry.name === "page.ts") out.push(full);
  }
  return out;
}

function fromGlob() {
  if (!fs.existsSync(APP_DIR)) return [];
  return walk(APP_DIR).map((file) => {
    const rel = path.relative(APP_DIR, path.dirname(file));
    // 라우트 그룹 `(admin)` 은 URL 에 나타나지 않는다
    const route =
      "/" +
      rel
        .split(path.sep)
        .filter((seg) => seg && !/^\(.*\)$/.test(seg))
        .join("/");
    return { route: route === "/" ? "/" : route.replace(/\/$/, ""), file: path.relative(ROOT, file) };
  });
}

/** 라우트를 안정적인 id 로 — `/dashboard/admin` → `dashboard.admin` */
function routeId(route) {
  const s = route.replace(/^\//, "").replace(/\[|\]|\.\.\./g, "").replace(/\//g, ".");
  return s || "root";
}

/* ─── 2. 이동(엣지) · 블록 추출 ─── */

const LINK_RE = /<Link\s[^>]*href\s*=\s*(?:"([^"]+)"|\{`([^`$]+)`\})/g;
const PUSH_RE = /router\.(push|replace)\(\s*(?:"([^"]+)"|`([^`$]+)`|([A-Za-z_$][\w$]*))/g;
const REDIRECT_RE = /\bredirect\(\s*"([^"]+)"/g;
/** 최상위 JSX 자식 후보 = 대문자로 시작하는 컴포넌트 태그. 배치를 바꾸는 단위로 쓴다. */
const BLOCK_RE = /<([A-Z][A-Za-z0-9_]*)[\s/>]/g;

const NOISE_BLOCKS = new Set(["Suspense", "Fragment", "Image", "Link", "Script", "Head"]);

function analyze(file) {
  let src = "";
  try {
    src = fs.readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    return { targets: [], blocks: [], unresolved: 0 };
  }

  const targets = [];
  let m;
  while ((m = LINK_RE.exec(src))) targets.push({ to: m[1] ?? m[2], kind: "Link", trigger: "Link" });
  let unresolved = 0;
  while ((m = PUSH_RE.exec(src))) {
    const literal = m[2] ?? m[3];
    if (literal) targets.push({ to: literal, kind: `router.${m[1]}`, trigger: `router.${m[1]}` });
    else unresolved += 1; // 변수로 만든 경로 — 정적으로 못 잡는다
  }
  while ((m = REDIRECT_RE.exec(src))) targets.push({ to: m[1], kind: "redirect", trigger: "redirect()" });

  const blocks = [];
  while ((m = BLOCK_RE.exec(src))) {
    const name = m[1];
    if (!NOISE_BLOCKS.has(name) && !blocks.includes(name)) blocks.push(name);
  }

  return { targets, blocks: blocks.slice(0, 24), unresolved };
}

/* ─── 3. 조건 분기(가드) ─── */

function guards() {
  const out = [];
  for (const p of ["src/middleware.ts", "middleware.ts"]) {
    const full = path.join(ROOT, p);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, "utf8");
    const matcher = src.match(/matcher\s*:\s*\[([^\]]+)\]/);
    if (matcher) {
      for (const raw of matcher[1].split(",")) {
        const v = raw.trim().replace(/^["'`]|["'`]$/g, "");
        if (v) out.push({ match: v, rule: "middleware", from: p });
      }
    }
  }
  return out;
}

/* ─── 4. 조립 ─── */

function titleOf(route) {
  const last = route.split("/").filter(Boolean).pop();
  return last ? last.replace(/\[|\]/g, "") : "홈";
}

function commit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// Next 내부 라우트(`/_not-found` 등)는 사람이 다니는 화면이 아니다
const pages = (fromManifest() ?? fromGlob()).filter((p) => !p.route.startsWith("/_"));
const byRoute = new Map(pages.map((p) => [p.route, p]));

const screens = [];
const edges = [];
let unresolvedTotal = 0;

for (const p of pages) {
  const { targets, blocks, unresolved } = analyze(p.file);
  unresolvedTotal += unresolved;
  screens.push({
    id: routeId(p.route),
    route: p.route,
    file: p.file,
    title: titleOf(p.route),
    blocks,
  });
  for (const t of targets) {
    if (!t.to || t.to.startsWith("http") || t.to.startsWith("#")) continue;
    const clean = t.to.split("?")[0].replace(/\/$/, "") || "/";
    // 정확히 일치하는 라우트가 없으면 접두사가 가장 긴 라우트로 붙인다 (동적 세그먼트 대응)
    let target = byRoute.get(clean);
    if (!target) {
      const cands = pages
        .filter((q) => clean.startsWith(q.route) && q.route !== "/")
        .sort((a, b) => b.route.length - a.route.length);
      target = cands[0];
    }
    if (!target) continue;
    const edge = { from: routeId(p.route), to: routeId(target.route), trigger: t.trigger, kind: t.kind };
    if (!edges.some((e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind)) edges.push(edge);
  }
}

const graph = {
  version: new Date().toISOString(),
  source: { repo: path.basename(ROOT), commit: commit(), framework: "next@app-router" },
  generated_at: new Date().toISOString(),
  screens,
  edges,
  guards: guards(),
  unresolved: unresolvedTotal,
  parsed_from: fromManifest() ? "build-manifest" : "glob",
};

const outPath = path.join(ROOT, "graph.json");
fs.writeFileSync(outPath, JSON.stringify(graph, null, 2));
console.log(
  `화면 ${screens.length} · 이동 ${edges.length} · 가드 ${graph.guards.length} · 못 잡은 이동 ${unresolvedTotal}`
);
console.log(`→ ${path.relative(ROOT, outPath)} (${graph.parsed_from})`);

if (process.argv.includes("--post")) {
  const url = process.env.CASTOR_INGEST ?? "http://localhost:3000/api/castor/graph";
  try {
    const res = await fetch(url, {
      method: "POST",
      // 미들웨어가 로그인으로 돌려보내면 그 302 를 따라가서 '성공'으로 읽는 사고를 막는다
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        // CI 에는 사용자 쿠키가 없다. 라우트가 X-Castor-Token 을 대신 받는다.
        ...(process.env.CASTOR_INGEST_TOKEN ? { "X-Castor-Token": process.env.CASTOR_INGEST_TOKEN } : {}),
        ...(process.env.CASTOR_COOKIE ? { Cookie: process.env.CASTOR_COOKIE } : {}),
      },
      body: JSON.stringify(graph),
    });
    if (res.status >= 300 && res.status < 400) {
      console.log(`반영 실패 — 인증에 막혔습니다 (${res.status} → ${res.headers.get("location")}).`);
      console.log(`CASTOR_INGEST_TOKEN 을 서버와 같은 값으로 넣거나, 로그인 쿠키를 CASTOR_COOKIE 로 주세요.`);
    } else {
      console.log(res.ok ? `Castor 에 반영했습니다 (${url})` : `반영 실패 — HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`반영 실패 — ${e.message}. 서버가 떠 있는지 확인하세요.`);
  }
}
