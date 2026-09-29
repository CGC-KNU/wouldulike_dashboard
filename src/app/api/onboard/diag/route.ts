import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { driveUpload, postActivity, sheetAppend } from "@/lib/onboard/records";
import { linkSessionReady } from "@/lib/onboard/linkSession";
import { signOnboardToken } from "@/lib/onboard/token";
import { backendUrl } from "@/lib/apiProxy";
import { getAccessToken } from "@/lib/apiProxy";

/**
 * 온보딩 기록 통로 진단 (관리자만). 세 사본이 지금 살아 있는지 실제로 써 본다.
 *   시트  → `_진단` 탭에 한 줄 (본 원장 탭은 건드리지 않는다)
 *   드라이브 → 작은 txt 하나
 *   백엔드 → 매장 0 에 활동기록 (target 0 은 실제 매장이 아니다)
 * 0929 일공초밥 동의 실패 때 "왜" 를 알 길이 없어서 만들었다. 결과는 사유 문자열 그대로.
 */
export async function POST(req: NextRequest) {
  // ?tab=원장탭 이면 실제 원장 탭에 kind=diag 행을 1줄 쓴다 — 현황판은 consent/complete/revise 만 읽으므로 무시된다.
  const tab = req.nextUrl.searchParams.get("tab") || "_진단";
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const at = new Date().toISOString();
  const [sheet, drive, activity] = await Promise.all([
    sheetAppend([at, "diag", "진단", 0, "", "진단", "", "", 0], tab).catch((e) => `시트 ${(e as Error).message}`),
    driveUpload(`_진단_${at.replace(/[:.]/g, "")}.txt`, `diag ${at}`, "text/plain").catch((e) => ({ url: null, err: `드라이브 ${(e as Error).message}` })),
    postActivity("", 0, "진단", `diag ${at}`, "diag").catch((e) => `백엔드 ${(e as Error).message}`),
  ]);
  /**
   * 설정 지문 + 읽기 시험 (0929). Vercel 의 값은 Sensitive 라 밖에서 못 본다 — 서버 안에서
   * 같은 값으로 `sheets`(탭 목록)·`read`(헤더) 를 해 보고, 값은 앞 몇 글자만 보여 준다.
   * 비서 쪽 창구(coggiri629)는 같은 시트를 잘 읽는다: 여기가 다르면 Vercel 값이 다른 것이다.
   */
  const url = process.env.ONBOARD_GSHEET_URL ?? "", id = process.env.ONBOARD_GSHEET_ID ?? "", token = process.env.ONBOARD_GSHEET_TOKEN ?? "";
  const tabName = process.env.ONBOARD_GSHEET_TAB ?? "(기본 온보딩기록)";
  const dep = /\/macros\/s\/([^/]+)\//.exec(url)?.[1] ?? "";
  const probe = async (body: Record<string, unknown>) => {
    if (!url) return "URL 없음";
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, token }), redirect: "follow", cache: "no-store" });
      const t = await r.text();
      try { const j = JSON.parse(t) as { ok?: boolean; error?: string; sheets?: string[]; values?: unknown[][] }; return j.ok ? (j.sheets ? `ok 탭 ${j.sheets.length}개: ${j.sheets.slice(0, 6).join(", ")}` : `ok ${JSON.stringify(j.values?.[0] ?? []).slice(0, 80)}`) : `실패 ${j.error ?? ""}`; }
      catch { return `JSON 아님 (${r.status}) ${t.slice(0, 60)}`; }
    } catch (e) { return `연결 실패 ${(e as Error).message}`; }
  };
  const [tabs, header] = await Promise.all([probe({ op: "sheets", id }), probe({ op: "read", id, range: `${process.env.ONBOARD_GSHEET_TAB ?? "온보딩기록"}!A1:F1` })]);
  return NextResponse.json({
    at, sheet: sheet === true ? "ok" : sheet, drive: drive.url ? "ok" : drive.err, activity: activity === true ? "ok" : activity,
    config: { gsheet_id_prefix: id.slice(0, 6), gsheet_deploy_prefix: dep.slice(0, 10), token_len: token.length, tab: tabName, drive_deploy_prefix: (/\/macros\/s\/([^/]+)\//.exec(process.env.ONBOARD_DRIVE_URL ?? "")?.[1] ?? "").slice(0, 10) },
    sheet_tabs: tabs, sheet_header: header,
    // 임시 PIN 없이 링크로 로그인하는 길 — false 면 Koyeb 에 ONBOARD_SECRET 이 없다
    link_session_ready: await linkSessionReady(await getAccessToken()),
    // 열쇠 일치 — 없는 매장(16777215)으로 서명해 보낸다. 서명이 맞으면 "매장을 찾을 수 없습니다", 다르면 "서명". 계정은 안 생긴다.
    key_match: await (async () => {
      const { token } = signOnboardToken({ rid: 16777215, lid: null, name: "진단", campus: "진단", plan: "FREE", fee: 0, days: 1 });
      const r = await fetch(backendUrl("/api/dashboard/auth/onboard-session/"), { method: "POST", headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" }).catch(() => null);
      const j = r ? ((await r.json().catch(() => ({}))) as { reason?: string; message?: string }) : {};
      return j.reason === "서명" ? "다름" : (j.message ?? "").includes("매장 정보") ? "같음" : `알 수 없음 ${r?.status ?? ""} ${j.reason ?? j.message ?? ""}`;
    })(),
  });
}
