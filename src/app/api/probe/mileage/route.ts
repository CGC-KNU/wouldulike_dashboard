import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";

/**
 * Probe · 마일리지 추첨 운영.
 *
 * 규칙 출처: 계약 v6 제8~10조 + #ops-mileage 결정(0906 민찬: 수·금 주 2회 20시, 회당 5,000원 1건 + 10,000원 1건).
 * 9월은 1주차 추첨 없음, 추석 주간 적립분은 4주차에 몰아 방출 + 상품 2배(0902 재민 서버 반영).
 * 응모풀 정본 소스(앱 DB → 시트)는 아직 없다. 지금은 회차마다 사람이 시트 '응모풀' 탭에 붙여넣고
 * `mileageDrawManual` 을 돌린다. 9/2·9/4·9/9 세 번 연속 응모풀이 비어 추첨이 보류됐다 — 이 화면이 그걸 먼저 보이게 한다.
 *
 * 회차 기록은 초안 저장소(`probe_mileage`). 시트가 정본이고 여기는 '확인했다'는 사람의 기록이다.
 */

interface MileageRound {
  id: string; // YYYY-MM-DD
  date: string;
  weekday: "수" | "금";
  seats: { fixed: number; random: number };
  prizes: string; // "5,000원 1 · 10,000원 1"
  pool_count: number | null; // null = 아직 확인 안 함
  pool_checked_by: string | null;
  pool_checked_at: string | null;
  result: "scheduled" | "drawn" | "held" | "skipped";
  note: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

const MILEAGE_SHEET = "https://docs.google.com/spreadsheets/d/19WPLGHF5R1A_0gDCoItpR2oVKZrdRQnCVZIZX9FKbJ8";
const MILEAGE_SLACK = "ops-mileage";

const KEY = "probe_mileage";

/** 이번 달 수·금 회차를 만든다. 9월은 1주차(9/1~9/5) 없음. 기록된 결과는 #ops-mileage 게시 기준. */
function seedRounds(): MileageRound[] {
  const known: Record<string, Partial<MileageRound>> = {
    "2026-09-02": { result: "held", pool_count: 0, note: "응모풀 비어 보류 (1주차 미운용 정책과 별개로 봇 알림)", seats: { fixed: 0, random: 0 } },
    "2026-09-04": { result: "held", pool_count: 0, note: "응모풀 비어 보류", seats: { fixed: 1, random: 0 } },
    "2026-09-09": { result: "held", pool_count: 0, note: "응모풀 비어 보류 — 민찬 '어디서 캡쳐하면 돼?' 미해결", seats: { fixed: 1, random: 0 } },
  };
  const out: MileageRound[] = [];
  const y = 2026, m = 8; // 2026-09
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(y, m, d);
    const wd = dt.getDay();
    if (wd !== 3 && wd !== 5) continue;
    const id = `${y}-09-${String(d).padStart(2, "0")}`;
    const k = known[id] ?? {};
    out.push({
      id, date: id, weekday: wd === 3 ? "수" : "금",
      seats: k.seats ?? { fixed: 0, random: 2 },
      prizes: "5,000원 1 · 10,000원 1",
      pool_count: k.pool_count ?? null,
      pool_checked_by: null, pool_checked_at: null,
      result: k.result ?? (d <= 5 ? "skipped" : "scheduled"),
      note: k.note ?? (d <= 5 ? "9월 1주차는 추첨 없음 (0902 확정)" : d >= 21 && d <= 27 ? "추석 주간 적립분 몰아 방출 · 상품 2배" : null),
      updated_by: null, updated_at: null,
    });
  }
  return out;
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rounds = readDraft<MileageRound[]>(KEY, seedRounds);
  return NextResponse.json({
    rounds,
    rules: {
      cadence: "수 · 금 20:00 (주 2회)",
      prizes: "회당 5,000원 1건 + 10,000원 1건 (0906 확정)",
      seats_month: "9~10월 5:5 · 11~12월 8:7 · 1~2월 7:6 · 3~8월 6:6 (연 148석)",
      fixed_rule: "확정석 = 미당첨 회차수 많은 순 → 첫 적립일 빠른 순, 응모권 수 무관",
      random_rule: "랜덤석 = 응모권 가중 추첨 · 재당첨 락 4주(금액권만) · 관계자 제외(제8조⑤)",
      settle: "말일 매장별 통지 → 익월 10일 지급 → 통지 +14일 이의 · 액면 1만 부가세 포함, 회사 100% 부담",
      banned: ["전원 당첨", "100%", "보장", "반드시", "12주 안에", "예상 도달"],
    },
    sheet_url: MILEAGE_SHEET,
    slack_channel: MILEAGE_SLACK,
    pool_source: "manual", // 앱 DB → 시트 자동화 전
    draft: true,
    draft_note: "회차 표는 #ops-mileage 게시 기준으로 채웠습니다. 시트가 정본이고, 여기는 사람이 확인한 기록입니다.",
  });
}

/** PATCH { id, pool_count?, result?, note?, by } — 응모풀 확인·결과 기록 */
export async function PATCH(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { id?: string; pool_count?: number | null; result?: MileageRound["result"]; note?: string | null; by?: string };
  if (!body.id) return NextResponse.json({ detail: "id 가 필요합니다." }, { status: 400 });
  if (body.result && !["scheduled", "drawn", "held", "skipped"].includes(body.result)) return NextResponse.json({ detail: "result 값이 올바르지 않습니다." }, { status: 400 });
  if (body.pool_count !== undefined && body.pool_count !== null && (!Number.isInteger(body.pool_count) || body.pool_count < 0)) return NextResponse.json({ detail: "pool_count 는 0 이상 정수여야 합니다." }, { status: 400 });
  const rounds = readDraft<MileageRound[]>(KEY, seedRounds);
  const idx = rounds.findIndex((r) => r.id === body.id);
  if (idx === -1) return NextResponse.json({ detail: "회차를 찾을 수 없습니다." }, { status: 404 });
  const now = new Date().toISOString();
  const cur = rounds[idx];
  const next: MileageRound = {
    ...cur,
    ...(body.pool_count !== undefined ? { pool_count: body.pool_count, pool_checked_by: body.by ?? null, pool_checked_at: now } : {}),
    ...(body.result ? { result: body.result } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
    updated_by: body.by ?? null,
    updated_at: now,
  };
  rounds[idx] = next;
  writeDraft(KEY, rounds);
  return NextResponse.json({ ok: true, round: next, draft: true });
}
