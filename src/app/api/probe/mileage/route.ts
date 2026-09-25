import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { accessToken, clearBackendCache, fetchBackendJson } from "@/lib/draft/toolProxy";

/**
 * Probe · 마일리지 추첨 운영.
 *
 * 규칙 출처: 계약 v6 제8~10조 + #ops-mileage 결정(0906 민찬: 수·금 주 2회 마감(실제 마감 11:00 KST — 0920 확인), 회당 5,000원 1건 + 10,000원 1건).
 * 9월은 1주차 추첨 없음, 추석 주간 적립분은 4주차에 몰아 방출 + 상품 2배(0902 재민 서버 반영).
 * 응모풀 정본 소스(앱 DB → 시트)는 아직 없다. 지금은 회차마다 사람이 시트 '응모풀' 탭에 붙여넣고
 * `mileageDrawManual` 을 돌린다. 9/2·9/4·9/9 세 번 연속 응모풀이 비어 추첨이 보류됐다 — 이 화면이 그걸 먼저 보이게 한다.
 *
 * 회차 기록은 백엔드 `probe.MileageRound`. 시트가 정본이고 여기는 '확인했다'는 사람의 기록이다.
 * 달마다 수·금 회차는 이 파일이 만들어(roundsFor) 백엔드에 없는 것만 넣는다 — 9월의 예외(1주차 미운용·추석)가 여기 있어서다.
 * 백엔드가 없는 로컬·미리보기에서만 예전 초안 파일을 쓴다.
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

/**
 * 어느 달이든 수·금 회차 **자리**를 만든다. 결과는 사람이 확인해서 적는다.
 *
 * 0925: 여기에 9/2·9/4·9/9 의 결과가 "보류 · 응모 0" 으로 박혀 있었고, 백엔드에 그 값이
 * 없으면 **POST 로 심기까지** 했다. 그런데 이 기능의 화면(MileageOps.tsx) 머리말은
 * 0920 확인 결과로 **"9/2·9/4 는 회차가 아예 없었고, 9/9 는 오히려 응모 7건에 당첨 2명"**
 * 이라고 적어 두었다. 우리가 틀린 줄 아는 값을 우리 손으로 DB 에 써 넣고 있었던 것이다.
 * 그 값은 '보류된 회차' 개수에도 그대로 들어갔다.
 *
 * 지어낸 결과는 걷어낸다. 회차 자리만 만들고 결과는 비워 둔다 —
 * 사람이 앱 DB 실측을 보고 채우는 것이 이 화면의 일이다.
 */
function roundsFor(y: number, m0: number): MileageRound[] {
  const known: Record<string, Partial<MileageRound>> = {};
  const out: MileageRound[] = [];
  const sep = y === 2026 && m0 === 8;
  const last = new Date(y, m0 + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m0, d);
    const wd = dt.getDay();
    if (wd !== 3 && wd !== 5) continue;
    const id = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const k = known[id] ?? {};
    out.push({
      id, date: id, weekday: wd === 3 ? "수" : "금",
      seats: k.seats ?? { fixed: 0, random: 2 },
      prizes: "5,000원 1 · 10,000원 1",
      pool_count: k.pool_count ?? null,
      pool_checked_by: null, pool_checked_at: null,
      result: k.result ?? (sep && d <= 5 ? "skipped" : "scheduled"),
      note: k.note ?? (sep && d <= 5 ? "9월 1주차는 추첨 없음 (0902 확정)" : sep && d >= 21 && d <= 27 ? "추석 주간 적립분 몰아 방출 · 상품 2배" : null),
      updated_by: null, updated_at: null,
    });
  }
  return out;
}

function seedRounds(): MileageRound[] { return roundsFor(2026, 8); }

/** 저장된 회차에 이번 달이 없으면 만들어 붙인다 — 10월이 돼도 화면이 비지 않는다. */
function ensureCurrentMonth(rounds: MileageRound[]): MileageRound[] {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
  if (rounds.some((r) => r.id.startsWith(prefix))) return rounds;
  const next = [...rounds, ...roundsFor(now.getFullYear(), now.getMonth())].sort((a, b) => a.id.localeCompare(b.id));
  writeDraft(KEY, next);
  return next;
}

const onBackend = () => Boolean(process.env.NEXT_PUBLIC_API_URL);

/** 백엔드에 이번 달·9월 회차가 없으면 만들어 넣고, 전체를 날짜순으로 돌려준다. */
async function loadRounds(): Promise<MileageRound[]> {
  if (!onBackend()) return ensureCurrentMonth(readDraft<MileageRound[]>(KEY, seedRounds));
  const now = new Date();
  const want = [...seedRounds(), ...roundsFor(now.getFullYear(), now.getMonth())];
  const have = (await fetchBackendJson<{ rounds: MileageRound[] }>("/api/probe/mileage/rounds/"))?.rounds ?? [];
  const missing = want.filter((w) => !have.some((h) => h.id === w.id));
  if (missing.length) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/probe/mileage/rounds/`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({ rounds: missing }), cache: "no-store",
    }).catch(() => undefined);
    const after = (await fetchBackendJson<{ rounds: MileageRound[] }>("/api/probe/mileage/rounds/", undefined, true))?.rounds;
    if (after) return [...after].sort((a, b) => a.id.localeCompare(b.id));
  }
  return [...have].sort((a, b) => a.id.localeCompare(b.id));
}

/** 회차에 실제로 무슨 일이 있었나 — 앱 DB(응모·당첨). 사람이 시트에서 세던 숫자를 대신한다. */
interface Voucher { user_id: number; coupon_code: string | null; status: "REDEEMED" | "EXPIRED" | "ISSUED" | null; expires_at: string | null; redeemed_at: string | null; restaurant_id: number | null; restaurant_name: string | null }
interface DayProgress { entries: number; people: number; winners: number; vouchers: Voucher[]; raffles: { id: number; title: string; prize_amount: number; winner_count: number; status: string; entries: number; winners: number; drawn_at: string | null }[] }
interface VoucherSummary { issued: number; redeemed: number; expired: number; waiting: number; none: number }

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rounds = await loadRounds();
  const live = onBackend() ? await fetchBackendJson<{ days: Record<string, DayProgress>; vouchers: VoucherSummary }>("/api/probe/mileage/progress/") : null;
  const progress = live?.days ?? null;
  return NextResponse.json({
    rounds,
    // 회차 날짜별 실제 응모·당첨. 못 읽으면 null — 0 이 아니다(사람이 적은 숫자와 섞이면 안 된다).
    progress,
    // 당첨 식사권이 매장에서 쓰였나 — 뽑힌 것과 쓴 것은 다르다
    vouchers: live?.vouchers ?? null,
    rules: {
      cadence: "수 · 금 11:00 마감 · 마감 직후 추첨 (주 2회)",
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
    draft: !onBackend(),
    draft_note: "회차 표는 #ops-mileage 게시 기준으로 채웠습니다. 시트가 정본이고, 여기는 사람이 확인한 기록입니다.",
  });
}

/**
 * POST { date, items:[{prize_amount, winner_count, pick_mode}] } — 회차(응모)를 손으로 만든다.
 * 자동 생성은 두지 않는다(0920 민찬) — 상품이 걸린 자리를 기계가 늘리지 않게.
 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (!onBackend()) return NextResponse.json({ detail: "백엔드가 연결돼야 회차를 만들 수 있습니다." }, { status: 501 });
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/probe/mileage/rounds/raffles/`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify(body), cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
  const d = await res.json().catch(() => ({}));
  if (res.ok) clearBackendCache(); // 만든 회차가 바로 표에 보이게
  return NextResponse.json(d, { status: res.status });
}

/** PATCH { id, pool_count?, result?, note?, by } — 응모풀 확인·결과 기록 */
export async function PATCH(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { id?: string; pool_count?: number | null; result?: MileageRound["result"]; note?: string | null; by?: string };
  if (!body.id) return NextResponse.json({ detail: "id 가 필요합니다." }, { status: 400 });
  if (body.result && !["scheduled", "drawn", "held", "skipped"].includes(body.result)) return NextResponse.json({ detail: "result 값이 올바르지 않습니다." }, { status: 400 });
  if (body.pool_count !== undefined && body.pool_count !== null && (!Number.isInteger(body.pool_count) || body.pool_count < 0)) return NextResponse.json({ detail: "pool_count 는 0 이상 정수여야 합니다." }, { status: 400 });
  if (onBackend()) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/probe/mileage/rounds/`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({ id: body.id, ...(body.pool_count !== undefined ? { pool_count: body.pool_count } : {}), ...(body.result ? { result: body.result } : {}), ...(body.note !== undefined ? { note: body.note } : {}) }),
      cache: "no-store",
    }).catch(() => null);
    if (!res) return NextResponse.json({ detail: "마일리지 저장소(백엔드)에 연결하지 못했습니다." }, { status: 502 });
    const d = (await res.json().catch(() => ({}))) as { round?: MileageRound; detail?: string };
    if (!res.ok) return NextResponse.json({ detail: d.detail ?? "저장하지 못했습니다." }, { status: res.status });
    clearBackendCache(); // 방금 적은 값이 바로 다음 조회에 보이게 (조회는 6초 캐시된다)
    return NextResponse.json({ ok: true, round: d.round, draft: false });
  }
  const rounds = ensureCurrentMonth(readDraft<MileageRound[]>(KEY, seedRounds));
  const who = (await actorName()) ?? body.by ?? null;
  const idx = rounds.findIndex((r) => r.id === body.id);
  if (idx === -1) return NextResponse.json({ detail: "회차를 찾을 수 없습니다." }, { status: 404 });
  const now = new Date().toISOString();
  const cur = rounds[idx];
  const next: MileageRound = {
    ...cur,
    ...(body.pool_count !== undefined ? { pool_count: body.pool_count, pool_checked_by: who, pool_checked_at: now } : {}),
    ...(body.result ? { result: body.result } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
    updated_by: who,
    updated_at: now,
  };
  rounds[idx] = next;
  writeDraft(KEY, rounds);
  return NextResponse.json({ ok: true, round: next, draft: true });
}
