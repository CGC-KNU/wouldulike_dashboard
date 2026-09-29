import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { driveUpload, postActivity, sheetAppend } from "@/lib/onboard/records";

/**
 * 온보딩 기록 통로 진단 (관리자만). 세 사본이 지금 살아 있는지 실제로 써 본다.
 *   시트  → `_진단` 탭에 한 줄 (본 원장 탭은 건드리지 않는다)
 *   드라이브 → 작은 txt 하나
 *   백엔드 → 매장 0 에 활동기록 (target 0 은 실제 매장이 아니다)
 * 0929 일공초밥 동의 실패 때 "왜" 를 알 길이 없어서 만들었다. 결과는 사유 문자열 그대로.
 */
export async function POST() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const at = new Date().toISOString();
  const [sheet, drive, activity] = await Promise.all([
    sheetAppend([at, "diag", "진단", 0, "", "진단", "", "", 0], "_진단").catch((e) => `시트 ${(e as Error).message}`),
    driveUpload(`_진단_${at.replace(/[:.]/g, "")}.txt`, `diag ${at}`, "text/plain").catch((e) => ({ url: null, err: `드라이브 ${(e as Error).message}` })),
    postActivity("", 0, "진단", `diag ${at}`, "diag").catch((e) => `백엔드 ${(e as Error).message}`),
  ]);
  return NextResponse.json({ at, sheet: sheet === true ? "ok" : sheet, drive: drive.url ? "ok" : drive.err, activity: activity === true ? "ok" : activity });
}
