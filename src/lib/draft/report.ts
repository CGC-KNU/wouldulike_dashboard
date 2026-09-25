import type { ReportMetric, ReportMetricSource, ReportProposal, ReportSnapshot, VerdictTone } from "./types";

/**
 * 매장 리포트의 순수 함수들 — 비교(벤치마크) · 해석 문장 · 제안 · 금지 표현.
 *
 * 0911 토론에서 합의된 규칙:
 *  - 비교군은 **우리 채널 평소 게시물**(Papillon cohort) 하나. "업계 평균"은 없다. 표본 n<5 또는 hidden 이면 비교하지 않는다.
 *  - 계산은 중앙값이고 문장도 "중앙값"이라고 말한다. 표본 수·기간을 근거 줄에 밝힌다.
 *  - 근거가 없으면 그 자리를 다른 주장으로 메우지 않는다 ("상위권" 금지).
 *  - 헤드라인은 고정 순서(저장 → 도달 → 조회). 잘 나온 지표를 고르지 않는다.
 *  - 자기 수치는 정확하게, 비교군만 "약". 여러 매장이 함께 나온 게시물이면 그 사실을 문장이 말한다.
 *  - 앱 지표는 병렬 서술, 인과 주장 금지.
 *
 * 0925 마케팅 피드백으로 **점주에게 나가는 문장**의 규칙이 바뀌었다:
 *  - 우리 채널 평소 게시물과 견주지 않는다. 사장님이 궁금한 건 채널 안 순위가 아니라 가게가 얼마나 알려졌는지다.
 *    채널 비교(verdict · cohortNote · 제안 근거 줄)는 Probe 내부 화면에만 남는다.
 *  - 약점을 말하지 않고, 문장에 올릴 만한 크기(MIN_OWNER_VALUE)의 숫자만 쓴다. 없는 숫자를 만들지는 않는다.
 */

export const METRIC_LABEL: Record<string, string> = { saved: "저장", reach: "도달", views: "조회", shares: "공유", likes: "좋아요", comments: "댓글", profile_visits: "프로필 방문", follows: "팔로우" };
export const TILE_KEYS = ["views", "reach", "likes", "comments", "saved", "shares"] as const;
export const HEADLINE_ORDER = ["saved", "reach", "views"] as const;
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
 * 지표 판정 한 마디 — 목록 · 게시물 패널 · 리포트 편집이 같이 부른다(따로 쓰면 같은 상태를 다른 말로 부른다).
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

const WHY: Record<string, string> = {
  saved: "저장은 '나중에 가봐야지' 하고 담아두는 행동이라, 맛집 콘텐츠에서는 방문 의향에 가장 가까운 신호로 봅니다.",
  reach: "도달은 게시물을 한 번이라도 본 계정 수입니다.",
  views: "조회는 게시물이 화면에 펼쳐진 횟수입니다.",
  shares: "공유는 '여기 같이 가자'고 친구에게 보낸 수입니다.",
};
const OWNER_LINE: Record<string, (v: string) => string> = {
  saved: (v) => `저장이 ${v}번 모였습니다.`,
  reach: (v) => `${v}명에게 닿았습니다.`,
  views: (v) => `${v}회 조회됐습니다.`,
  shares: (v) => `${v}번 공유됐습니다.`,
};

/** 받침에 맞는 조사 — 한글로 끝나지 않으면 "이(가)" 꼴로 둔다 */
export function josa(word: string, withBatchim: string, without: string): string {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${word}${withBatchim}(${without})`;
  return word + ((c - 0xac00) % 28 ? withBatchim : without);
}

/**
 * 점주 문장 한 줄 — 수치는 정확하게, 뜻은 WHY 로. **우리 채널 평소 게시물과 견주지 않는다**(0925, 머리말).
 * 0925 이전에는 "우리 채널이 평소 올리는 게시물 N건의 가운데 값보다 낮았습니다 · N건 중 M번째" 를 썼다.
 */
export function interpret(m: ReportMetric): string {
  const v = m.value.toLocaleString();
  const head = OWNER_LINE[m.key]?.(v) ?? `${METRIC_LABEL[m.key] ?? m.key} ${v}.`;
  return [head, WHY[m.key]].filter(Boolean).join(" ");
}

/** 점주 해석 문단 — 헤드라인 순서(저장 → 도달 → 조회)에서 문장에 올릴 만한 크기인 것 두 개. 없으면 빈 배열 */
export function ownerLines(metrics: ReportMetric[]): string[] {
  return HEADLINE_ORDER.map((k) => metrics.find((m) => m.key === k))
    .filter((m): m is ReportMetric => Boolean(m) && (m as ReportMetric).value >= MIN_OWNER_VALUE)
    .slice(0, 2).map(interpret);
}

/** 점주 리포트 제목 줄 — 이 콘텐츠가 몇 명에게 닿았나. 문장에 올릴 크기가 아니면 DEFAULT_SUMMARY(공개 양식은 제목을 숨긴다) */
export function ownerHeadline(s: ReportSnapshot): string {
  const r = s.metrics.find((m) => m.key === "reach");
  if (!r || r.value < MIN_OWNER_VALUE) return DEFAULT_SUMMARY;
  const who = s.post.co_stores > 1 ? `${s.store.name} 등 ${s.post.co_stores}곳을 소개한 이번 콘텐츠가` : `이번 ${s.store.name} 콘텐츠가`;
  return `${who} ${r.value.toLocaleString()}명에게 닿았습니다.`;
}

/** 0925 이전 interpret() 가 쓴 채널 비교 문장 — 이미 만든 리포트에 박혀 있어 공개 양식에서 알아보고 갈아 끼운다 */
const LEGACY_CHANNEL_LINE = /우리 채널(이 평소 올리는 게시물| 평소 게시물)/;
export const isLegacyChannelLine = (t: string) => LEGACY_CHANNEL_LINE.test(t);

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
 * 사장님 보고글(카톡 본문). 구조는 라라더 건 그대로 — 인사 · 어떤 게시물 · 해석 · 나머지 · 앱 · 맺음.
 * 해석은 ownerLines(저장 → 도달 → 조회 중 문장에 올릴 크기). 채널 비교·순위 근거 줄은 싣지 않는다(0925).
 * 체크포인트마다 맺음이 다르다.
 */
export function buildReportText(s: ReportSnapshot, checkpoint: "D2" | "D7" | "D14" | "done" | "waiting"): string {
  const date = s.post.posted_at ? new Date(s.post.posted_at) : null;
  const when = date ? `${date.getMonth() + 1}/${date.getDate()}` : "최근";
  const co = s.post.co_stores > 1 ? ` ${s.post.co_stores}곳을 함께 소개한 큐레이션입니다.` : "";
  const lines: string[] = [
    "사장님, 안녕하세요. 우주라이크입니다.",
    "",
    `지난 ${when} 저희 인스타그램 '${s.post.topic}' 게시물에 ${s.store.name}을(를) 소개해 드렸습니다.${co}${s.age_days !== null ? ` ${s.age_days}일이 지나 정리해 보내드립니다.` : ""}`,
    "",
  ];
  if (!s.metrics.length) {
    lines.push("아직 인스타그램 수치가 모이지 않았습니다. 모이는 대로 다시 보내드리겠습니다.");
  } else {
    const said = ownerLines(s.metrics);
    if (said.length) lines.push(...said, "");
    const saidKeys = HEADLINE_ORDER.filter((k) => s.metrics.some((m) => m.key === k && m.value >= MIN_OWNER_VALUE)).slice(0, 2) as string[];
    const rest = TILE_KEYS.filter((k) => !saidKeys.includes(k)).map((k) => s.metrics.find((m) => m.key === k))
      .filter((m): m is ReportMetric => Boolean(m) && (m as ReportMetric).value >= MIN_OWNER_VALUE);
    if (rest.length) lines.push(rest.map((m) => `${METRIC_LABEL[m.key] ?? m.key} ${m.value.toLocaleString()}`).join(" · "), "");
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

/** 근거 줄의 "지표 값 · 평소 가운데 값" 조각. 비교군만 "약". */
function sig(s: ReportSnapshot, key: string): string {
  const m = s.metrics.find((x) => x.key === key);
  if (!m) return "";
  return `${METRIC_LABEL[key] ?? key} ${m.value.toLocaleString()}${m.median !== null ? ` · 평소 가운데 값 ${approx(m.median)}` : ""}`;
}
/** 해석은 규칙이 실제로 본 기준(가운데 값의 배수)으로 말한다 — verdict()의 p10·p90 경계와 섞으면 "범위 안 · 1.3배 이상" 처럼 서로 어긋난다. */
const above = (s: ReportSnapshot, key: string, x: number) => { const m = s.metrics.find((v) => v.key === key); return m ? `${METRIC_LABEL[key] ?? key} 가운데 값의 ${x}배 이상 (n=${m.n})` : ""; };

const RULES: { rule: string; title: string; when: (s: ReportSnapshot) => boolean; text: (s: ReportSnapshot) => string; basis: (s: ReportSnapshot) => Basis }[] = [
  {
    rule: "P1", title: "매장 안 QR 안내물",
    when: (s) => { const m = s.metrics.find((x) => x.key === "saved"); return Boolean(m && comparable(m) && m.value >= (m.median as number) * 1.2 && s.app && s.app.coupon_redeemed === 0); },
    // 인스타 지표와 앱 지표를 한 문장에서 잇지 않는다(인과 금지). 문장을 끊는다.
    // 0925: "평소보다 많았습니다" · "쿠폰 사용은 아직 없습니다" 를 뺐다 — 채널 비교도, 약점도 점주 문장에 쓰지 않는다.
    text: (s) => `이번 게시물은 저장이 ${(s.metrics.find((x) => x.key === "saved")?.value ?? 0).toLocaleString()}번 모였습니다. 가게에 오신 분들이 앱 쿠폰을 바로 쓰실 수 있게, 계산대 QR 안내물 위치를 한 번 봐 주시면 좋겠습니다.`,
    basis: (s) => ({ signal: `${sig(s, "saved")} / 이번 달 쿠폰 사용 ${s.app?.coupon_redeemed ?? 0}`, reading: `${above(s, "saved", 1.2)} · 앱 쿠폰 사용 없음 (병렬 서술, 인과 아님)`, tone: "good" }),
  },
  {
    rule: "P3", title: "모임·단체 소구",
    when: (s) => { const m = s.metrics.find((x) => x.key === "shares"); return Boolean(m && comparable(m) && m.value >= (m.median as number) * 1.3); },
    text: () => "공유는 '여기 가자'고 친구에게 보낸 수입니다. 3~4인 세트 메뉴를 한정 쿠폰으로 걸면 이 흐름을 받을 수 있습니다.",
    basis: (s) => ({ signal: sig(s, "shares"), reading: above(s, "shares", 1.3), tone: "good" }),
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
  if (s.app) for (const v of Object.values(s.app)) if (typeof v === "number") add(v);
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
