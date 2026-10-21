import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { buildAppSeries } from "@/lib/draft/appSeries";
import { defaultRange, kstToday, parseRange } from "@/lib/draft/appRange";
import { seriesRow } from "@/lib/draft/appSeriesData";

/**
 * Probe · 앱 지표 머리 KPI 의 **12주 추이** — 「주요 지표 보고서」(/r/app/key)와 같은 칸 계산을 한 번 돌려 6시간 기억한다(1022 목업).
 *
 * 칸마다 BigQuery 를 부르는 계산이라 10~20초 걸린다 — 그래서 앱 지표 화면의 본 응답(/api/probe/app)과 따로 두고,
 * 화면이 KPI 를 먼저 그린 뒤 이 응답이 오면 선을 얹는다. 못 만들면 선만 없고 KPI 는 그대로다(0 으로 그리지 않는다).
 *
 * 값은 지난 일요일까지 끝난 12주(주 단위). 「쓴 사람」은 주 단위 고유 계정이라 KPI 의 「이번 달」 값과 단위가 다르다 — 화면이 그렇게 적는다.
 * 비율(WAU/MAU)은 칸의 활성 기기 ÷ 30일 활성 기기를 다시 나눈다.
 */
export const maxDuration = 60;

type Pt = number | null;
export interface TrendPayload {
  range: string;
  weeks: { start: string; end: string }[];
  series: Record<"wau" | "open_to_store" | "users_redeemed" | "wau_mau", Pt[]>;
  generated_at: string;
}

let cached: { at: number; body: TrendPayload } | null = null;
const TTL = 6 * 60 * 60_000;

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json(cached.body);

  const today = kstToday();
  const parsed = parseRange(defaultRange(today), today);
  if (!parsed.ok) return NextResponse.json({ detail: parsed.error }, { status: 500 });
  try {
    const s = await buildAppSeries(parsed.spec);
    const col = (key: string): Pt[] => (seriesRow(s, key)?.cells ?? s.buckets.map(() => ({ v: null }))).map((c) => c.v);
    const active = col("active"), mau = col("mau");
    const body: TrendPayload = {
      range: `${+parsed.spec.start.slice(4, 6)}/${+parsed.spec.start.slice(6, 8)}~${+parsed.spec.end.slice(4, 6)}/${+parsed.spec.end.slice(6, 8)} · 주 단위 ${s.buckets.length}칸`,
      weeks: s.buckets.map((b) => ({ start: b.start, end: b.end })),
      series: {
        wau: active,
        open_to_store: col("open_to_store"),
        users_redeemed: col("users_redeemed"),
        wau_mau: active.map((a, i) => (a !== null && mau[i] ? Math.round((a / (mau[i] as number)) * 1000) / 10 : null)),
      },
      generated_at: new Date().toISOString(),
    };
    // 한 칸도 못 읽은 추이는 기억하지 않는다 — 6시간 동안 빈 선이 남는다
    if (Object.values(body.series).some((v) => v.some((x) => x !== null))) cached = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    console.error("[probe/app/trend]", e);
    return NextResponse.json({ detail: "추이를 만들지 못했습니다." }, { status: 503 });
  }
}
