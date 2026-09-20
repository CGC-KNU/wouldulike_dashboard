"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBrandInstagram, IconCheck, IconCopy, IconDownload, IconExternalLink, IconFileDescription, IconRefresh, IconTrash } from "@tabler/icons-react";
import { METRIC_LABEL, METRIC_SOURCE, VERDICT_CLASS, checkText, reportAllText, verdict } from "@/lib/draft/report";
import { templateMissing } from "@/lib/draft/reportTemplateData";
import { TOOLS, slackUrl } from "@/lib/satellite";
import type { ReportMetric, ReportStatus, StoreReport } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, Kpi, Notice, PageHeader, PanelSection, Skeleton, SlideOver, Table, Td, Textarea, Th, agoLabel, rowClickable, type ChipTone } from "../_shared/ui";

/**
 * Probe · 매장 리포트 — 게시물이 들어오는 곳부터 점주에게 리포트가 나가는 곳까지 한 화면.
 *
 * 민열님 0913: "마케팅(Papillon)팀이 올린 제휴 매장 카드뉴스를 전달받아(연동), 시기와 상관없이(D+7 · D+14 는 목표)
 * 원할 때 애딧 리포트처럼 보고서를 만들 수 있으면. 홍보 인사이트와 매장 리포트가 따로 있을 필요가 없다."
 *
 * 위: **Papillon 에서 온 게시물** — 발행 게시물 중 제휴 매장 이름이 들어간 것(이름 매칭). 행마다 "만들기".
 * 아래: **리포트** — 만든 것의 편집실. 검토·문구 수정 → 승인(금지 표현·지어낸 숫자 검사) → PNG·HTML 받기 → 카톡은 사람 → 보냈음.
 * (0920 민찬: 링크 대신 파일로 보낸다. 링크 발급 API 는 남겨 두지만 화면에서는 뺐다.)
 * 스냅샷 숫자는 읽기 전용. 문구를 고치면 승인은 무효가 되고 다시 승인해야 한다.
 */

interface Post {
  restaurant_id: number | null; store: string; matched_by: "marker" | "name"; plan_id: number; topic: string; posted_at: string | null; permalink: string | null;
  age_days: number | null; co_stores: number; checkpoint: "D2" | "D7" | "D14" | "done" | "waiting"; targets: { d7: boolean; d14: boolean }; due: boolean;
  available: boolean; reason?: string; metrics: ReportMetric[]; cohort_note: string | null; report: string | null;
  sent_report: { id: string; status: string; sent_at: string | null; views: number } | null;
}
interface PostsPayload { insights: Post[]; papillon_reachable: boolean; checked: { stores: number; plans: number; performance_denied?: number }; draft?: boolean; draft_note?: string }

const S_LABEL: Record<ReportStatus, string> = { DRAFT: "초안", APPROVED: "승인됨", LINKED: "링크 발급 · 미전송", SENT: "보냄", REVOKED: "회수됨" };
const S_TONE: Record<ReportStatus, ChipTone> = { DRAFT: "gray", APPROVED: "blue", LINKED: "amber", SENT: "green", REVOKED: "red" };
const M_LABEL: Record<string, string> = { saved: "저장", reach: "도달", views: "조회", shares: "공유", likes: "좋아요", comments: "댓글", profile_visits: "프로필 방문", follows: "팔로우" };
const postKey = (p: Pick<Post, "plan_id" | "restaurant_id" | "store">) => `${p.plan_id}-${p.restaurant_id ?? p.store}`;

export default function Reports({ onGo }: { onGo?: (tab: string) => void }) {
  // ── 위: Papillon 에서 온 게시물
  const [posts, setPosts] = useState<PostsPayload | null>(null);
  const [postsLoading, setPostsLoading] = useState(true);
  const [pf, setPf] = useState<"due" | "none" | "all">("due");
  const [openPost, setOpenPost] = useState<string | null>(null);
  // ── 아래: 리포트
  const [list, setList] = useState<StoreReport[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [filter, setFilter] = useState<"todo" | "sent" | "all">("todo");
  const [openId, setOpenId] = useState<string | null>(null);
  // 딥링크 `?open=<id>` — 슬랙 알림·런처 최근 목록에서 바로 이 리포트를 연다
  useEffect(() => { try { const o = new URL(window.location.href).searchParams.get("open"); if (o) setOpenId(o); } catch { /* 무시 */ } }, []);

  const loadPosts = useCallback(() => { setPostsLoading(true); fetch("/api/probe/insights").then((r) => r.json()).then(setPosts).catch(() => setPosts(null)).finally(() => setPostsLoading(false)); }, []);
  const loadList = useCallback(() => { fetch("/api/probe/reports").then((r) => r.json()).then((d) => { setList(d.reports ?? []); setNote(d.draft_note); }).catch(() => setList([])); }, []);
  const load = useCallback(() => { loadPosts(); loadList(); }, [loadPosts, loadList]);
  useEffect(load, [load]);

  const allPosts = posts?.insights ?? [];
  const visiblePosts = useMemo(() => allPosts.filter((p) => pf === "all" || (pf === "due" ? p.due : !p.sent_report)), [allPosts, pf]);
  const dueCount = allPosts.filter((p) => p.due).length;
  const noneCount = allPosts.filter((p) => !p.sent_report).length;
  const openP = allPosts.find((p) => postKey(p) === openPost) ?? null;

  const visible = useMemo(() => (list ?? []).filter((r) => filter === "all" || (filter === "todo" ? r.status === "DRAFT" || r.status === "APPROVED" || r.status === "LINKED" : r.status === "SENT")), [list, filter]);
  const counts = useMemo(() => ({ draft: (list ?? []).filter((r) => r.status === "DRAFT").length, approved: (list ?? []).filter((r) => r.status === "APPROVED").length, linked: (list ?? []).filter((r) => r.status === "LINKED").length, sent: (list ?? []).filter((r) => r.status === "SENT").length, viewed: (list ?? []).filter((r) => r.status === "SENT" && r.views.count > 0).length }), [list]);
  const open = (list ?? []).find((r) => r.id === openId) ?? null;

  /** 리포트 만들기 — 시기와 상관없이. 이미 살아 있는 리포트가 있으면(409) 갱신본 여부를 되묻는다. */
  const [making, setMaking] = useState<string | null>(null);
  const [askForce, setAskForce] = useState<string | null>(null);
  async function make(p: Post, force = false) {
    if (making) return; setMaking(postKey(p));
    try {
      const res = await fetch("/api/probe/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: p.restaurant_id, plan_id: p.plan_id, force }) });
      const d = await res.json();
      if (res.status === 409 && !force) { setAskForce(postKey(p)); return; }
      if (!res.ok) { setAskForce(null); alert(d.detail ?? "만들지 못했습니다."); return; }
      setAskForce(null); setOpenPost(null); load(); setOpenId(d.report?.id ?? null);
    } finally { setMaking(null); }
  }

  const dueLabel = (p: Post) => {
    if (p.age_days === null) return "-";
    return p.targets.d14 ? "D+14 지남" : p.targets.d7 ? "D+7 지남" : `D+7 까지 ${7 - p.age_days}일`;
  };

  return (
    <>
      <PageHeader title="매장 리포트" description="Papillon 이 올린 게시물에 제휴 매장이 들어가면 자동으로 잡힙니다. 시기와 상관없이 리포트를 만들 수 있고(D+7 · D+14 권장), 승인하면 PNG·HTML 파일로 받아 카톡으로 보냅니다."
        actions={<>{note && <DraftBadge note={note} />}<a href={slackUrl(TOOLS.probe)} target="_blank" rel="noreferrer"><Button>#{TOOLS.probe.slack.channel}</Button></a><Button variant="primary" icon={<IconRefresh />} onClick={load} disabled={postsLoading}>다시 읽기</Button></>} />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="리포트 만들 때" value={postsLoading ? "-" : dueCount} tone="alert" hint="D+7 지났는데 리포트 없음" onClick={() => setPf("due")} active={pf === "due"} />
        <Kpi label="검토 대기" value={list ? counts.draft + counts.approved : "-"} tone="alert" hint="문구 확인 · 제안 승인" onClick={() => setFilter("todo")} active={filter === "todo"} />
        <Kpi label="승인했는데 안 보냄" value={list ? counts.approved + counts.linked : "-"} tone="alert" hint="파일 받아 카톡 → '보냈음' 체크" />
        <Kpi label="보낸 리포트" value={list ? counts.sent : "-"} tone="good" hint="카톡으로 보낸 것" onClick={() => setFilter("sent")} active={filter === "sent"} />
      </div>

      {posts && (posts.checked.performance_denied ?? 0) > 0 && <div className="mb-4"><Notice tone="amber" title={`게시물 ${posts.checked.performance_denied}개는 성과를 못 읽었습니다`}>제목에 「(매장 포함)」 표시가 있는 제휴식당 콘텐츠만 성과가 열려 있습니다(마케팅팀 합의 0920). 표시가 없는 콘텐츠는 수치가 비고 「리포트 만들 때」에 안 잡힙니다 — 마케팅팀에 제목 표시를 부탁하세요.</Notice></div>}
      {posts && !posts.papillon_reachable && <div className="mb-4"><Notice tone="red" title="Papillon 기획 목록을 읽지 못했습니다">아래가 비어 있어도 <strong>홍보한 적 없음이 아닙니다.</strong> 백엔드 연결을 확인하세요.</Notice></div>}

      <Card flush title="Papillon 에서 온 게시물" description={`제목에 "(매장 포함)" 표시가 있거나 제휴 매장 이름이 들어간 발행 게시물. 살핀 기획 ${posts?.checked.plans ?? 0} · 제휴 매장 ${posts?.checked.stores ?? 0}곳`}
        actions={<FilterPills label="" value={pf} onChange={setPf} options={[{ key: "due", label: "만들 때", count: dueCount }, { key: "none", label: "리포트 없음", count: noneCount }, { key: "all", label: "전체", count: allPosts.length }]} />} className="mb-4">
        {postsLoading ? <Skeleton rows={4} cols={6} /> : visiblePosts.length === 0 ? (
          <Empty title={pf === "due" ? "지금 만들 때가 된 게시물이 없습니다" : "해당하는 게시물이 없습니다"} detail="Papillon 기획 제목 끝에 '(정든밤 포함)'처럼 적으면 발행 즉시 여기 잡힙니다. '전체'에서 시기와 상관없이 만들 수 있습니다." />
        ) : (
          <Table minWidth="56rem">
            <thead><tr><Th>매장 · 게시물</Th><Th width="6rem">게시</Th><Th width="7rem">권장 시점</Th><Th width="7rem" align="right">저장</Th><Th width="7rem" align="right">도달</Th><Th width="7rem" align="right">조회</Th><Th width="9rem" align="center">리포트</Th></tr></thead>
            <tbody>
              {visiblePosts.map((p) => {
                const m = (k: string) => p.metrics.find((x) => x.key === k);
                const cell = (k: string) => { const x = m(k); return x ? <><span className="font-semibold text-gray-900 tabular-nums">{x.value.toLocaleString()}</span><Verdict m={x} /></> : <span className="text-gray-300">-</span>; };
                const k = postKey(p);
                return (
                  <tr key={k} className={rowClickable} onClick={() => setOpenPost(k)}>
                    <Td><span className="font-semibold text-gray-900">{p.store}</span>{p.restaurant_id === null && <Chip tone="red">매장 미확인</Chip>}<span className="block text-[11px] text-gray-400 truncate max-w-[18rem]">{p.topic}{p.co_stores > 1 ? ` · ${p.co_stores}곳 함께` : ""}</span></Td>
                    <Td className="text-[12px] text-gray-600">{p.posted_at ? p.posted_at.slice(5, 10).replace("-", "/") : "-"}{p.age_days !== null && <span className="block text-[11px] text-gray-400">D+{p.age_days}</span>}</Td>
                    <Td><Chip tone={p.due ? "amber" : p.targets.d7 ? "gray" : "blue"} dot={p.due}>{dueLabel(p)}</Chip></Td>
                    <Td align="right">{cell("saved")}</Td><Td align="right">{cell("reach")}</Td><Td align="right">{cell("views")}</Td>
                    <Td align="center"><span onClick={(e) => e.stopPropagation()} className="inline-flex">
                      {p.sent_report ? (
                        <button type="button" onClick={() => setOpenId(p.sent_report!.id)} className="inline-flex"><Chip tone={p.sent_report.status === "SENT" ? "green" : p.sent_report.status === "LINKED" ? "amber" : "blue"}>{p.sent_report.status === "SENT" ? `보냄 · 열람 ${p.sent_report.views}` : p.sent_report.status === "LINKED" ? "발급 · 미전송" : "검토 중"}</Chip></button>
                      ) : askForce === k ? (
                        <Button size="sm" variant="primary" onClick={() => make(p, true)} disabled={making === k}>갱신본 만들기</Button>
                      ) : (
                        <Button size="sm" variant={p.due ? "primary" : "secondary"} icon={<IconFileDescription />} onClick={() => make(p)} disabled={!p.available || p.restaurant_id === null || making === k} title={p.available ? undefined : p.reason}>{making === k ? "만드는 중…" : "만들기"}</Button>
                      )}
                    </span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card flush title="리포트" description="스냅샷 숫자는 고정, 문구는 사람이 다듬고, 승인해야 파일을 받을 수 있습니다."
        actions={<FilterPills label="" value={filter} onChange={setFilter} options={[{ key: "todo", label: "검토 · 승인 · 미전송", count: counts.draft + counts.approved + counts.linked }, { key: "sent", label: "보낸 것", count: counts.sent }, { key: "all", label: "전체", count: list?.length }]} />}>
        {!list ? <Skeleton rows={4} cols={6} /> : visible.length === 0 ? (
          <Empty title={filter === "todo" ? "검토할 리포트가 없습니다" : "리포트가 없습니다"} detail="위 게시물 목록에서 '만들기'를 누르면 여기로 옵니다." />
        ) : (
          <Table minWidth="48rem">
            <thead><tr><Th>매장 · 게시물</Th><Th width="8rem">상태</Th><Th width="6rem" align="right">저장</Th><Th width="6rem" align="right">도달</Th><Th width="5rem" align="center">제안</Th><Th width="5rem" align="right">열람</Th><Th width="7rem" align="right">만든 때</Th></tr></thead>
            <tbody>
              {visible.map((r) => {
                const m = (k: string) => r.snapshot.metrics.find((x) => x.key === k);
                return (
                  <tr key={r.id} className={rowClickable} onClick={() => setOpenId(r.id)}>
                    <Td><span className="font-semibold text-gray-900">{r.snapshot.store.name}</span><span className="block text-[11px] text-gray-400 truncate max-w-[18rem]">{r.snapshot.post.topic}{r.snapshot.age_days !== null ? ` · D+${r.snapshot.age_days} 시점` : ""}</span></Td>
                    <Td><Chip tone={S_TONE[r.status]} dot={r.status === "DRAFT"}>{S_LABEL[r.status]}</Chip></Td>
                    <Td align="right" numeric>{m("saved")?.value.toLocaleString() ?? <span className="text-gray-300">—</span>}</Td>
                    <Td align="right" numeric>{m("reach")?.value.toLocaleString() ?? <span className="text-gray-300">—</span>}</Td>
                    <Td align="center" className="text-[12px] text-gray-600">{r.proposals.filter((p) => p.approved).length} / {r.proposals.length}</Td>
                    <Td align="right" numeric className={r.views.count ? "text-emerald-700 font-semibold" : "text-gray-300"}>{r.views.count}</Td>
                    <Td align="right" className="text-[12px] text-gray-500">{agoLabel(r.created_at)}<span className="block text-[11px] text-gray-400">{r.created_by}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        비교는 우리 채널 평소 게시물의 <b>가운데 값</b> 기준이고 표본이 5건 미만이면 비교하지 않습니다. 평소 게시물의 아래 10%·위 10% 선을 넘으면 「평소보다 낮음·높음」, 그 사이면 「평소 범위 안」이라고 씁니다. 링크는 40자 토큰이라 추측이 안 되고, 검색엔진에 잡히지 않으며, 회수하면 즉시 닫힙니다. 스냅샷에는 매장 이름과 게시물·지표만 들어갑니다 — 연락처·사업자번호·PIN 은 절대 실리지 않습니다.
        {onGo && <button type="button" onClick={() => onGo("astro-ops")} className="ml-1 text-navy font-medium hover:underline">파트너 매장에서 담당 확인 →</button>}
      </p>

      {openP && <PostPanel p={openP} onClose={() => setOpenPost(null)} onMake={(force) => make(openP, force)} making={making === postKey(openP)} askForce={askForce === postKey(openP)} onOpenReport={(id) => { setOpenPost(null); setOpenId(id); }} />}
      {open && <ReportEditor r={open} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

/** 지표 판정 한 마디 — 목록 · 패널 · 편집이 같은 함수·같은 말 */
function Verdict({ m }: { m: ReportMetric }) {
  const v = verdict(m);
  return <span className={`block text-[11px] ${VERDICT_CLASS[v.tone]}`}>{v.text}</span>;
}

/** 제안 근거 — 서버가 만든 읽기 전용 칸(승인 가드 대상 밖). 정합성 점검 항목 아랫줄과 같은 모양. */
function ProposalBasis({ p }: { p?: StoreReport["proposals"][number] }) {
  if (!p || !(p.signal || p.reading)) return null;
  return <p className={`text-[12px] mt-1.5 ${VERDICT_CLASS[p.tone ?? "gray"]}`}>신호: {p.signal || "—"}{p.reading ? ` · 해석: ${p.reading}` : ""}</p>;
}

/** 게시물 상세 — 지표 · 카톡용 텍스트(링크 대신 문자로 보낼 때) · 만들기 */
function PostPanel({ p, onClose, onMake, making, askForce, onOpenReport }: { p: Post; onClose: () => void; onMake: (force: boolean) => void; making: boolean; askForce: boolean; onOpenReport: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() { if (!p.report) return; try { await navigator.clipboard.writeText(p.report); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 무시 */ } }
  const cp = p.age_days === null ? "게시일 모름" : p.targets.d14 ? `D+${p.age_days} · 2주 총정리 시점` : p.targets.d7 ? `D+${p.age_days} · 1주 시점` : `D+${p.age_days} · 초기 반응`;
  return (
    <SlideOver open onClose={onClose} title={p.store} subtitle={p.topic} badge={<Chip tone={p.due ? "amber" : "gray"}>{cp}</Chip>} width="lg"
      footer={<>
        {p.sent_report ? <Button variant="primary" icon={<IconFileDescription />} onClick={() => onOpenReport(p.sent_report!.id)}>리포트 열기</Button>
          : askForce ? <Button variant="primary" icon={<IconFileDescription />} onClick={() => onMake(true)} disabled={making}>갱신본 만들기</Button>
          : <Button variant="primary" icon={<IconFileDescription />} onClick={() => onMake(false)} disabled={making || !p.available}>{making ? "만드는 중…" : "리포트 만들기"}</Button>}
        <Button icon={<IconCopy />} onClick={copy} disabled={!p.report}>{copied ? "복사했습니다" : "카톡용 텍스트"}</Button>
        {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer"><Button icon={<IconBrandInstagram />}>게시물</Button></a>}
        <span className="ml-auto text-[12px] text-gray-400">{askForce ? "이미 살아 있는 리포트가 있습니다. 지금 값으로 갱신본을 만듭니다." : p.available ? "지금 값으로 스냅샷을 굳힙니다" : p.reason ?? "아직 수치가 없습니다"}</span>
      </>}>
      <PanelSection title="지표 (지금 값)">
        {!p.available ? <p className="text-[13px] text-gray-500">{p.reason ?? "아직 성과가 모이지 않았습니다."}</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {p.metrics.map((m) => (
              <div key={m.key} className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-[11px] text-gray-500">{M_LABEL[m.key] ?? m.key}</p>
                <p className="text-[18px] font-bold tabular-nums text-gray-900 leading-tight">{m.value.toLocaleString()}</p>
                <Verdict m={m} />
              </div>
            ))}
          </div>
        )}
        {p.cohort_note && <p className="text-[12px] text-gray-500 mt-2">근거: {p.cohort_note}</p>}
        {p.co_stores > 1 && <p className="text-[12px] text-amber-700 mt-1">{p.co_stores}곳을 함께 소개한 게시물 — 수치는 게시물 전체 것입니다. 리포트가 그렇게 말합니다.</p>}
      </PanelSection>
      <PanelSection title="카톡용 텍스트 (링크 대신 글로 보낼 때)">
        {p.report ? <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800 bg-gray-50 rounded-lg p-3 font-[inherit]">{p.report}</pre> : <p className="text-[13px] text-gray-500">지표가 모이면 자동으로 문장이 만들어집니다.</p>}
        <p className="text-[12px] text-gray-500 mt-2">헤드라인은 저장 → 도달 → 조회 고정, 비교는 가운데 값·표본 수를 밝히고, 근거가 없으면 없다고 씁니다. 리포트를 만들면 이 텍스트 대신 게시물 카드 · 비교 막대 · 다음 제안이 한 페이지로 나갑니다. <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-navy">인사이트 캡처 <IconExternalLink size={11} aria-hidden="true" /></a></p>
      </PanelSection>
    </SlideOver>
  );
}

export function ReportEditor({ r, onClose, onChanged }: { r: StoreReport; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(r.title);
  const [summary, setSummary] = useState(r.summary);
  const [interp, setInterp] = useState(r.interpretation.join("\n"));
  const [props, setProps] = useState(r.proposals.map((p) => ({ rule: p.rule, title: p.title, text: p.text, approved: p.approved })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "blue" | "red" | "green"; text: string; problems?: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setTitle(r.title); setSummary(r.summary); setInterp(r.interpretation.join("\n")); setProps(r.proposals.map((p) => ({ rule: p.rule, title: p.title, text: p.text, approved: p.approved }))); setMsg(null); }, [r]);

  const editable = r.status === "DRAFT" || r.status === "APPROVED";
  const dirty = title !== r.title || summary !== r.summary || interp !== r.interpretation.join("\n") || JSON.stringify(props) !== JSON.stringify(r.proposals.map((p) => ({ rule: p.rule, title: p.title, text: p.text, approved: p.approved })));
  // 저장 전에도 클라이언트에서 같은 검사를 돌려 미리 보여준다 (최종 판정은 서버)
  const precheck = useMemo(() => {
    const t = checkText(reportAllText({ title, summary, interpretation: interp.split("\n").filter(Boolean), proposals: props.map((p) => ({ ...p, generated_text: "", edited_by: null, edited_at: null })) }), r.snapshot);
    // 점주 화면(리포트 양식)에 꼭 있어야 하는 값 — 스냅샷 문제라 문구를 고쳐도 안 풀린다
    const missing = templateMissing(r).map((m) => `${m} 없음 — 성과가 모인 뒤 갱신본을 만드세요`);
    return { ok: t.ok && missing.length === 0, problems: [...t.problems, ...missing] };
  }, [title, summary, interp, props, r]);
  const url = r.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${r.token}` : null;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/probe/reports/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, summary, interpretation: interp.split("\n").filter(Boolean), proposals: props }) });
      const d = await res.json(); if (!res.ok) { setMsg({ tone: "red", text: d.detail }); return; }
      setMsg({ tone: "blue", text: "저장했습니다. 승인은 다시 받아야 합니다." }); onChanged();
    } finally { setBusy(false); }
  }
  async function act(action: "approve" | "link" | "sent" | "revoke") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/probe/reports/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await res.json(); if (!res.ok) { setMsg({ tone: "red", text: d.detail, problems: d.problems }); return; }
      setMsg({ tone: "green", text: action === "approve" ? "승인했습니다. 'PNG·HTML 받기'에서 파일을 받아 카톡으로 보낸 뒤 '카톡으로 보냈음'을 눌러 주세요." : action === "link" ? "링크를 만들었습니다. 복사해서 카톡으로 보낸 뒤 '보냈음'을 눌러 주세요." : action === "sent" ? "보냈음으로 표시했습니다." : "링크를 회수했습니다." }); onChanged();
    } finally { setBusy(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 무시 */ } }

  const s = r.snapshot;
  return (
    <SlideOver open onClose={onClose} title={s.store.name} subtitle={`'${s.post.topic}' · ${new Date(s.as_of).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준 스냅샷`} badge={<Chip tone={S_TONE[r.status]}>{S_LABEL[r.status]}</Chip>} width="lg"
      footer={
        <>
          {editable && dirty && <Button variant="primary" onClick={save} disabled={busy}>문구 저장</Button>}
          {r.status === "DRAFT" && !dirty && <Button variant="primary" icon={<IconCheck />} onClick={() => act("approve")} disabled={busy || !precheck.ok}>승인</Button>}
          {(r.status === "LINKED" || r.status === "SENT") && url && <Button variant={r.status === "SENT" ? "primary" : "secondary"} icon={<IconCopy />} onClick={() => copy(url)}>{copied ? "복사했습니다" : "링크 복사"}</Button>}
          {/* 0920: 사장님께는 링크 대신 파일(PNG·HTML)을 카톡으로 보낸다 — 승인 뒤 받기 → 보냈음 */}
          {(r.status === "APPROVED" || r.status === "LINKED" || r.status === "SENT") && !dirty && <a href={`/r/preview-${r.id}`} target="_blank" rel="noreferrer" title="미리보기 위 띠에서 PNG · HTML · 인쇄"><Button variant={r.status === "SENT" ? "secondary" : "primary"} icon={<IconDownload />}>PNG·HTML 받기</Button></a>}
          {(r.status === "APPROVED" || r.status === "LINKED") && !dirty && <Button variant="primary" icon={<IconCheck />} onClick={() => act("sent")} disabled={busy}>카톡으로 보냈음</Button>}
          {r.status === "DRAFT" && <a href={`/r/preview-${r.id}`} target="_blank" rel="noreferrer"><Button icon={<IconExternalLink />}>미리보기</Button></a>}
          {(r.status === "LINKED" || r.status === "SENT") && <Button variant="ghost" icon={<IconTrash />} onClick={() => act("revoke")} disabled={busy}>회수</Button>}
          <span className="ml-auto text-[12px] text-gray-400">{r.token ? `열람 ${r.views.count}회${r.views.last_at ? ` · ${agoLabel(r.views.last_at)}` : ""}` : r.approved_by ? `${r.approved_by} 승인` : `${r.created_by} 작성`}</span>
        </>
      }>
      {msg && <Notice tone={msg.tone === "green" ? "blue" : msg.tone} title={msg.text}>{msg.problems && <ul className="list-disc pl-4 mt-1">{msg.problems.map((p) => <li key={p}>{p}</li>)}</ul>}</Notice>}
      {!precheck.ok && <Notice tone="amber" title="이대로는 승인되지 않습니다"><ul className="list-disc pl-4">{precheck.problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice>}

      <PanelSection title="스냅샷 (읽기 전용)">
        <div className="grid grid-cols-3 gap-2">
          {s.metrics.filter((m) => ["saved", "reach", "views", "shares", "likes", "comments"].includes(m.key)).map((m) => (
            <div key={m.key} className="rounded-lg border border-gray-200 px-3 py-2"><p className="flex items-center justify-between gap-1 text-[11px] text-gray-500">{METRIC_LABEL[m.key]}{m.source && <Chip tone={METRIC_SOURCE[m.source].tone}>{METRIC_SOURCE[m.source].label}</Chip>}</p><p className="text-[16px] font-bold tabular-nums">{m.value.toLocaleString()}</p><Verdict m={m} /></div>
          ))}
          {s.metrics.length === 0 && <p className="col-span-3 text-[13px] text-gray-500">인스타그램 수치가 없습니다. 공개 페이지에는 '—' 로 나갑니다.</p>}
        </div>
        {s.app && <p className="text-[12px] text-gray-600 mt-2">앱 {s.app.month}: 쿠폰 {s.app.coupon_redeemed} · 스탬프 {s.app.stamp_earned} · 재방문 {s.app.revisit} · 단골 {s.app.loyal_total}{s.app.coupon_redeemed + s.app.stamp_earned + s.app.revisit + s.app.loyal_total === 0 ? " — 전부 0 이라 공개 페이지에서는 블록을 숨깁니다" : ""}</p>}
        {s.post.co_stores > 1 && <p className="text-[12px] text-amber-700 mt-1">{s.post.co_stores}곳을 함께 소개한 게시물입니다. 수치는 게시물 전체 것이고, 공개 페이지가 그렇게 말합니다.</p>}
      </PanelSection>

      <PanelSection title="문구">
        <Field label="제목"><Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} /></Field>
        <Field label="한 줄 요약 (카톡 미리보기에 보입니다)"><Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!editable} /></Field>
        <Field label="비교 해석 (줄마다 한 문장 · 지표 이름으로 시작)" hint="스냅샷에 없는 숫자, 금지 표현('보장' '상위권' '덕분에' 등)은 승인이 막힙니다."><Textarea rows={3} value={interp} onChange={(e) => setInterp(e.target.value)} disabled={!editable} /></Field>
      </PanelSection>

      <PanelSection title={`다음 제안 (${props.filter((p) => p.approved).length} 승인 / ${props.length})`}>
        {props.length === 0 ? <p className="text-[13px] text-gray-500">조건에 걸린 제안이 없습니다. 억지로 채우지 않습니다 — 제안 섹션은 공개 페이지에서 숨겨집니다.</p> : (
          <ul className="space-y-3">
            {props.map((p, i) => (
              <li key={p.rule} className="rounded-lg border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 cursor-pointer"><input type="checkbox" checked={p.approved} disabled={!editable} onChange={(e) => setProps((ps) => ps.map((x, k) => (k === i ? { ...x, approved: e.target.checked } : x)))} className="w-4 h-4 accent-[#050072]" />{p.title}<span className="text-[11px] text-gray-400 font-normal">{p.rule}</span></label>
                <Textarea rows={2} value={p.text} disabled={!editable} onChange={(e) => setProps((ps) => ps.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} className="mt-2" />
                <ProposalBasis p={r.proposals.find((x) => x.rule === p.rule)} />
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      {(r.status === "APPROVED" || (r.status === "SENT" && !r.token)) && (
        <PanelSection title="카톡으로 보내기">
          <ol className="list-decimal pl-4 text-[13px] text-gray-700 space-y-1">
            <li>「PNG·HTML 받기」 → 미리보기 위 띠에서 <b>PNG 저장</b>(사진으로 바로 보임) · 필요하면 <b>HTML 저장</b></li>
            <li>카톡으로 파일 전송 후 「카톡으로 보냈음」</li>
          </ol>
          <p className="text-[12px] text-gray-500 mt-2">함께 보낼 인사말: &quot;사장님, 안녕하세요. 우주라이크입니다. 지난 게시물 성과를 정리해 보내 드립니다. 사진으로 보시면 되고, 파일로도 함께 드립니다.&quot;</p>
        </PanelSection>
      )}
      {(r.status === "LINKED" || r.status === "SENT") && url && (
        <PanelSection title="링크">
          <div className="flex items-center gap-2"><Input value={url} readOnly className="font-mono text-[12px]" /><Button icon={<IconCopy />} onClick={() => copy(url)}>{copied ? "복사했습니다" : "복사"}</Button></div>
          <p className="text-[12px] text-gray-500 mt-2">함께 보낼 인사말: "사장님, 안녕하세요. 우주라이크입니다. 지난 게시물 성과를 정리한 페이지입니다. 링크를 눌러 보시면 됩니다."</p>
        </PanelSection>
      )}
    </SlideOver>
  );
}
