import { NextResponse } from "next/server";
import { checkCronToken, plausibleCronToken } from "@/lib/draft/cronAuth";
import { buildInsights } from "@/lib/draft/insights";
import { fetchReportData } from "@/lib/draft/papillon";
import { createReportDraft } from "@/lib/draft/reportCreate";
import { draftMessage, reporterMentions } from "@/lib/draft/reportAutoMessage";
import { originOf } from "@/lib/draft/reportPage";
import { listReports } from "@/lib/draft/reportStore";
import { mintServiceToken, withServiceToken } from "@/lib/draft/serviceAuth";
import { normName } from "@/lib/draft/sheet";
import type { StoreReport } from "@/lib/draft/types";

/**
 * 게시 14일차가 되면 매장 리포트 초안을 사람 없이 만든다 — **크론 전용** (민찬 1007).
 *
 * POST /api/probe/reports/auto[?dry=1]   Header: X-CRON-TOKEN
 *
 * 흐름: 크론 토큰 확인(백엔드) → 백엔드가 내준 15분짜리 서비스 토큰(serviceAuth.ts)으로 「Papillon 게시물」 목록을 읽고 →
 * 14일차 숫자가 찍힌 게시물 중 리포트가 한 번도 없던 것만 초안으로 만든다. 만든 것마다 #ops-partner 에 올릴 메시지를 돌려주고,
 * 슬랙에 올리는 건 GitHub Actions 가 한다(probe-report-auto.yml — 이 저장소가 공개라 로그에는 id 와 개수만).
 *
 * 걸러내는 규칙:
 *  · 14일차 숫자(report-data 의 day=14)가 아직 없으면 만들지 않는다 — 7일차 숫자로 굳으면 「14일차 보고」가 거짓이 된다.
 *    정밀 수집이 3시간마다 돌아 게시 14일이 지난 직후에 찍힌다. 내일 다시 보면 된다.
 *  · 14~16일차만 본다. 더 오래된 게시물을 지금 와서 채우지 않고, 사람이 지운 초안이 몇 주 뒤 되살아나지도 않는다.
 *  · 같은 게시물·매장에 리포트가 있으면(회수된 것 포함) 만들지 않는다 — 사람이 이미 다뤘다.
 *  · 앱 매장이거나 협찬 매장으로 잡힌 게시물만. 매장 표에서 이름을 못 찾은 괄호는 사람이 정리해야 한다.
 *
 * 14일차 #ops-partner 알림은 이 메시지 하나다(1008) — 백엔드의 「14일 경과」 알림을 여기로 합쳤다(reportAutoMessage.ts).
 */

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const MIN_AGE = 14, MAX_AGE = 16;

export async function POST(req: Request) {
  const token = req.headers.get("x-cron-token");
  if (!plausibleCronToken(token)) return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });
  const base = process.env.NEXT_PUBLIC_API_URL;
  const check = await checkCronToken(base, token, todayKst());
  if (check === "denied") return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });
  if (check === "unreachable") return NextResponse.json({ detail: "백엔드에 토큰을 확인하지 못했습니다 — 백엔드가 떠 있는지 보세요." }, { status: 502 });
  const svc = await mintServiceToken(base, token);
  if (!svc) return NextResponse.json({ detail: "백엔드가 자동 초안용 토큰을 내주지 않았습니다 — 백엔드가 이 길(auto-token)을 아는 버전인지 보세요." }, { status: 502 });

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  // 부를 사람 — 워크플로가 저장소 변수 SLACK_PARTNER_REPORTERS 를 헤더로 넘긴다(1008). 비면 환경변수 · 기본값.
  const mentions = reporterMentions(req.headers.get("x-partner-reporters")?.trim() || undefined);
  const origin = originOf(req);

  return withServiceToken(svc, async () => {
    const list = await buildInsights();
    if (!list.papillon_reachable) return NextResponse.json({ detail: "Papillon 기획 목록을 읽지 못했습니다." }, { status: 502 });
    let reports: StoreReport[];
    try { reports = await listReports(); } catch { return NextResponse.json({ detail: "리포트 목록을 읽지 못했습니다." }, { status: 502 }); }

    const due = list.insights.filter((i) => (i.restaurant_id !== null || i.matched_by === "sponsor") && i.available && i.age_days !== null && i.age_days >= MIN_AGE && i.age_days <= MAX_AGE);
    const created: { id: string; text: string }[] = [];
    const wait: number[] = [];   // 14일차 숫자가 아직 없어 내일로 미룬 기획 번호
    const failed: { plan_id: number; detail: string }[] = [];
    let had = 0;
    for (const i of due) {
      const mine = reports.some((x) => x.plan_id === i.plan_id && (i.restaurant_id !== null ? x.restaurant_id === i.restaurant_id : x.restaurant_id === null && normName(x.snapshot?.store?.name ?? "") === normName(i.store)));
      if (mine) { had++; continue; }
      const rd = await fetchReportData(i.plan_id);
      if (!rd?.available || rd.day !== 14) { wait.push(i.plan_id); continue; }
      if (dry) { created.push({ id: `(dry) plan ${i.plan_id}`, text: "" }); continue; }
      const out = await createReportDraft({ restaurant_id: i.restaurant_id, store_name: i.restaurant_id === null ? i.store : undefined, plan_id: i.plan_id, actor: "Probe 자동" });
      if (!out.ok) { failed.push({ plan_id: i.plan_id, detail: out.detail }); continue; }
      created.push({ id: out.report.id, text: draftMessage(out.report, origin, mentions) });
    }
    return NextResponse.json({ dry, checked: list.insights.length, due: due.length, had_report: had, waiting_d14: wait, created, failed }, { status: failed.length ? 207 : 200 });
  });
}
