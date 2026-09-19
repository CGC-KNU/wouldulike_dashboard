#!/usr/bin/env node
/**
 * probe-bq-check — Probe 앱 지표의 BigQuery 4칸을 화면 없이 바로 뽑아 본다.
 *
 *   node --no-warnings --env-file=.env.local scripts/probe-bq-check.mts
 *
 * Node 22.18 이상(TypeScript 타입 제거 내장)이 필요하다. `.env.local` 에 GCP_SA_KEY 가 있어야 한다.
 * 라우트(`/api/probe/app`)와 같은 함수를 부르므로 여기서 나온 숫자가 화면에 그대로 뜬다.
 */
import { readGa4AppMetrics } from "../src/lib/bigquery/appMetrics.ts";

const r = await readGa4AppMetrics().catch((e: unknown) => ({ ok: false as const, reason: "error" as const, detail: e instanceof Error ? e.message : String(e) }));
if (!r.ok) {
  console.error(r.reason === "no_key" ? "GCP_SA_KEY 가 없습니다 — .env.local 에 서비스 계정 JSON(또는 base64)을 넣으세요." : `조회 실패: ${r.detail}`);
  process.exit(1);
}
const d = r.data;
console.log(`확정 테이블 ${d.through} 까지`);
console.log(`주간 활성(WAU)       ${d.wau?.toLocaleString() ?? "-"}명   (${d.week.from} ~ ${d.week.to})`);
console.log(`DAU/WAU              ${d.dau_wau ?? "-"}%`);
console.log(`앱 열기 → 매장 상세  ${d.open_to_store ?? "-"}%   (세션 ${d.sessions.toLocaleString()}개)`);
console.log(`가입 1주 후 복귀     ${d.retention_w1 ?? "-"}%   (${d.cohort.from} ~ ${d.cohort.to} 첫 실행 ${d.cohort.users.toLocaleString()}대)`);
console.log(`푸시 → 앱 열기      ${d.push_open ?? "-"}%   (${d.push.from} ~ ${d.push.to} 안드로이드 수신 ${d.push.received} · 열기 ${d.push.opened_android} · iOS 열기 ${d.push.opened_ios})`);
console.log(`배너 클릭 → 쿠폰 사용 ${d.banner_to_coupon ?? "-"}%   (${d.banner.from} ~ ${d.banner.to} 클릭 기기 ${d.banner.clicked} 중 ${d.banner.redeemed})`);
