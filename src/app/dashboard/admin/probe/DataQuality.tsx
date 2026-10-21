"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import type { QualityIssue, QualitySeverity } from "@/lib/draft/types";
import { storeFixTarget } from "@/lib/draft/quality";
import { Button, Card, Chip, DraftBadge, Empty, FilterPills, Kpi, Notice, PageHeader, Skeleton, focusRing, type ChipTone } from "../_shared/ui";
import { OWNERS, TagChip, takeParam, ownerOf, type Owner } from "./kit";

/**
 * Probe · 데이터 정합성 점검.
 *
 * 이 화면 하나가 Probe 를 만들 이유다. 최근 사고가 전부 같은 모양이었다. **데이터 두 곳이 어긋났는데 사람이 우연히 볼 때까지 아무도 몰랐다.**
 *   · 09-05 "지금 제휴 아닌 하카타파스타가 튜토리얼에 뜬다"
 *   · 09-10 "첫 가입 화면 쿠폰이 실제 쿠폰과 다르다"
 *
 * 규칙으로 박아두면 화면이 먼저 말한다. 각 항목엔 어느 데이터를 비교했는지(source)와 어디서 고치는지(hint)가 붙는다.
 * Pitchr 에이전트 액션의 "제안 → 승인/거부" 카드 문법을 빌렸다. 여기서는 "고치러 가기" 가 승인이다.
 */

const SEV_LABEL: Record<QualitySeverity, string> = { high: "높음", medium: "보통", low: "낮음" };
// 빨강은 「높음」 · 「보류」만, 주황은 「확인 필요」만 — 한 색 한 뜻(1022 목업)
const SEV_TONE: Record<QualitySeverity, ChipTone> = { high: "red", medium: "amber", low: "gray" };

/**
 * 규칙별 "어디서 고치나" 딥링크. 화면이 문제만 말하고 끝나면 "그래서 뭐?" 가 된다.
 * 1013: 플랜·혜택이 숨은 「식당 관리」 탭(0913 에 Astro 로 합쳐져 어느 제품에도 없다)으로 가고 있었다.
 * 혜택 두 규칙은 탭 단위로 갈 곳이 없어 버튼을 빼고, 매장 이름이 그 매장의 쿠폰 편집 화면을 연다(storeFixTarget).
 */
const FIX_TAB: Record<string, { tab: string; label: string }> = {
  TIER_MISSING: { tab: "astro-ops", label: "파트너 매장에서 플랜 지정" },
  INACTIVE_STILL_EXPOSED: { tab: "satellite", label: "Papillon 배너/팝업에서 내리기" },
  OPS_ROW_MISSING: { tab: "astro-ops", label: "매장 현황에서 기록" },
  PAID_TIER_UNSETTLED: { tab: "astro-billing", label: "입금 현황에서 처리" },
  PAID_NO_KIT: { tab: "astro-ops", label: "매장 현황에서 체크" },
  SEASON_UNSET: { tab: "astro-ops", label: "매장 현황에서 설정" },
  LEAD_STALE: { tab: "astro-leads", label: "입점 후보에서 연락" },
  APP_CAMPUS_MISSING: { tab: "astro-ops", label: "파트너 매장에서 캠퍼스 지정" },
  CAMPUS_MISMATCH: { tab: "astro-ops", label: "파트너 매장에서 캠퍼스 확인" },
};

interface Payload {
  issues: QualityIssue[];
  counts: Record<QualitySeverity, number>;
  checked: { restaurants: number; benefits: number; featured: number; leads: number; test_excluded?: number };
  backend_reachable: boolean;
  /** 옛 응답엔 없다 — 없으면 읽은 것으로 본다 */
  ops_reachable?: boolean;
  leads_reachable?: boolean;
  generated_at: string;
  draft?: boolean;
  draft_note?: string;
}

/** 「처리함」 — 고친 뒤 눌러 같은 건을 두 번 고치지 않게 한다. 규칙 + 대상이 키다 */
const DONE_KEY = "probe.quality.done.v1";
type Done = Record<string, { by: string; at: string }>;
const keyOf = (i: QualityIssue) => `${i.rule}:${i.subject}`;
function readDone(): Done { try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Done; } catch { return {}; } }

export default function DataQuality({ onGo, actor }: { onGo?: (tab: string) => void; actor?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sev, setSev] = useState<QualitySeverity | "all">(() => { const v = takeParam("sev"); return v === "high" || v === "medium" || v === "low" ? v : "all"; });
  const [owner, setOwner] = useState<Owner | "all">("all");
  const [copied, setCopied] = useState(false);
  /**
   * 처리함은 이 브라우저에만 남는다 — 백엔드에 칸이 아직 없다(개발 중). 그래서 다른 사람 화면에는 안 보이고,
   * 사이드바 · 홈의 「높음」 개수에도 안 빠진다. 같은 건을 두 사람이 고치지 않게 하는 공유 처리함은 칸이 생긴 뒤에 잇는다.
   */
  const [done, setDone] = useState<Done>({});
  useEffect(() => setDone(readDone()), []);
  const mark = (i: QualityIssue, on: boolean) => setDone((d) => {
    const next = { ...d };
    if (on) next[keyOf(i)] = { by: actor || "나", at: new Date().toISOString() }; else delete next[keyOf(i)];
    try { localStorage.setItem(DONE_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
    return next;
  });
  const isDone = (i: QualityIssue) => keyOf(i) in done;

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/probe/quality")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const all = useMemo(() => data?.issues ?? [], [data]);
  const open = useMemo(() => all.filter((i) => !isDone(i)), [all, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = { high: open.filter((i) => i.severity === "high").length, medium: open.filter((i) => i.severity === "medium").length, low: open.filter((i) => i.severity === "low").length };
  const doneN = all.length - open.length;
  const issues = useMemo(() => all.filter((i) => (sev === "all" || i.severity === sev) && (owner === "all" || ownerOf(i) === owner)), [all, sev, owner]);
  const ownerCount = (o: Owner | "all") => open.filter((i) => (sev === "all" || i.severity === sev) && (o === "all" || ownerOf(i) === o)).length;

  /** 규칙 + 심각도로 묶는다. 같은 규칙에 20곳이 걸리면 20줄보다 1묶음이 낫다. 아직 남은 묶음이 먼저 */
  const groups = useMemo(() => {
    const m = new Map<string, QualityIssue[]>();
    for (const i of issues) {
      const k = `${i.rule}:${i.severity}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    const order = { high: 0, medium: 1, low: 2 } as const;
    const left = (l: QualityIssue[]) => l.filter((i) => !(keyOf(i) in done)).length;
    return [...m.values()].sort((a, b) => order[a[0].severity] - order[b[0].severity] || Number(left(a) === 0) - Number(left(b) === 0) || b.length - a.length);
  }, [issues, done]);

  async function copyAll() {
    if (!data) return;
    const today = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date());
    const text = [
      `[데이터 정합성 ${today}] 높음 ${data.counts.high} · 보통 ${data.counts.medium} · 낮음 ${data.counts.low}`,
      ...data.issues.map((i) => `- [${SEV_LABEL[i.severity]}] ${i.subject}: ${i.title}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 무시 */
    }
  }

  const filtered = sev !== "all" || owner !== "all";
  return (
    <>
      <PageHeader
        title="데이터 정합성 점검"
        description="매장·혜택·기획전·입금 기록·캠퍼스를 서로 비교해 어긋난 곳을 찾습니다. 매장 이름을 누르면 고치는 화면이 바로 열리고, 고친 뒤 「처리함」을 누르면 어디까지 했는지 남습니다."
        actions={
          <>
            {data?.draft && <DraftBadge note={data.draft_note} />}
            <Button icon={<IconCopy />} onClick={copyAll} aria-live="polite" disabled={!data}>
              {copied ? "복사했습니다" : "슬랙용 복사"}
            </Button>
            <Button icon={<IconRefresh />} onClick={load} disabled={loading}>
              다시 점검
            </Button>
          </>
        }
      />

      {/* 백엔드를 못 읽으면 규칙 대부분이 침묵한다. '이상 없음'과 반드시 구별한다. */}
      {data && !data.backend_reachable && (
        <div className="mb-4">
          <Notice tone="red" title="백엔드를 읽지 못했습니다">
            매장·혜택·기획전을 비교하는 규칙이 전부 침묵합니다. 아래가 비어 있어도 <strong>이상 없음이 아닙니다.</strong>
          </Notice>
        </div>
      )}

      {/* 운영 기록·후보만 못 읽은 경우 — 그 규칙만 침묵한다. 1013 전에는 이때 9/3 시드로 판정했다 */}
      {data && data.backend_reachable && (data.ops_reachable === false || data.leads_reachable === false) && (
        <div className="mb-4">
          <Notice tone="amber" title={`${[data.ops_reachable === false && "Astro 운영 기록", data.leads_reachable === false && "입점 후보"].filter(Boolean).join(" · ")}을(를) 읽지 못했습니다`}>
            {data.ops_reachable === false && "입금·비치물·학기·캠퍼스 비교 규칙이 침묵합니다. "}
            {data.leads_reachable === false && "방치된 컨택 규칙이 침묵합니다. "}
            해당 항목이 없어도 <strong>이상 없음이 아닙니다.</strong>
          </Notice>
        </div>
      )}

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <Kpi soft label="높음" value={loading ? "-" : counts.high} tone="alert" hint="사용자에게 이미 보이는 문제" onClick={() => setSev(sev === "high" ? "all" : "high")} active={sev === "high"} />
        <Kpi soft label="보통" value={loading ? "-" : counts.medium} hint="곧 문제가 됨" onClick={() => setSev(sev === "medium" ? "all" : "medium")} active={sev === "medium"} />
        <Kpi soft label="낮음" value={loading ? "-" : counts.low} hint="비어 있는 칸" onClick={() => setSev(sev === "low" ? "all" : "low")} active={sev === "low"} />
        <Kpi label="점검 범위" value={loading ? "-" : data?.checked.restaurants ?? 0} suffix="매장" hint={data ? `혜택 ${data.checked.benefits} · 기획전 ${data.checked.featured} · 후보 ${data.checked.leads}${data.checked.test_excluded ? ` · 테스트 매장 ${data.checked.test_excluded}곳 제외` : ""}${doneN ? ` · 처리함 ${doneN}건은 위 숫자에서 뺐습니다` : ""}` : undefined} />
      </div>
      <div className="mb-4">
        <FilterPills soft label="담당" value={owner} onChange={setOwner} options={[{ key: "all", label: "담당 전체", count: ownerCount("all") }, ...OWNERS.map((o) => ({ key: o, label: o, count: ownerCount(o) }))]} />
      </div>

      {loading ? (
        <Card flush><Skeleton rows={5} cols={3} /></Card>
      ) : groups.length === 0 ? (
        <Card>
          {filtered ? <Empty title="조건에 맞는 항목이 없습니다" detail="담당이나 심각도 선택을 풀어 보세요." /> : (
            <Empty
              title={data?.backend_reachable ? "어긋난 데이터가 없습니다" : "판정할 수 없습니다"}
              detail={data?.backend_reachable ? "지금 규칙 기준으로는 깨끗합니다. 규칙은 늘려 가면 됩니다." : "백엔드 연결을 먼저 확인하세요."}
            />
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((list) => {
            const head = list[0];
            const fix = FIX_TAB[head.rule];
            const left = list.filter((i) => !isDone(i)).length;
            return (
              <Card key={`${head.rule}:${head.severity}`} className={left === 0 ? "opacity-60" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip tone={SEV_TONE[head.severity]} dot={head.severity === "high"}>{SEV_LABEL[head.severity]}</Chip>
                      <h3 className="text-[15px] font-semibold text-gray-900">{head.title}</h3>
                      <span className="text-[12px] text-gray-600 tabular-nums">{left ? `${left}곳 남음` : "모두 처리함"}{list.length - left && left ? ` · 처리함 ${list.length - left}` : ""}</span>
                    </div>
                    <p className="text-[13px] text-gray-600 mt-2 leading-relaxed">{head.detail}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TagChip>담당 {ownerOf(head)}</TagChip>
                    {fix && onGo && (
                      <Button size="sm" icon={<IconArrowRight />} onClick={() => onGo(fix.tab)} title="목록 화면으로 갑니다 — 한 곳씩 고칠 때는 아래 매장 이름을 누르세요">
                        {fix.label}
                      </Button>
                    )}
                  </div>
                </div>

                <ul className="flex flex-wrap gap-2 mt-3">
                  {list.map((i) => {
                    // 매장 이름을 누르면 그 매장을 고치는 자리로 — 갈 곳이 없는 항목(후보·기획전)은 글자만
                    const to = storeFixTarget(i);
                    const href = to && "href" in to ? to.href : null;
                    const tab = to && "tab" in to ? to.tab : null;
                    const cls = "inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-[6px]";
                    const link = `${cls} text-[#5558DD] bg-navy/[0.05] hover:bg-navy/[0.1] ${focusRing}`;
                    const d = isDone(i);
                    return (
                      <li key={i.id} className={`inline-flex items-center gap-1 ${d ? "opacity-60" : ""}`}>
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer" className={link} title="쿠폰 & 스탬프 편집 화면을 새 탭으로 엽니다">{i.subject}<IconArrowRight size={14} aria-hidden="true" /></a>
                        ) : tab && onGo ? (
                          <button type="button" onClick={() => onGo(tab)} className={link} title="Astro 매장 상세를 엽니다">{i.subject}<IconArrowRight size={14} aria-hidden="true" /></button>
                        ) : (
                          <span className={`${cls} text-gray-700 bg-black/[0.05]`}>{i.subject}</span>
                        )}
                        {d ? (
                          <>
                            <Chip tone="green">처리함 · {done[keyOf(i)].by}</Chip>
                            <Button size="sm" variant="ghost" onClick={() => mark(i, false)}>되돌리기</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" icon={<IconCheck />} onClick={() => mark(i, true)}>처리함</Button>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 pt-3 border-t border-black/[0.06] flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-600">
                  <span>고치는 법: <span className="text-gray-800">{head.hint}</span></span>
                  <span>비교: <code className="bg-black/[0.05] px-1 rounded text-[11px]">{head.source}</code></span>
                  <span>규칙 {head.rule}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[12px] text-gray-600 mt-4 leading-relaxed">
        다음 단계: 이 점검을 매일 아침 돌려 <span className="font-semibold text-gray-800">높음</span>이 새로 생겼을 때만 슬랙에 올립니다. 매일 다 올리면 아무도 안 봅니다.
        「처리함」은 이 브라우저에만 남습니다 — 팀이 같이 보는 처리함은 <Chip tone="gray">개발 중</Chip>입니다.
      </p>
    </>
  );
}
