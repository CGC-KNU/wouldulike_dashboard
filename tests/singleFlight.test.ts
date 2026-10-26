import test from "node:test";
import assert from "node:assert/strict";
import { singleFlight } from "../src/lib/draft/singleFlight";

/**
 * 만드는 중이면 같이 기다린다(1027) — `/api/probe/insights` · `/api/probe/overview` 가 이걸 거친다.
 * 런처 · Probe 홈 · 그 화면이 거의 동시에 불러도 백엔드를 한 벌만 부르는지 본다.
 */

/** 손으로 끝낼 수 있는 일 — 몇 번 시작됐는지 센다 */
function job() {
  let started = 0;
  const ends: ((v: number) => void)[] = [];
  const fails: ((e: Error) => void)[] = [];
  const fn = () => {
    started++;
    return new Promise<number>((res, rej) => { ends.push(res); fails.push(rej); });
  };
  return { fn, started: () => started, end: (i: number, v: number) => ends[i](v), fail: (i: number) => fails[i](new Error("boom")) };
}

test("진행 중이면 새로 시작하지 않고 같은 결과를 같이 받는다", async () => {
  const j = job();
  const run = singleFlight(j.fn);
  const a = run(), b = run(), c = run();
  assert.equal(j.started(), 1);
  j.end(0, 7);
  assert.deepEqual(await Promise.all([a, b, c]), [7, 7, 7]);
});

test("끝난 뒤에는 새로 시작한다 — 결과를 오래 들고 있지 않는다(기억은 라우트의 cached 몫)", async () => {
  const j = job();
  const run = singleFlight(j.fn);
  const a = run(); j.end(0, 1); await a;
  const b = run();
  assert.equal(j.started(), 2);
  j.end(1, 2);
  assert.equal(await b, 2);
});

test("join=false(다시 읽기)는 진행 중인 것을 기다리지 않고, 그 뒤 들어온 요청은 새 쪽에 붙는다", async () => {
  const j = job();
  const run = singleFlight(j.fn);
  const old = run();
  const fresh = run(false);
  const later = run();
  assert.equal(j.started(), 2);
  j.end(0, 1); j.end(1, 2);
  assert.deepEqual(await Promise.all([old, fresh, later]), [1, 2, 2]);
});

test("실패는 같이 받고, 다음 호출은 새로 시작한다", async () => {
  const j = job();
  const run = singleFlight(j.fn);
  const a = run(), b = run();
  j.fail(0);
  await assert.rejects(a);
  await assert.rejects(b);
  const c = run();
  assert.equal(j.started(), 2);
  j.end(1, 3);
  assert.equal(await c, 3);
});
