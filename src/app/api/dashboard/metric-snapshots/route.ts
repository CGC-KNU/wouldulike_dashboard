import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken } from "@/lib/apiProxy";

/**
 * 월별 지표 스냅샷 읽기 — 백엔드가 굳혀 둔 값을 그대로 가져온다.
 *
 * ⚠️ 여기서 세지 않는다. 세는 법은 백엔드 `dashboard/services/metric_snapshots.py` 한 벌뿐이고,
 * 화면과 스냅샷이 따로 세면 언젠가 갈라진다(그 파일 머리말). 굳히는 것도 GitHub Actions 가
 * 매일 돌린다(`.github/workflows/metric-snapshots.yml` → `internal/snapshot-metrics/`).
 *
 * 0923 에 나도 시트로 같은 걸 만들었다가 지웠다 — 백엔드 쪽이 기간을 받아 과거를 다시 셀 수 있고,
 * 누계 칸을 기간 끝으로 잘라(`__lt=end`) 되셀 때 과거가 오염되지 않는다. 내 시트 판에는 그게 없었다.
 * 같은 숫자를 두 곳에서 세는 것이 제일 나쁘다.
 */
export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const period = req.nextUrl.searchParams.get("period");
  const token = await getAccessToken();
  const res = await fetch(backendUrl("/api/dashboard/admin/metric-snapshots/", period ? `period=${period}` : undefined), {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
