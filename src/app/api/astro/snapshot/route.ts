import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken } from "@/lib/apiProxy";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { remoteGet } from "@/lib/draft/remote";
import type { BackendRestaurant, StoreOps } from "@/lib/draft/types";
import { sheetAppendTo, sheetReadFrom } from "@/lib/onboard/records";
import { notifyAstro } from "@/lib/slack";

/**
 * 월별 스냅샷 — **이번 달 숫자를 지금 떠 두지 않으면 다음 달에 되돌릴 수 없다.**
 *
 * 백엔드 `dashboard/stats` 는 `*_this_month` 만 준다. 지난달 값을 물어볼 자리가 없다.
 * 월간 리포트의 "전월 대비"는 그래서 만들 수 없었다 (0921 설계서 §5).
 * 사장님이 매장에서 직접 세어 본 것과 맞춰 보는 유일한 숫자라, 여기가 비면 리포트 전체가 의심받는다.
 *
 * 그래서 매달 말 한 번 시트에 박아 둔다. **원장이지 캐시가 아니다** — 같은 달을 다시 떠도
 * 덮어쓰지 않고 한 줄 더 쌓고, 읽을 때 그 달의 **마지막 줄**을 쓴다. 언제 몇 번 떴는지가 남는다.
 * (말일 전에 미리 떠 보고 말일에 다시 뜨는 게 실제 쓰임이다.)
 *
 *   GET   지금까지 뜬 달과 이번 달 상태만 본다 (쓰지 않는다)
 *   POST  { period?: "YYYY-MM" } 스냅샷을 뜬다. 기본값은 이번 달(서울 기준).
 */

const TAB = process.env.ASTRO_SNAPSHOT_TAB ?? "월별스냅샷";
const HEADER = ["period", "rid", "name", "campus", "tier", "monthly_fee", "coupon_redeemed", "stamp_earned", "revisit", "loyal_total", "taken_at", "by"];

const seoulNow = () => new Date(Date.now() + 9 * 3600 * 1000);
const thisPeriod = () => seoulNow().toISOString().slice(0, 7);

interface Stats { revisit_this_month?: number; loyal_total?: number; coupon_redeemed_this_month?: number; stamp_earned_this_month?: number }

async function readRows(): Promise<string[][]> {
  return (await sheetReadFrom(TAB, "A2:L20000").catch(() => [])).filter((r) => (r[0] ?? "").trim());
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (!process.env.ONBOARD_GSHEET_URL) return NextResponse.json({ ok: false, reason: "시트가 설정되지 않았습니다." });

  const rows = await readRows();
  const byPeriod = new Map<string, Set<string>>();
  let lastAt = "";
  for (const r of rows) {
    const p = (r[0] ?? "").trim();
    if (!byPeriod.has(p)) byPeriod.set(p, new Set());
    byPeriod.get(p)!.add(String(r[1] ?? ""));
    if ((r[10] ?? "") > lastAt) lastAt = r[10] ?? "";
  }
  const now = seoulNow();
  const period = thisPeriod();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return NextResponse.json({
    ok: true,
    period,
    /** 이번 달이 이미 떠 있나 */
    taken: byPeriod.get(period)?.size ?? 0,
    /** 남은 날 — 0이면 오늘이 말일이다 */
    days_left: lastDay - now.getDate(),
    periods: [...byPeriod.entries()].map(([p, s]) => ({ period: p, stores: s.size })).sort((a, b) => b.period.localeCompare(a.period)),
    last_at: lastAt || null,
  });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (!process.env.ONBOARD_GSHEET_URL) return NextResponse.json({ detail: "시트가 설정되지 않았습니다." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { period?: string };
  const period = /^\d{4}-\d{2}$/.test(b.period ?? "") ? b.period! : thisPeriod();

  const [backend, remote] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1", true),
    remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/"),
  ]);
  const ops = new Map<number, StoreOps>();
  if (remote.handled && remote.ok) for (const o of remote.data?.ops ?? []) ops.set(o.id, o);

  // 테스트 매장과 비제휴는 뺀다 — 리포트로 나갈 일이 없는 숫자를 원장에 쌓지 않는다
  const targets = (backend?.restaurants ?? []).filter((r) => r.is_affiliate && !ops.get(r.restaurant_id)?.is_test);
  if (!targets.length) return NextResponse.json({ detail: "대상 매장을 읽지 못했습니다." }, { status: 502 });

  const admin = await getAccessToken();
  const at = new Date().toISOString();
  const who = (await actorName()) ?? "unknown";

  // 헤더가 없으면 먼저 깐다 — 사람이 열었을 때 열 이름이 없으면 못 읽는다
  const existing = await sheetReadFrom(TAB, "A1:L1").catch(() => []);
  if (!existing.length || !(existing[0]?.[0] ?? "").trim()) await sheetAppendTo(TAB, HEADER);

  const rows: (string | number)[][] = [];
  const failed: string[] = [];
  // 매장 수십 곳이라 순차로 돈다 — 백엔드를 한꺼번에 때리지 않는다
  for (const r of targets) {
    const s = await fetch(backendUrl("/api/dashboard/stats/", `restaurant_id=${r.restaurant_id}`), { headers: { Authorization: `Bearer ${admin}` }, cache: "no-store" })
      .then(async (x) => (x.ok ? (((await x.json()) as { stats?: Stats }).stats ?? null) : null)).catch(() => null);
    if (!s) { failed.push(r.name); continue; }
    const o = ops.get(r.restaurant_id);
    rows.push([period, r.restaurant_id, r.name, o?.campus ?? "", r.tier ?? "", o?.monthly_fee ?? "",
      s.coupon_redeemed_this_month ?? 0, s.stamp_earned_this_month ?? 0, s.revisit_this_month ?? 0, s.loyal_total ?? 0, at, who]);
  }

  let written = 0;
  for (const row of rows) { if (await sheetAppendTo(TAB, row)) written++; }

  await notifyAstro(
    `:camera_with_flash: *${period} 월별 스냅샷* — ${written}곳 기록 · ${who}\n` +
    `• 쿠폰 사용 합계 ${rows.reduce((n, r) => n + Number(r[6]), 0).toLocaleString()} · 스탬프 적립 ${rows.reduce((n, r) => n + Number(r[7]), 0).toLocaleString()}\n` +
    (failed.length ? `• :warning: 지표를 못 읽은 ${failed.length}곳: ${failed.join(", ")}\n` : "") +
    `• 다음 달 리포트의 "전월 대비"가 이 줄을 씁니다`
  );

  return NextResponse.json({ ok: true, period, written, failed, total: targets.length });
}
