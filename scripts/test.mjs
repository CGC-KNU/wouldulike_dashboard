#!/usr/bin/env node
/**
 * 테스트 — `npm test`.
 *
 * Next 앱이라 테스트 러너가 따로 없다. tests/*.test.ts 를 esbuild 로 한 덩이로 묶어 node --test 로 돌린다
 * (CI 의 Node 20 은 TypeScript 를 그대로 못 읽는다). 브라우저·서버 의존이 없는 순수 로직만 다룬다.
 */
import { build } from "esbuild";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const entries = (await readdir(path.join(root, "tests"))).filter((f) => f.endsWith(".test.ts")).map((f) => path.join(root, "tests", f));
if (!entries.length) { console.error("tests/*.test.ts 가 없습니다"); process.exit(1); }

// 저장소 안에 짓는다 — 임시 폴더에 두면 external 모듈(next 등)을 못 찾는다
const out = path.join(root, "node_modules/.cache/wdl-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await build({ entryPoints: entries, outdir: out, bundle: true, platform: "node", format: "cjs", target: "node20", logLevel: "error", external: ["next", "next/*", "react", "@google-cloud/bigquery"] });
const built = (await readdir(out)).filter((f) => f.endsWith(".js")).map((f) => path.join(out, f));
const r = spawnSync(process.execPath, ["--test", ...built], { stdio: "inherit" });
process.exit(r.status ?? 1);
