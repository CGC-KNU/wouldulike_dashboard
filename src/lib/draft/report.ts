import type { ReportMetric, ReportMetricSource, ReportProposal, ReportSnapshot, VerdictTone } from "./types";
import { ageShare, slideShare, slideTop } from "./reportManual";

/**
 * 매장 리포트의 순수 함수들 — 비교(벤치마크) · 해석 문장 · 제안 · 금지 표현.
 *
 * 0911 토론에서 합의된 규칙:
 *  - 비교군은 **우리 채널 평소 게시물**(Papillon cohort) 하나. "업계 평균"은 없다. 표본 n<5 또는 hidden 이면 비교하지 않는다.
 *  - 계산은 중앙값이고 문장도 "중앙값"이라고 말한다. 표본 수·기간을 근거 줄에 밝힌다.
 *  - 근거가 없으면 그 자리를 다른 주장으로 메우지 않는다 ("상위권" 금지).
 *  - (0925 에 바뀜 — 아래) 헤드라인은 고정 순서(저장 → 도달 → 조회). 잘 나온 지표를 고르지 않는다.
 *  - 자기 수치는 정확하게, 비교군만 "약". 여러 매장이 함께 나온 게시물이면 그 사실을 문장이 말한다.
 *  - 앱 지표는 병렬 서술, 인과 주장 금지.
 *
 * 0925 마케팅 피드백으로 **점주에게 나가는 문장**의 규칙이 바뀌었다:
 *  - 우리 채널 평소 게시물과 견주지 않는다. 사장님이 궁금한 건 채널 안 순위가 아니라 가게가 얼마나 알려졌는지다.
 *    채널 비교(verdict · cohortNote · 제안 근거 줄)는 Probe 내부 화면에만 남는다.
 *  - 약점을 말하지 않고, 문장에 올릴 만한 크기(MIN_OWNER_VALUE)의 숫자만 쓴다. 없는 숫자를 만들지는 않는다.
 *  - (0928) 해석 문단은 마케팅이 쓴 기프트버거 글의 형식(ownerStory) — 지표의 뜻을 풀고, 이 게시물 안에서만 견준다.
 */

export const METRIC_LABEL: Record<string, string> = { saved: "저장", reach: "도달", views: "조회", shares: "공유", likes: "좋아요", comments: "댓글", profile_visits: "프로필 방문", follows: "팔로우" };
export const MIN_COHORT = 5;
/** 비교할 근거가 없을 때의 한 줄 요약 — 공개 양식에서는 제목으로 쓰지 않는다(뜻이 없는 문장이라). */
export const DEFAULT_SUMMARY = "인스타그램 수치와 같은 기간 앱에서 일어난 일을 정리했습니다.";

/** 비교군만 "약" 으로 반올림. 자기 수치는 그대로. */
export function approx(n: number): string {
  if (n >= 10_000) return `약 ${(Math.round(n / 1000) * 1000).toLocaleString()}`;
  if (n >= 1_000) return `약 ${(Math.round(n / 100) * 100).toLocaleString()}`;
  if (n >= 100) return `약 ${Math.round(n / 10) * 10}`;
  return `약 ${n}`;
}

export function comparable(m: ReportMetric): boolean {
  return !m.hidden && m.n >= MIN_COHORT && m.median !== null;
}

/**
 * 판정에 쓰는 기준 바구니. 최근 5건은 흔들리고 전체는 둔해서, **최근 10건**이 가운데다.
 * 이게 없는(0923 이전) 스냅샷은 옛 방식(p10·p90)으로 떨어진다.
 */
export const VERDICT_BASKET = "recent10" as const;

/**
 * 순위가 위/아래 **몇 분의 몇**에 들면 판정할지. 1/3 이면 위 1/3 · 아래 1/3 이 찍히고 가운데는 안 찍힌다.
 *
 * 폭을 정하는 문제가 아니었다 — 이 계정 분포(중앙값 61 · 최고 4,270 · CV 2.9)에서 p10~p90 은
 * 80% 를 「범위 안」으로 만들고, p25~p75 로 좁히면 절반이 찍히는데 그 절반은 신호가 아니라 분산이다.
 * 순위는 분포 모양에 안 흔들리므로 "몇 건 중 몇 위"로 말하고, 경계는 여기 한 줄로 조정한다.
 */
export const VERDICT_FRACTION = 1 / 3;

/** 순위 기반 판정 — 표본이 얕아도 순위·분모는 뜻이 있어 그대로 쓴다. */
function rankVerdict(m: ReportMetric): { tone: VerdictTone; text: string } | null {
  const b = m.baskets?.[VERDICT_BASKET];
  if (!b || b.rank === null || b.n < 2) return null;
  const where = `${b.n}건 중 ${b.rank}위`;
  if (b.rank === 1) return { tone: "good", text: `최고 기록 (${where})` };
  const edge = Math.max(1, Math.floor(b.n * VERDICT_FRACTION));
  if (b.rank <= edge) return { tone: "good", text: `상위권 (${where})` };
  if (b.rank > b.n - edge) return { tone: "warn", text: `하위권 (${where})` };
  return { tone: "gray", text: `가운데 (${where})` };
}

/**
 * 지표 판정 한 마디 — **1005 부터 Probe 화면 어디에도 안 찍는다**(민찬: 목록 · 게시물 패널 · 편집 카드의 상위권 · 가운데 · 하위권을 모두 뺐다).
 * 다시 쓸 때 같은 상태를 다른 말로 부르지 않게 규칙은 여기 하나로 남겨 둔다.
 *
 * **순위로 말한다.** 「최근 10건 중 3위」는 분포가 어떻든 뜻이 같고 분모가 눈에 보인다.
 * 「평소 범위 안」은 이 계정에서 80% 의 게시물에 붙어 아무 말도 안 했다(0923 민찬).
 * baskets 가 없는 옛 스냅샷만 예전 p10·p90 방식으로 떨어진다.
 */
export function verdict(m: ReportMetric): { tone: VerdictTone; text: string } {
  const byRank = rankVerdict(m);
  if (byRank) return byRank;

  if (!comparable(m)) return m.hidden || m.n < MIN_COHORT ? { tone: "gray", text: `표본 부족 (n=${m.n})` } : { tone: "gray", text: "비교 기준 없음" };
  // comparable 이어도 기준(D7/누적)이 어긋나거나 가운데 값이 0 이면 metricsOf 가 delta 를 비워 둔다 — 비교하지 않는다
  if (m.delta_pct === null) return { tone: "gray", text: "비교 기준 없음" };
  if (m.p90 !== null && m.value > m.p90) return { tone: "good", text: `평소보다 높음 (n=${m.n})` };
  if (m.p10 !== null && m.value < m.p10) return { tone: "warn", text: `평소보다 낮음 (n=${m.n})` };
  if (m.p10 === null || m.p90 === null) return { tone: m.delta_pct >= 0 ? "good" : "warn", text: `평소 대비 ${m.delta_pct >= 0 ? "+" : ""}${m.delta_pct}% (n=${m.n})` };
  return { tone: "gray", text: `평소 범위 안 (n=${m.n})` };
}

export const VERDICT_CLASS: Record<VerdictTone, string> = { good: "text-emerald-700", warn: "text-red-600", gray: "text-gray-400" };

/** 출처 배지 — 앱 지표 화면의 DB 배지와 같은 색·이름 */
export const METRIC_SOURCE: Record<ReportMetricSource, { label: string; tone: "blue" | "navy" | "gray" }> = { graph: { label: "인스타", tone: "blue" }, app: { label: "DB", tone: "navy" }, sheet: { label: "시트", tone: "gray" } };

/** 점주 문장에 올릴 만한 크기 — 이보다 작은 수는 문장에 쓰지 않는다(댓글 2개를 크게 말하지 않는다). */
export const MIN_OWNER_VALUE = 10;

/** 제목 끝 "(정든밤 포함)" 은 우리끼리의 표시라 점주에게 보이지 않는다 — 공개 양식·카톡 텍스트가 같이 쓴다 */
export const stripMarker = (t: string) => t.replace(/\s*[(（][^()（）]*포함\s*[)）]\s*/g, " ").trim();

/** 받침에 맞는 조사 — 한글로 끝나지 않으면 "이(가)" 꼴로 둔다 */
export function josa(word: string, withBatchim: string, without: string): string {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${word}${withBatchim}(${without})`;
  return word + ((c - 0xac00) % 28 ? withBatchim : without);
}

type OwnerKey = "views" | "reach" | "saved" | "shares" | "likes" | "comments" | "total_interactions" | "avg_watch_ms" | "total_watch_ms";
/**
 * 점주 문장이 쓰는 숫자 — 리포트 카드와 **같은 출처**다(reportTemplateData 의 val 과 같은 순서).
 * 백엔드 report-data(D+7/D+14 그 시점 값)가 있으면 그것, 없으면 스냅샷 지표. 카드는 14일차인데 문장은 7일차가 되지 않게.
 */
export function ownerNumbers(s: ReportSnapshot): Partial<Record<OwnerKey, number>> {
  const out: Partial<Record<OwnerKey, number>> = {};
  for (const k of ["views", "reach", "saved", "shares", "likes", "comments", "total_interactions", "avg_watch_ms", "total_watch_ms"] as const) {
    const v = s.report_data?.available ? s.report_data.metrics?.[k] : undefined;
    const m = v ?? s.metrics.find((x) => x.key === k)?.value;
    if (typeof m === "number") out[k] = m;
  }
  return out;
}

/**
 * 편집 화면 「스냅샷」 카드의 숫자 — 해석 글 · 사장님 리포트와 같은 숫자(ownerNumbers)다(1005).
 * 카드가 Papillon 성과(7일차 우선)를, 글이 report-data(14일차 우선)를 읽어 한 화면에 조회수가 둘 떴다.
 */
export function cardValue(s: ReportSnapshot, m: ReportMetric): number {
  return ownerNumbers(s)[m.key as OwnerKey] ?? m.value;
}

/**
 * 카드 아래 작은 회색 줄 — 7일차 숫자(1005 민찬: 7일차 · 14일차 둘 다 보이게, 증가분은 빼고).
 * 카드 큰 숫자가 14일차(report-data)일 때만 「7일차 1,234」. 7일차 값은 스냅샷 metrics(Papillon 성과 — 7일차 우선)에 원래 있다.
 * 카드와 같은 날이면 null. 순위(baskets)도 이 7일차 값으로 매긴 것이다 — 판정을 카드에 다시 올리면 이 줄 옆에 둔다.
 */
export function day7Line(s: ReportSnapshot, m: ReportMetric): string | null {
  const otherDay = s.basis === "D7" && s.report_data?.available && typeof s.report_data.day === "number" && s.report_data.day !== 7;
  return otherDay ? `7일차 ${m.value.toLocaleString()}` : null;
}

/** 반응 지표마다 — 무엇인지(정의) 한 문장 + 이번 콘텐츠에서 한 일 한 문장. 좋아요·댓글 문장은 0928 민찬 확인. */
const REACTION: Record<"shares" | "saved" | "likes" | "comments", { label: string; unit: string; def: string; did: (v: string, store: string) => string }> = {
  shares: { label: "공유", unit: "회", def: "공유는 게시물을 다른 사람에게 직접 보내는 행동입니다.",
    did: () => "이번 콘텐츠는 처음 본 이용자에게서 끝나지 않고, 그 주변 사람들에게까지 한 번 더 전달되었습니다." },
  saved: { label: "저장", unit: "회", def: "저장은 게시물을 나중에 다시 볼 수 있도록 자신의 보관함에 담아 두는 기능입니다.",
    did: (v, store) => `이번 콘텐츠는 ${v}회 저장되어, 그만큼 이용자들의 보관함에 ${store} 소개가 남게 되었습니다.` },
  likes: { label: "좋아요", unit: "개", def: "좋아요는 게시물이 마음에 든다는 것을 바로 표시하는 반응입니다.",
    did: (v) => `이번 콘텐츠를 본 이용자 가운데 ${v}명이 좋아요를 눌렀습니다.` },
  comments: { label: "댓글", unit: "개", def: "댓글은 게시물 아래에 직접 글을 남기는 반응입니다.",
    did: (v) => `이번 콘텐츠에는 댓글 ${v}개가 달렸습니다.` },
};

/**
 * **0928~1001 의** 점주 해석 문단 — 1002 부터는 쓰지 않는다(아래 ownerStory). 이미 만든 리포트에 이 글이 박혀 있어서
 * 그 문장을 자동 문장으로 알아보는 데만 쓴다(isAutoLine) — 알아봐야 새 글로 갈아 끼운다.
 *
 * (0928 — 마케팅이 쓴 기프트버거 글을 규칙으로 옮겼다. 그 글과 글자까지 같게 나온다: 테스트 참고).
 *
 *   ① "이번 {가게} 콘텐츠 성과를 정리해 전달드립니다."
 *   ② 도달·조회 + 두 지표의 뜻. 조회가 도달보다 클 때만 "한 번 넘게 본 이용자가 있었다".
 *   ③ 공유·저장·좋아요·댓글 중 가장 많은 것 + 뜻 + 이번 콘텐츠에서 한 일
 *   ④ 두 번째 + 뜻 + 한 일, 나머지는 "이 밖에 좋아요는 66개를 기록했습니다."
 *
 * 비교는 **이 게시물 안에서만**(조회 vs 도달, 반응끼리 순위) — 우리 채널과 견주지 않는다. 10 미만은 문장에 쓰지 않는다.
 * 같은 값이면 공유 > 저장 > 좋아요 > 댓글. 편집 화면 PATCH 한도(한 줄 300자 · 4줄) 안에 든다.
 */
export function storyBefore1002(s: ReportSnapshot): string[] {
  const m = ownerNumbers(s), store = s.store.name;
  const n = (v: number) => v.toLocaleString();
  const ok = (v: number | undefined): v is number => typeof v === "number" && v >= MIN_OWNER_VALUE;
  // 릴스는 명사와 조회의 뜻만 바꾼다(0930). 피드 글은 기프트버거 글 그대로 — 기준 테스트.
  const reel = isReel(s);
  const what = reel ? "릴스" : "콘텐츠", thing = reel ? "릴스" : "게시물";
  const seen = reel ? "릴스가 재생된 횟수" : "게시물이 화면에 나타난 횟수";
  const out = [`이번 ${store} ${what} 성과를 정리해 전달드립니다.`];
  if (ok(m.reach)) {
    out.push(`해당 ${what}는 총 ${n(m.reach)}명의 이용자에게 도달했${ok(m.views) ? `으며, 조회수는 ${n(m.views)}회를 기록했습니다.` : "습니다."}` +
      ` 도달은 ${josa(thing, "을", "를")} 한 번 이상 본 계정의 수` + (ok(m.views) ? `이고, 조회는 ${seen}를 모두 센 값입니다.` : "입니다.") +
      (ok(m.views) && m.views > m.reach ? ` 조회수가 도달한 이용자 수를 넘어섰다는 것은, ${josa(thing, "을", "를")} 한 번 넘게 본 이용자가 있었다는 뜻입니다.` : ""));
  } else if (ok(m.views)) {
    out.push(`해당 ${what}는 조회수 ${n(m.views)}회를 기록했습니다. 조회는 ${seen}를 모두 센 값입니다.`);
  }
  const watch = reel ? reelWatchLine(s) : null;
  if (watch) out.push(watch);
  const order = (["shares", "saved", "likes", "comments"] as const).filter((k) => ok(m[k])).sort((a, b) => (m[b] as number) - (m[a] as number));
  const [first, second, ...rest] = order;
  const say = (k: (typeof order)[number]) => `${n(m[k] as number)}${REACTION[k].unit}`;
  if (first) out.push(`이용자 반응 가운데서는 ${josa(REACTION[first].label, "이", "가")} ${say(first)}로 가장 많았습니다. ${REACTION[first].def} ${REACTION[first].did(n(m[first] as number), store)}`);
  if (second) {
    const tail = rest.map((k) => `${josa(REACTION[k].label, "은", "는")} ${say(k)}`);
    out.push(`${josa(REACTION[second].label, "은", "는")} ${say(second)}로 집계되었습니다. ${REACTION[second].def} ${REACTION[second].did(n(m[second] as number), store)}` +
      (tail.length ? ` 이 밖에 ${tail.join(", ")}를 기록했습니다.` : ""));
  }
  return out;
}

/** 반응 수 — 인스타의 total_interactions(좋아요·저장·공유·댓글 합), 없으면 넷을 더한다. 양식의 「반응 수」와 같은 값 */
export function interactionsOf(s: ReportSnapshot): number | null {
  const m = ownerNumbers(s);
  if (typeof m.total_interactions === "number") return m.total_interactions;
  const four = [m.likes, m.saved, m.shares, m.comments];
  return four.every((v) => typeof v === "number") ? (four as number[]).reduce((a, b) => a + b, 0) : null;
}

/** 제목에 「(… 포함)」 표시가 있는가 — 마케팅 약속(0916)으로 그 표시가 있는 콘텐츠가 제휴식당 **큐레이션**이다 */
export const hasCurationMarker = (topic: string) => /[(（][^()（）]*포함\s*[)）]/.test(topic);

/**
 * **1002~1003 새벽의** 큐레이션 소개 문단 — 지금은 아래 curationIntro. 그때 만든 리포트의 자동 문장을 알아보는 데만 쓴다.
 * (1002 마케팅: "최소한 서두에 이 내용은 들어가면 좋겠습니다").
 *
 *   마케팅 원문: 이번 콘텐츠는 [수제버거 맛집으로 알려진 대구 지역 맛집 7곳]을 함께 큐레이션하는 방식으로 제작되었습니다.
 *   이를 통해 [기프트버거가 대구의 대표적인 수제버거] 맛집 중 하나로 자연스럽게 소개되었으며, 타깃 고객층에게 브랜드 인지도를 높이고
 *   긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.
 *
 * 대괄호 자리는 제목에서 온다 — 「대구 수제버거 맛집 (기프트버거 경대점 포함)」 → "대구 수제버거 맛집".
 * **몇 곳인지는 우리 데이터에 없다**(제목 괄호에는 이 가게 이름만, 캡션에도 목록이 없다 — 1003 운영 조회).
 * 편집 화면에서 사람이 적으면(manual.store_count) "N곳", 비어 있으면 지어내지 않고 "여러 곳"이라고 쓴다.
 * 표시가 없는 콘텐츠(협찬 단독 등)는 큐레이션이 아니라 이 문단이 없다.
 */
function curationIntroBefore1003(s: ReportSnapshot): string | null {
  if (!hasCurationMarker(s.post.topic)) return null;
  const theme = stripMarker(s.post.topic);
  if (!theme) return null;
  const what = isReel(s) ? "릴스" : "콘텐츠";
  const count = s.manual?.store_count;
  return `이번 ${what}는 ${theme} ${typeof count === "number" ? `${count}곳` : "여러 곳"}을 함께 큐레이션하는 방식으로 제작되었습니다. 이를 통해 ${josa(s.store.name, "이", "가")} 대표적인 ${theme} 중 하나로 자연스럽게 소개되었으며, ` +
    "타깃 고객층에게 브랜드 인지도를 높이고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.";
}

/**
 * **1002~1003 새벽의** 점주 해석 문단 — 1003 부터는 쓰지 않는다(아래 ownerStory). 그때 만든 리포트에 이 글이 박혀 있어
 * 자동 문장으로 알아보는 데만 쓴다(isAutoLine).
 *
 * (1002 — 마케팅 피드백: 세부 지표보다 **새로운 사람에게 노출되고 있다**, 조회수와 반응 수 중심).
 *
 *   ① "이번 {가게} {콘텐츠|릴스} 성과를 정리해 전달드립니다."
 *   ② 큐레이션 소개(제목에 「(… 포함)」 표시가 있을 때) — curationIntro
 *   ③ 조회수
 *   ③' (손으로 넣었을 때) 본 사람의 18~34세 비중 — 인스타 앱에서 옮긴 18~24세 · 25~34세 비중 (1003)
 *   ④ 반응 수 합계 — 하나하나(좋아요 몇, 공유 몇)보다 "그냥 지나치지 않았다"를 말한다.
 *   ④' (손으로 넣었을 때 · 캐러셀) 이 가게가 실린 장의 좋아요 비중 = 가게 장 ÷ (전체 좋아요 − 썸네일 장) (1003)
 *
 * **팔로워·비팔로워는 말하지 않는다 (1002 결정).** 마케팅이 원한 건 「이 콘텐츠를 본 사람 중 비팔로워 비율」인데 인스타가
 * 게시물 단위로는 주지 않는다(운영 호출: `(#100) Incompatible breakdowns (follow_type)` — 릴스·피드, 조회·도달 모두).
 * 계정 전체 숫자(최근 28일 도달 = 팔로워의 60배)는 "이 콘텐츠와 관련 없는 이야기"라, 팔로워 수와 견주는 문장은
 * "팔로워 수 언급보다…"라는 의견으로 뺐다. 다시 넣으려면 그 숫자를 받을 길부터 생겨야 한다.
 *
 * 세부 지표(도달·저장·공유·좋아요·댓글·시청 시간)는 문장에 하나씩 쓰지 않는다 — 리포트의 「세부 지표 보기」에 있다.
 * 없는 숫자는 문장째 뺀다. 10 미만은 쓰지 않는다.
 */
export function storyBefore1003(s: ReportSnapshot): string[] {
  const m = ownerNumbers(s), store = s.store.name;
  const n = (v: number) => v.toLocaleString();
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && v >= MIN_OWNER_VALUE;
  const reel = isReel(s);
  const what = reel ? "릴스" : "콘텐츠";
  const out = [`이번 ${store} ${what} 성과를 정리해 전달드립니다.`];
  const intro = curationIntroBefore1003(s);
  if (intro) out.push(intro);
  if (ok(m.views)) out.push(`이번 ${what}는 조회수 ${n(m.views)}회를 기록했습니다.`);
  const age = ageShare(s.manual);
  if (age) out.push(`이번 ${josa(what, "을", "를")} 본 분들 가운데 ${age.sum}%가 18~34세였습니다(18~24세 ${age.p18_24}% · 25~34세 ${age.p25_34}%).`);
  const reacted = interactionsOf(s);
  if (ok(reacted)) out.push(`그리고 이번 ${josa(what, "을", "를")} 본 분들이 좋아요·저장·공유·댓글로 모두 ${n(reacted)}회 반응했습니다. 그냥 지나치지 않고 어떤 형태로든 반응을 남겼다는 뜻입니다.`);
  const share = isCarousel(s) ? slideShare(s.manual, m.likes) : null;
  if (share !== null) out.push(`함께 소개된 가게들 가운데 ${josa(store, "이", "가")} 실린 장이 좋아요의 ${share}%를 받았습니다(표지 장 제외).`);
  return out;
}

/**
 * 큐레이션 소개 문단 (1003 — 마케팅이 준 글 그대로. 대괄호 자리만 제목에서 채운다).
 *
 *   이번 콘텐츠는 [수제버거 맛집으로 알려진 대구 지역 맛집 7곳]을 함께 큐레이션하는 방식으로 제작되었습니다. 이를 통해
 *   [기프트버거가 대구의 대표적인 수제버거] 맛집 중 하나로 자연스럽게 소개되었으며, 타깃 고객층에게 브랜드 인지도를 높이고
 *   긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.
 *
 * 제목이 「<지역> <주제> <맛집|술집|카페|식당>」 꼴이면(「대구 수제버거 맛집」) 그 글과 같은 모양으로 쓴다.
 * 그 꼴이 아니면(「다이어터를 위한 맛집 추천」) 억지로 끼워 넣지 않고 「제목」을 주제로 썼다고 말한다.
 * 곳 수는 사람이 적은 값(manual.store_count), 없으면 "여러 곳". 제목에 「(… 포함)」 표시가 없으면 큐레이션이 아니라 문단이 없다.
 */
export function curationIntro(s: ReportSnapshot): string | null {
  if (!hasCurationMarker(s.post.topic)) return null;
  const theme = stripMarker(s.post.topic);
  if (!theme) return null;
  const what = isReel(s) ? "릴스" : "콘텐츠", store = s.store.name;
  const count = s.manual?.store_count;
  const many = typeof count === "number" ? `${count}곳` : "여러 곳";
  const tail = "타깃 고객층에게 브랜드 인지도를 높이고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.";
  const m = /^(대구|경산)\s+(.+?)\s*(맛집|술집|카페|식당)$/.exec(theme);
  if (m) {
    const [, region, kind, noun] = m;
    return `이번 ${what}는 ${josa(`${kind} ${noun}`, "으로", "로")} 알려진 ${region} 지역 ${noun} ${many}을 함께 큐레이션하는 방식으로 제작되었습니다. ` +
      `이를 통해 ${josa(store, "이", "가")} ${region}의 대표적인 ${kind} ${noun} 중 하나로 자연스럽게 소개되었으며, ${tail}`;
  }
  return `이번 ${what}는 「${theme}」${josa(theme, "을", "를").slice(theme.length)} 주제로 ${many}을 함께 큐레이션하는 방식으로 제작되었습니다. ` +
    `이를 통해 ${josa(store, "이", "가")} 추천 가게 중 하나로 자연스럽게 소개되었으며, ${tail}`;
}

/**
 * 단독 소개 서두 (1003 — 릴스도 큐레이션처럼 "어떻게 만든 콘텐츠인지"로 시작한다). 제목에 「(… 포함)」 표시가 없는 릴스
 * (협찬 단독 — 「교동후추 협찬」)일 때만. 제목에 제휴 매장이 여럿이면(co_stores > 1) 단독이 아니라 붙이지 않는다.
 * 큐레이션 소개 문단의 끝맺음과 같은 결로 썼다 — 마케팅 확인 대상.
 */
export function soloIntro(s: ReportSnapshot): string | null {
  if (!isReel(s) || hasCurationMarker(s.post.topic) || s.post.co_stores > 1) return null;
  const store = s.store.name;
  return `이번 릴스는 ${store} 한 곳만을 단독으로 담은 영상으로 제작되었습니다. 영상 전체가 ${store}에 집중되어 있어, ` +
    `이를 본 이용자들에게 ${josa(store, "을", "를")} 또렷하게 알리고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.`;
}

/**
 * 총 시청 시간 문단 — **글에 넣지 않는다**(1003 민찬: "너무 없어 보이니 빼자"). 몇 분 동안 운영에 나갔던 문장이라
 * 그때 만든 리포트의 자동 문장을 알아보는 데만 쓴다(isAutoLine). 시청 시간은 세부 지표(평균)에 있다.
 * (1003 — 릴스. "시청 시간은 모든 사람들의 시간으로만" — 평균은 쓰지 않는다). 1분 이상일 때만.
 * 여러 가게 편이면 「{가게}가 소개된 영상」 — 본 시간을 한 가게 몫으로 말하지 않는다.
 */
export function watchParagraph(s: ReportSnapshot): string | null {
  if (!isReel(s)) return null;
  const { totalMin } = reelWatchNumbers(s);
  if (totalMin === null || totalMin < 1) return null;
  const h = Math.floor(totalMin / 60), mm = totalMin % 60;
  const t = h > 0 ? `${h}시간${mm ? ` ${mm}분` : ""}` : `${mm}분`;
  const store = s.store.name;
  const whose = hasCurationMarker(s.post.topic) || s.post.co_stores > 1 ? `${josa(store, "이", "가")} 소개된 영상이` : `${store}의 모습이`;
  return `이용자들이 이 영상을 시청한 시간은 모두 합쳐 ${t}에 이릅니다. 그만큼의 시간 동안 ${whose} 이용자들의 화면에 머물렀습니다.`;
}

/**
 * 팔로워가 아닌 사람 비율 문단 (1003 — 인스타 인사이트 「조회」의 '팔로워 아님'을 손으로). 절반 이상일 때만 — 좋은 숫자만 쓴다.
 * 계정 전체가 아니라 **이 콘텐츠의** 숫자다(1002 에 마케팅이 원했던 것).
 */
export function nonFollowerParagraph(s: ReportSnapshot): string | null {
  const v = s.manual?.non_follower_pct;
  if (typeof v !== "number" || v < 50) return null;
  return `조회의 ${v}%는 우주라이크를 팔로우하지 않는 이용자에게서 나왔습니다. 기존 팔로워를 넘어 새로운 고객에게 ${josa(s.store.name, "을", "를")} 알렸다는 뜻입니다.`;
}

/**
 * 연령 문장에 「대학가를 중심으로 한 {가게}의 핵심 타깃층」을 쓸 매장인가.
 * 편집 화면에서 정했으면 그대로. 안 정했으면 앱 제휴 매장(우주라이크 제휴는 대학가 상권이다)이거나 이름에 대학 지점 표시가 있을 때.
 * 협찬만 한 매장(교동 등)은 기본이 아니다. 라라더처럼 대학가와 엮이기 싫어하는 곳은 편집 화면에서 끈다(마케팅 1003).
 */
export function campusTarget(s: ReportSnapshot): boolean {
  const picked = s.manual?.campus_target;
  if (typeof picked === "boolean") return picked;
  return Boolean(s.store.campus) || s.store.in_app === true || /경대|경북대|영남대|계명대/.test(s.store.name);
}

/** 조회수가 아직 늘고 있는가 — 1·7·14일 추이의 마지막 두 점이 늘었을 때만 "꾸준한 증가세"라고 쓴다 */
function viewsStillGrowing(s: ReportSnapshot): boolean {
  const pts = (s.report_data?.available ? s.report_data.series ?? [] : []).filter((p) => typeof p.views === "number");
  return pts.length >= 2 && (pts[pts.length - 1].views as number) > (pts[pts.length - 2].views as number);
}

/**
 * 슬라이드(장)별 반응 문단 — 손으로 넣은 장별 좋아요가 있고 캐러셀일 때.
 *   · "가장 높은 비중"은 1위가 확인됐을 때만(slideTop).
 *   · 1위가 아니어도 가게 수로 고르게 나눈 것(1/N)보다 높으면 그렇게 말한다.
 *   · 가게 수를 아는데 1/N 이하면 **문단을 넣지 않는다** — 약점을 세우지 않는다(0925).
 */
export function slideParagraph(s: ReportSnapshot): string | null {
  if (!isCarousel(s)) return null;
  const share = slideShare(s.manual, ownerNumbers(s).likes);
  if (share === null) return null;
  const store = s.store.name;
  const count = typeof s.manual?.store_count === "number" ? s.manual.store_count : null;
  const top = slideTop(s.manual, ownerNumbers(s).likes);
  if (!top && count !== null && share <= 100 / count) return null;
  const first = `슬라이드별 반응을 살펴보면, 썸네일을 제외했을 때 전체 좋아요 수의 ${share}%가 ${store} 슬라이드에서 발생했습니다.`;
  if (top) return `${first} 이는 함께 소개된 ${count !== null ? `${count}개 ` : ""}매장 중 가장 높은 비중으로, 콘텐츠를 본 이용자들의 관심과 호응이 ${store}에 집중되었다는 점을 보여줍니다.`;
  if (count !== null) return `${first} 이는 함께 소개된 ${count}개 매장이 고르게 나눠 가졌을 때보다 높은 비중으로, 콘텐츠를 본 이용자들의 관심과 호응이 ${store}에 모였다는 점을 보여줍니다.`;
  return first;
}

/**
 * 점주 해석 문단 (1003 — 마케팅이 준 글. 대괄호 자리를 숫자·가게 이름으로 채운다).
 *
 *   ① 이번 [가게] 큐레이션 콘텐츠 성과를 분석해 전달드립니다.            (큐레이션이 아니면 "큐레이션"을 뺀다 · 릴스는 "릴스")
 *   ② 큐레이션 소개 — curationIntro                                      (제목에 「(… 포함)」 표시가 있을 때)
 *      단독 소개 — soloIntro                                              (표시가 없는 단독 릴스, 1003)
 *   ③ 해당 콘텐츠는 총 [N]회의 조회수를 기록했으며, 현재까지도 꾸준한 증가세를 보이고 있습니다.
 *      또한 도달한 이용자의 [N]%가 18~34세로, 대학가를 중심으로 한 [가게]의 핵심 타깃층과 높은 연관성을 보였습니다.
 *   ③' 팔로워가 아닌 사람 비율 — nonFollowerParagraph                     (손으로 넣었고 절반 이상, 1003)
 *   (총 시청 시간 문단은 1003 에 넣었다가 뺐다 — watchParagraph 머리말)
 *   ④ 슬라이드별 반응 — slideParagraph
 *   ⑤ 또한 좋아요, 댓글, 저장, 공유 등 … 총반응 수는 [N]건으로 집계되었습니다. 이는 단순한 노출을 넘어 …
 *
 * 글은 마케팅 것 그대로 두되, **근거가 있을 때만** 붙는 구절이 셋이다:
 *   · "꾸준한 증가세" — 추이의 마지막 두 점에서 조회수가 늘었을 때만(viewsStillGrowing)
 *   · "대학가를 중심으로 한 … 핵심 타깃층" — campusTarget. 아니면 "젊은 고객층을 중심으로 노출되었습니다"
 *   · "가장 높은 비중" — 1위가 확인됐을 때만(slideParagraph)
 * 연령·슬라이드 문장은 인스타 앱에서 손으로 옮긴 값이 있을 때만 나온다. 10 미만은 쓰지 않는다.
 * 팔로워·비팔로워·계정 전체 숫자는 쓰지 않는다(1002 결정 — storyBefore1003 머리말).
 */
export function ownerStory(s: ReportSnapshot): string[] {
  const m = ownerNumbers(s), store = s.store.name;
  const n = (v: number) => v.toLocaleString();
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && v >= MIN_OWNER_VALUE;
  const what = isReel(s) ? "릴스" : "콘텐츠";
  const intro = curationIntro(s);
  const out = [`이번 ${store} ${intro ? "큐레이션 " : ""}${what} 성과를 분석해 전달드립니다.`];
  const opening = intro ?? soloIntro(s);
  if (opening) out.push(opening);
  const reach: string[] = [];
  if (ok(m.views)) reach.push(`해당 ${what}는 총 ${n(m.views)}회의 조회수를 기록했${viewsStillGrowing(s) ? "으며, 현재까지도 꾸준한 증가세를 보이고 있습니다." : "습니다."}`);
  const age = ageShare(s.manual);
  if (age) reach.push(`${reach.length ? "또한 " : ""}도달한 이용자의 ${age.sum}%가 18~34세로, ` +
    (campusTarget(s) ? `대학가를 중심으로 한 ${store}의 핵심 타깃층과 높은 연관성을 보였습니다.` : "젊은 고객층을 중심으로 노출되었습니다."));
  if (reach.length) out.push(reach.join(" "));
  const fresh = nonFollowerParagraph(s);
  if (fresh) out.push(fresh);
  const slide = slideParagraph(s);
  if (slide) out.push(slide);
  const reacted = interactionsOf(s);
  if (ok(reacted)) out.push(`${out.length > 1 ? "또한 " : ""}좋아요, 댓글, 저장, 공유 등 이용자의 실제 행동을 나타내는 총반응 수는 ${n(reacted)}건으로 집계되었습니다. ` +
    `이는 단순한 노출을 넘어 콘텐츠에 대한 관심과 참여를 이끌어냈으며, 향후 ${store} 방문을 고려하게 하는 계기를 마련했다는 점에서 의미 있는 성과라고 볼 수 있습니다.`);
  return out;
}

const isCarousel = (s: ReportSnapshot) => (s.report_data?.available ? s.report_data.post?.format : s.post.format) === "carousel";
const isReel = (s: ReportSnapshot) => (s.report_data?.available ? s.report_data.post?.format : s.post.format) === "reel";

/**
 * 릴스 시청 시간에서 문장에 쓰는 숫자 — 문장과 승인 가드(checkText)가 같이 쓴다(계산해서 나온 숫자도 스냅샷 값이다).
 * avg: 초(소수 한 자리) · dur: 영상 길이(초, 올린 파일에서만) · totalMin: 총 시청 분
 */
export function reelWatchNumbers(s: ReportSnapshot): { avg: number | null; dur: number | null; totalMin: number | null } {
  const m = ownerNumbers(s);
  const dur = s.report_data?.available ? s.report_data.post?.duration_sec ?? null : null;
  return {
    avg: typeof m.avg_watch_ms === "number" ? Math.round(m.avg_watch_ms / 100) / 10 : null,
    dur: typeof dur === "number" && dur > 0 ? dur : null,
    totalMin: typeof m.total_watch_ms === "number" ? Math.floor(m.total_watch_ms / 60000) : null,
  };
}

/**
 * 릴스 시청 시간 문단 (0930) — 좋은 숫자만:
 *   평균 시청 시간은 영상 길이의 절반 이상일 때만(길이를 모르면 10초 이상일 때만). 28초 릴스의 6.4초를 세우지 않는다.
 *   총 시청 시간은 1분 이상일 때 "N시간 M분".
 * 여러 가게 편은 「{가게}가 소개된 영상」 — 본 시간을 한 가게 몫으로 말하지 않는다.
 */
export function reelWatchLine(s: ReportSnapshot): string | null {
  const { avg, dur, totalMin } = reelWatchNumbers(s);
  const parts: string[] = [];
  if (avg !== null && (dur !== null ? avg >= dur / 2 : avg >= MIN_OWNER_VALUE)) {
    parts.push(`평균 시청 시간은 ${avg}초입니다. 평균 시청 시간은 릴스가 한 번 재생될 때 이용자가 머문 시간의 평균입니다.` +
      (dur !== null ? ` ${dur}초 길이 영상의 절반 넘게 머물렀다는 뜻입니다.` : ""));
  }
  if (totalMin !== null && totalMin >= 1) {
    const h = Math.floor(totalMin / 60), mm = totalMin % 60;
    const t = h > 0 ? `${h}시간${mm ? ` ${mm}분` : ""}` : `${mm}분`;
    const whose = s.post.co_stores > 1 ? `${josa(s.store.name, "이", "가")} 소개된` : s.store.name;
    parts.push(`모든 재생을 합친 총 시청 시간은 ${t}입니다. 이용자들이 그만큼의 시간 동안 ${whose} 영상을 보았습니다.`);
  }
  return parts.length ? parts.join(" ") : null;
}

/**
 * 점주 리포트 한 줄 요약 — 카톡 링크 미리보기(og:description)·사장님 리포트 목록에 쓴다. 리포트 카드 제목으로는 쓰지 않는다(0928).
 * (1005 — 마케팅: 도달 문장 말고 다른 내용으로) 2장 핵심 카드와 같은 **조회수 · 총반응 수**. 첫 문단과 같은 이름으로 부른다.
 */
export function ownerHeadline(s: ReportSnapshot): string {
  const views = ownerNumbers(s).views, acts = interactionsOf(s);
  if (views === undefined || views < MIN_OWNER_VALUE) return DEFAULT_SUMMARY;
  const what = `${curationIntro(s) ? "큐레이션 " : ""}${isReel(s) ? "릴스" : "콘텐츠"}`;
  const tail = acts !== null && acts >= MIN_OWNER_VALUE
    ? `조회수 ${views.toLocaleString()}회, 총반응 수 ${acts.toLocaleString()}건을`
    : `조회수 ${views.toLocaleString()}회를`;
  return `이번 ${s.store.name} ${what}는 ${tail} 기록했습니다.`;
}

/** **~1005 의** 한 줄 요약(도달) — 그때 만든 리포트에 박혀 있어 자동 요약으로 알아보는 데만 쓴다(isAutoSummary). */
export function headlineBefore1005(s: ReportSnapshot): string {
  const r = ownerNumbers(s).reach;
  if (r === undefined || r < MIN_OWNER_VALUE) return DEFAULT_SUMMARY;
  const who = s.post.co_stores > 1 ? `${s.store.name} 등 ${s.post.co_stores}곳을 소개한 이번 콘텐츠가` : `이번 ${s.store.name} 콘텐츠가`;
  return `${who} ${r.toLocaleString()}명에게 닿았습니다.`;
}

/** 0925 이전 interpret() 가 쓴 채널 비교 문장 — 이미 만든 리포트에 박혀 있어 공개 양식에서 알아보고 갈아 끼운다 */
const LEGACY_CHANNEL_LINE = /우리 채널(이 평소 올리는 게시물| 평소 게시물)/;
export const isLegacyChannelLine = (t: string) => LEGACY_CHANNEL_LINE.test(t);

/** 0925~0928 에 자동으로 넣던 짧은 문장("저장이 644번 모였습니다. …") — 사람이 쓴 게 아니므로 새 글로 갈아 끼운다 */
const OLD_AUTO_LINE = /^(저장이 [\d,]+번 모였습니다|[\d,]+회 조회됐습니다|[\d,]+번 공유됐습니다|[\d,]+명에게 닿았습니다)\./;
const isAutoLine = (t: string, s: ReportSnapshot) =>
  isLegacyChannelLine(t) || OLD_AUTO_LINE.test(t) || ownerStory(s).includes(t) || storyBefore1003(s).includes(t) || storyBefore1002(s).includes(t) ||
  t === watchParagraph(s); // 1003 에 몇 분 나갔다 뺀 총 시청 시간 문단

/**
 * 리포트에 실을 해석 문단 — 자동으로 들어갔던 문장(옛 채널 비교 · 옛 짧은 문장 · 지금 규칙의 글)은 **지금 규칙의 글**로,
 * 사람이 쓰거나 고친 문장은 그대로 뒤에 둔다. 사람이 전부 고쳤으면(자동 문장이 하나도 없으면) 사람 것만 싣는다.
 */
export function ownerParagraphs(interpretation: string[], s: ReportSnapshot): string[] {
  const human = interpretation.filter((t) => !isAutoLine(t, s));
  const hadAuto = interpretation.length === 0 || human.length < interpretation.length;
  return hadAuto ? [...ownerStory(s), ...human] : human;
}

/** 요약이 자동으로 들어간 것인가 — 자동이면 리포트 카드 제목으로 쓰지 않는다 */
export const isAutoSummary = (summary: string, s: ReportSnapshot) =>
  !summary || summary === DEFAULT_SUMMARY || summary === ownerHeadline(s) || summary === headlineBefore1005(s) || isLegacyChannelLine(summary);

/**
 * 「수치 다시 읽기」 — 손대지 않은 자동 문장은 **새 숫자로 다시 쓴다.** 그대로 두면 옛 숫자가 남아
 * 승인 가드가 "스냅샷에 없는 수치"로 막는다. 사람이 고친 문장·요약은 건드리지 않는다.
 */
export function refreshText(cur: { summary: string; interpretation: string[]; snapshot: ReportSnapshot }, next: ReportSnapshot): { summary?: string; interpretation?: string[] } {
  const out: { summary?: string; interpretation?: string[] } = {};
  if (isAutoSummary(cur.summary, cur.snapshot)) out.summary = ownerHeadline(next);
  const human = cur.interpretation.filter((t) => !isAutoLine(t, cur.snapshot));
  if (human.length < cur.interpretation.length || cur.interpretation.length === 0) out.interpretation = [...ownerStory(next), ...human];
  return out;
}

export function cohortNote(metrics: ReportMetric[]): string | null {
  // 순위가 있으면 분모를 셋 다 보여 준다 — "몇 건과 견줬는지"가 곧 이 숫자를 얼마나 믿을지다
  const r = metrics.find((x) => x.baskets?.all?.rank != null);
  if (r?.baskets) {
    const b = r.baskets;
    const part = (label: string, k: keyof typeof b) =>
      b[k].rank !== null && b[k].n >= 2 ? `${label} ${b[k].n}건 중 ${b[k].rank}위` : null;
    const bits = [part("최근", "recent5"), part("최근", "recent10"), part("전체", "all")].filter(Boolean);
    if (bits.length) return `같은 포맷 게시물과 견준 순위 — ${bits.join(" · ")} (1위가 최고)`;
  }
  const m = metrics.find(comparable);
  if (!m) return null;
  return `우리 채널이 최근 ${m.window_days ?? "-"}일 동안 올린 게시물 ${m.n}건의 중앙값(가운데 값) 기준`;
}

/**
 * 사장님 보고글(카톡 본문). 구조는 라라더 건 그대로 — 인사 · 어떤 게시물 · 해석 · 앱 · 맺음.
 * 해석은 공개 리포트와 같은 ownerStory — 첫 문장("…성과를 분석해 전달드립니다")은 인사 줄이 대신해 뺀다.
 * 채널 비교·순위 근거 줄은 싣지 않는다(0925).
 * 체크포인트마다 맺음이 다르다.
 */
export function buildReportText(s: ReportSnapshot, checkpoint: "D2" | "D7" | "D14" | "done" | "waiting"): string {
  const date = s.post.posted_at ? new Date(s.post.posted_at) : null;
  const when = date ? `${date.getMonth() + 1}/${date.getDate()}` : "최근";
  const co = s.post.co_stores > 1 ? ` ${s.post.co_stores}곳을 함께 소개한 큐레이션입니다.` : "";
  const lines: string[] = [
    "사장님, 안녕하세요. 우주라이크입니다.",
    "",
    `지난 ${when} 저희 인스타그램 '${stripMarker(s.post.topic)}' 게시물에 ${josa(s.store.name, "을", "를")} 소개해 드렸습니다.${co}${s.age_days !== null ? ` ${s.age_days}일이 지나 정리해 보내드립니다.` : ""}`,
    "",
  ];
  if (!s.metrics.length) {
    lines.push("아직 인스타그램 수치가 모이지 않았습니다. 모이는 대로 다시 보내드리겠습니다.");
  } else {
    const story = ownerStory(s).slice(1);
    if (story.length) lines.push(...story.flatMap((t) => [t, ""]));
    lines.push(`(${new Date(s.as_of).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준 인스타그램 수치)`, "");
  }
  // 앱은 0 이 아닌 것만 — "쿠폰 0장" 을 보내지 않는다
  const appBits = s.app ? [s.app.coupon_redeemed > 0 ? `쿠폰 ${s.app.coupon_redeemed}장이 사용됐고` : "", s.app.stamp_earned > 0 ? `스탬프 ${s.app.stamp_earned}개가 적립됐습니다` : ""].filter(Boolean) : [];
  if (appBits.length) {
    lines.push(`같은 달 앱에서는 ${appBits.join(" ").replace(/됐고$/, "됐습니다")}. 게시물과 직접 연결된 수치는 아니고, 같은 기간에 일어난 일입니다.`, "");
  }
  const close: Record<typeof checkpoint, string> = {
    D2: "이틀 치 초기 반응입니다. 다음 주에 저장·공유가 계속 도는지 한 번 더 보고 드리겠습니다.",
    D7: "일주일 치입니다. 2주 차에 총정리와 다음 제안을 드리겠습니다.",
    D14: "2주 치 총정리입니다. 이 게시물 추적은 여기서 마치고, 다음 편 계획을 말씀드리겠습니다.",
    done: "이 게시물 추적은 마쳤습니다. 감사합니다.",
    waiting: "수치가 모이면 다시 정리해 드리겠습니다.",
  };
  lines.push(close[checkpoint], "감사합니다.");
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/* ═══════════ 다음 제안 — 조건 → 템플릿 (사람 승인 전엔 안 나간다) ═══════════ */

type Basis = Required<Pick<ReportProposal, "signal" | "reading" | "tone">>;

/**
 * 근거 줄의 "지표 값" 조각. (1005 민찬) 「평소 가운데 값 …」 · 「가운데 값의 1.2배 이상 (n=45)」 같은 채널 비교는 화면에서 뺐다 —
 * 상위권 · 하위권 판정을 지운 것과 같은 이유. 규칙이 **언제** 걸리는지(when)는 여전히 가운데 값으로 고른다.
 */
function sig(s: ReportSnapshot, key: string): string {
  const m = s.metrics.find((x) => x.key === key);
  return m ? `${METRIC_LABEL[key] ?? key} ${m.value.toLocaleString()}` : "";
}

/** ~1005 에 만든 리포트의 근거 줄에 박힌 채널 비교 조각을 걷어낸다 — 화면(ProposalBasis)이 부른다. */
export function stripChannelCompare(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/ · 평소 가운데 값 (약 )?[\d,]+/g, "")
    .replace(/[가-힣]+ 가운데 값의 [\d.]+배 이상 \(n=\d+\)( · )?/g, "")
    .trim();
}

const RULES: { rule: string; title: string; when: (s: ReportSnapshot) => boolean; text: (s: ReportSnapshot) => string; basis: (s: ReportSnapshot) => Basis }[] = [
  {
    rule: "P1", title: "매장 안 QR 안내물",
    when: (s) => { const m = s.metrics.find((x) => x.key === "saved"); return Boolean(m && comparable(m) && m.value >= (m.median as number) * 1.2 && s.app && s.app.coupon_redeemed === 0); },
    // 인스타 지표와 앱 지표를 한 문장에서 잇지 않는다(인과 금지). 문장을 끊는다.
    // 0925: "평소보다 많았습니다" · "쿠폰 사용은 아직 없습니다" 를 뺐다 — 채널 비교도, 약점도 점주 문장에 쓰지 않는다.
    text: (s) => `이번 게시물은 저장이 ${(s.metrics.find((x) => x.key === "saved")?.value ?? 0).toLocaleString()}번 모였습니다. 가게에 오신 분들이 앱 쿠폰을 바로 쓰실 수 있게, 계산대 QR 안내물 위치를 한 번 봐 주시면 좋겠습니다.`,
    basis: (s) => ({ signal: `${sig(s, "saved")} / 이번 달 쿠폰 사용 ${s.app?.coupon_redeemed ?? 0}`, reading: "앱 쿠폰 사용 없음 (병렬 서술, 인과 아님)", tone: "good" }),
  },
  {
    rule: "P3", title: "모임·단체 소구",
    when: (s) => { const m = s.metrics.find((x) => x.key === "shares"); return Boolean(m && comparable(m) && m.value >= (m.median as number) * 1.3); },
    text: () => "공유는 '여기 가자'고 친구에게 보낸 수입니다. 3~4인 세트 메뉴를 한정 쿠폰으로 걸면 이 흐름을 받을 수 있습니다.",
    basis: (s) => ({ signal: sig(s, "shares"), reading: "", tone: "good" }),
  },
  {
    rule: "P6", title: "스탬프 목표 개수 조정",
    when: (s) => Boolean(s.app && s.app.stamp_earned > 0 && s.app.revisit === 0),
    text: (s) => `스탬프가 ${s.app?.stamp_earned ?? 0}개 모였습니다. 목표 개수를 조금 낮추면 첫 보상을 받는 분이 더 빨리 나옵니다.`,
    basis: (s) => ({ signal: `이번 달 스탬프 적립 ${s.app?.stamp_earned ?? 0} / 재방문 ${s.app?.revisit ?? 0}`, reading: "스탬프는 쌓이는데 재방문 0", tone: "gray" }),
  },
];

/**
 * 최대 2개, 표 순서. 지난 리포트에서 쓴 rule 은 건너뛴다(2개월 연속 금지). 하나도 안 걸리면 빈 배열 — 억지로 채우지 않는다.
 * 중앙값 기반 규칙(P1·P3)은 벤치마크와 **같은 표본 게이트**를 탄다 — `comparable()` 이 false 인 지표로는 제안이 생기지 않는다(when 안에서 검사).
 * 비교는 **언제 제안할지**를 고르는 데만 쓰고, 점주 문장에는 쓰지 않는다(0925).
 * P2(프로필 방문이 적었다)·P4(평소보다 적게 나갔다)는 약점을 말하는 제안이라 0925 에 없앴다 — RETIRED_RULES.
 */
export function propose(s: ReportSnapshot, usedRules: string[] = []): ReportProposal[] {
  return RULES.filter((r) => !usedRules.includes(r.rule) && r.when(s)).slice(0, 2).map((r) => ({ rule: r.rule, title: r.title, generated_text: r.text(s), text: r.text(s), approved: false, edited_by: null, edited_at: null, ...r.basis(s) }));
}

export const RETIRED_RULES = ["P2", "P4"];

/**
 * 이미 만든 리포트의 제안을 공개 양식에 실을 문장으로. 없앤 규칙은 빼고, 사람이 손대지 않은 기계 문장은 **지금 규칙의 문장**으로 바꾼다.
 * 사람이 고친 문장은 그대로 둔다 — 그 사람이 승인 가드를 통과시킨 문장이다.
 */
export function ownerProposalText(p: ReportProposal, s: ReportSnapshot): string | null {
  if (RETIRED_RULES.includes(p.rule)) return null;
  const rule = RULES.find((r) => r.rule === p.rule);
  return rule && p.text === p.generated_text ? rule.text(s) : p.text;
}

/* ═══════════ 금지 표현 — 승인 시점 서버 검사, 걸리면 발행 차단 ═══════════ */

export const BANNED: { word: string; why: string; appOnly?: boolean }[] = [
  { word: "전원 당첨", why: "마일리지 금지 표현" }, { word: "100%", why: "마일리지 금지 표현" }, { word: "보장", why: "마일리지 금지 표현" }, { word: "반드시", why: "마일리지 금지 표현" },
  { word: "예상 도달", why: "표시광고법 — 근거 없는 예측" }, { word: "12주 안에", why: "근거 없는 기간 약속" }, { word: "매출 오릅니다", why: "근거 없는 성과 약속" }, { word: "매출이 늘어납니다", why: "근거 없는 성과 약속" }, { word: "상위권", why: "비교군 없는 우량 주장" },
  { word: "학생회 게재 보장", why: "제3자 자율 운영" },
  { word: "덕분에", why: "앱 지표 인과 주장 금지", appOnly: true }, { word: "때문에 늘", why: "앱 지표 인과 주장 금지", appOnly: true }, { word: "효과로", why: "앱 지표 인과 주장 금지", appOnly: true },
];

const IG_WORDS = ["저장", "도달", "조회", "공유", "좋아요", "댓글", "게시물"];
const APP_WORDS = ["쿠폰", "스탬프", "재방문", "단골", "마일리지", "식사권"];
const CAUSAL = ["덕분", "때문", "효과", "이어져", "이어졌", "늘었", "늘어", "증가", "덕에", "로 인해"];

/**
 * 발행 게이트 — 세 층. 걸리면 차단이고 어디가 문제인지 돌려준다.
 *  L1 단어·구(BANNED). L2 구조: 한 문장에 인스타 지표와 앱 지표가 인과 어휘와 함께 있으면 차단, 금액 표기(원)는 공개 리포트에 없다.
 *  L3 PII: 휴대폰·사업자번호·PIN — 스냅샷이 아니라 **사람이 친 문장**이 새는 길을 막는다.
 *  숫자: 날짜·시각·연도를 먼저 가리고, 스냅샷 원값·반올림값·파생값에 없는 4자리 이상 숫자는 지어낸 수치로 본다.
 */
export function checkText(text: string, s: ReportSnapshot): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const b of BANNED) if (text.includes(b.word)) problems.push(`"${b.word}" — ${b.why}`);
  // L2 구조
  for (const sent of text.split(/(?<=[.!?。])\s+|\n/)) {
    const ig = IG_WORDS.some((w) => sent.includes(w)), app = APP_WORDS.some((w) => sent.includes(w)), causal = CAUSAL.some((w) => sent.includes(w));
    if (ig && app && causal) problems.push(`"${sent.trim().slice(0, 40)}…" — 게시물 지표와 앱 지표를 한 문장에서 인과로 잇지 않습니다`);
  }
  if (/\d[\d,]*\s?원/.test(text)) problems.push("금액(원) — 공개 리포트에는 금액을 넣지 않습니다");
  // L3 PII
  if (/01[016-9]-?\d{3,4}-?\d{4}/.test(text)) problems.push("휴대폰 번호 — 공개 페이지에 실을 수 없습니다");
  if (/\d{3}-\d{2}-\d{5}/.test(text)) problems.push("사업자등록번호 — 공개 페이지에 실을 수 없습니다");
  if (/(PIN|핀\s?번호|비밀번호)\s*[:：]?\s*\d{3,}/i.test(text)) problems.push("PIN — 공개 페이지에 실을 수 없습니다");
  // 숫자
  const allowed = new Set<string>();
  const add = (v: number) => { allowed.add(String(v)); allowed.add(v.toLocaleString()); allowed.add(approx(v).replace("약 ", "")); };
  for (const m of s.metrics) { for (const v of [m.value, m.median, m.p10, m.p90]) if (v !== null) add(v); if (m.delta_pct !== null) add(Math.abs(m.delta_pct)); add(m.n); }
  // 리포트 카드와 해석 문단은 report-data(그 시점 값)를 먼저 쓴다 — 그 숫자도 스냅샷 값이다
  if (s.report_data?.available) for (const v of Object.values(s.report_data.metrics ?? {})) if (typeof v === "number") add(v);
  // 릴스 시청 시간 문단의 숫자 — 밀리초에서 계산해 나온 초·시간·분도 스냅샷 값이다
  { const w = reelWatchNumbers(s);
    if (w.avg !== null) { add(Math.floor(w.avg)); add(Math.round((w.avg % 1) * 10)); }
    if (w.dur !== null) add(w.dur);
    if (w.totalMin !== null) { add(w.totalMin); add(Math.floor(w.totalMin / 60)); add(w.totalMin % 60); } }
  if (s.app) for (const v of Object.values(s.app)) if (typeof v === "number") add(v);
  // 반응 수 합계(1002) — 넷을 더해 나온 값도 스냅샷 값이다
  { const r = interactionsOf(s); if (r !== null) add(r); }
  // 인스타 앱에서 손으로 옮긴 값과 거기서 계산한 비중(1003) — 소수는 정수부·소수부로 나뉘어 읽힌다
  { const dec = (v: number) => { add(Math.floor(v)); add(Math.round((v % 1) * 10)); };
    const age = ageShare(s.manual);
    if (age) { for (const v of [age.p18_24, age.p25_34, age.sum]) dec(v); for (const y of [18, 24, 25, 34]) add(y); }
    const share = slideShare(s.manual, ownerNumbers(s).likes);
    if (share !== null) dec(share);
    if (s.manual?.slide_likes) { add(s.manual.slide_likes.thumb); add(s.manual.slide_likes.store); }
    if (typeof s.manual?.store_count === "number") add(s.manual.store_count);
    if (typeof s.manual?.non_follower_pct === "number") dec(s.manual.non_follower_pct); }
  add(s.post.co_stores);
  const masked = text.replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, " ").replace(/\d{4}년|\d{1,2}월|\d{1,2}일|\d{1,2}:\d{2}/g, " ").replace(/20\d{2}/g, " ");
  /**
   * 0925: 이 정규식이 **네 자리 이상이나 쉼표가 들어간 수**만 잡았다. 그런데 우리 실측은
   * 대부분 두세 자리다(중앙값 참여 61 같은). "저장 320건" · "도달 87%" 를 적어도 그대로
   * 통과했고, 화면은 "스냅샷에 없는 숫자는 승인이 막힙니다" 라고 말하고 있었다 —
   * 정확히 중요한 구간을 놓치고 있었다.
   *
   * 한 자리부터 본다. 날짜·시각·연도는 위에서 이미 가렸고, 아래에서 흔한 서수·분모를
   * 한 번 더 걸러 낸다 — 그것까지 막으면 "세 가지를 제안합니다" 도 못 쓴다.
   */
  const HARMLESS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "100"]);
  for (const num of masked.match(/\d{1,3}(?:,\d{3})+|\d+/g) ?? []) {
    const bare = num.replace(/,/g, "");
    if (allowed.has(num) || allowed.has(bare) || HARMLESS.has(bare)) continue;
    problems.push(`숫자 ${num} — 스냅샷에 없는 수치`);
  }
  return { ok: problems.length === 0, problems };
}

export function reportAllText(r: { title: string; summary: string; interpretation: string[]; proposals: ReportProposal[] }): string {
  return [r.title, r.summary, ...r.interpretation, ...r.proposals.filter((p) => p.approved).map((p) => `${p.title}\n${p.text}`)].join("\n");
}
