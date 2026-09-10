"use client";

import { useEffect, useMemo, useState } from "react";
import { IconBrandInstagram, IconCopy, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { TOOLS, slackUrl } from "@/lib/satellite";
import { Button, Card, Chip, DraftBadge, Empty, FilterPills, Kpi, Notice, PageHeader, PanelSection, Skeleton, SlideOver, Table, Td, Th, rowClickable, type ChipTone } from "../_shared/ui";

/**
 * Probe · 제휴매장 홍보 인사이트.
 *
 * 민열님 0906 요청(민찬 cc)을 화면으로 옮긴 것: 인스타 게시물에 제휴 매장이 들어가면 그때부터 **D+2 → D+7 → D+14** 로 추적,
 * 주기마다 세일즈 담당을 태그하고 사장님께 보낼 보고글을 만든다. 보고글 문장 구조는 라라더 건(저장 309회 · 평균 +29%)을 따랐다.
 * 아윤이 낸 지표셋(조회수 · 반응수 합계 · 비팔로워 노출 비중 · 성장세)은 Papillon 성과 API 가 주는 대로 붙는다.
 *
 * 게시물 ↔ 매장은 이름 매칭이다. 정확한 연결(기획에 매장 FK)은 백엔드 권장 사항.
 */

interface Insight {
  restaurant_id: number; store: string; plan_id: number; topic: string; posted_at: string | null; permalink: string | null;
  age_days: number | null; checkpoint: "D2" | "D7" | "D14" | "done" | "waiting"; available: boolean; reason?: string;
  metrics: { key: string; value: number; median: number | null; delta_pct: number | null }[]; report: string | null;
}
interface Payload { insights: Insight[]; papillon_reachable: boolean; checked: { stores: number; plans: number }; draft?: boolean; draft_note?: string }

const CP_LABEL: Record<Insight["checkpoint"], string> = { waiting: "수집 중", D2: "D+2 보고", D7: "D+7 보고", D14: "D+14 보고", done: "추적 종료" };
const CP_TONE: Record<Insight["checkpoint"], ChipTone> = { waiting: "gray", D2: "amber", D7: "blue", D14: "navy", done: "green" };
const M_LABEL: Record<string, string> = { saved: "저장", reach: "도달", views: "조회", shares: "공유", likes: "좋아요", comments: "댓글", profile_visits: "프로필 방문", follows: "팔로우" };

export default function StoreInsights({ onGo }: { onGo?: (tab: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cp, setCp] = useState<"all" | "due" | "done">("due");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = () => { setLoading(true); fetch("/api/probe/insights").then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const list = useMemo(() => (data?.insights ?? []).filter((i) => cp === "all" || (cp === "due" ? ["D2", "D7", "D14"].includes(i.checkpoint) : i.checkpoint === "done")), [data, cp]);
  const due = (data?.insights ?? []).filter((i) => ["D2", "D7", "D14"].includes(i.checkpoint)).length;
  const open = list.find((i) => `${i.plan_id}-${i.restaurant_id}` === openKey) ?? null;

  return (
    <>
      <PageHeader title="홍보 인사이트" description="인스타 게시물에 들어간 제휴 매장을 D+2 · D+7 · D+14 에 다시 보고, 사장님께 보낼 보고글을 만듭니다."
        actions={<>{data?.draft && <DraftBadge note={data.draft_note} />}<a href={slackUrl(TOOLS.probe)} target="_blank" rel="noreferrer"><Button>#{TOOLS.probe.slack.channel}</Button></a><Button variant="primary" icon={<IconRefresh />} onClick={load} disabled={loading}>다시 읽기</Button></>}>
        <FilterPills label="구간" value={cp} onChange={setCp} options={[{ key: "due", label: "보고할 차례", count: due }, { key: "done", label: "추적 종료" }, { key: "all", label: "전체", count: data?.insights.length }]} />
      </PageHeader>

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="보고할 차례" value={loading ? "-" : due} tone="alert" hint="D+2 · D+7 · D+14 에 걸린 건" />
        <Kpi label="추적 중 게시물" value={loading ? "-" : new Set((data?.insights ?? []).filter((i) => i.checkpoint !== "done").map((i) => i.plan_id)).size} hint="제휴 매장이 들어간 발행물" />
        <Kpi label="살핀 기획" value={loading ? "-" : data?.checked.plans ?? 0} hint={`제휴 매장 ${data?.checked.stores ?? 0}곳과 대조`} />
        <Kpi label="다음 자동화" value="정오 체크" hint="발행 → 매장 매칭 → 담당 태그 (Libra)" />
      </div>

      {data && !data.papillon_reachable && <div className="mb-4"><Notice tone="red" title="Papillon 기획 목록을 읽지 못했습니다">아래가 비어 있어도 <strong>홍보한 적 없음이 아닙니다.</strong> 백엔드 연결을 확인하세요.</Notice></div>}

      {loading ? <Card flush><Skeleton rows={5} cols={5} /></Card> : list.length === 0 ? (
        <Card><Empty title={cp === "due" ? "지금 보고할 차례인 건이 없습니다" : "해당하는 건이 없습니다"} detail="게시물 주제(topic)에 제휴 매장 이름이 들어가면 자동으로 여기 잡힙니다." /></Card>
      ) : (
        <Card flush>
          <Table minWidth="52rem">
            <thead><tr><Th>매장 · 게시물</Th><Th width="6rem">게시</Th><Th width="7rem">구간</Th><Th width="8rem" align="right">저장</Th><Th width="8rem" align="right">도달</Th><Th width="8rem" align="right">조회</Th><Th width="5rem" align="center">보고글</Th></tr></thead>
            <tbody>
              {list.map((i) => {
                const m = (k: string) => i.metrics.find((x) => x.key === k);
                const cell = (k: string) => { const x = m(k); return x ? <><span className="font-semibold text-gray-900 tabular-nums">{x.value.toLocaleString()}</span>{x.delta_pct !== null && <span className={`block text-[11px] ${x.delta_pct >= 0 ? "text-emerald-700" : "text-red-600"}`}>{x.delta_pct >= 0 ? "+" : ""}{x.delta_pct}%</span>}</> : <span className="text-gray-300">-</span>; };
                return (
                  <tr key={`${i.plan_id}-${i.restaurant_id}`} className={rowClickable} onClick={() => setOpenKey(`${i.plan_id}-${i.restaurant_id}`)}>
                    <Td><span className="font-semibold text-gray-900">{i.store}</span><span className="block text-[11px] text-gray-400 truncate max-w-[18rem]">{i.topic}</span></Td>
                    <Td className="text-[12px] text-gray-600">{i.posted_at ? i.posted_at.slice(5, 10).replace("-", "/") : "-"}{i.age_days !== null && <span className="block text-[11px] text-gray-400">D+{i.age_days}</span>}</Td>
                    <Td><Chip tone={CP_TONE[i.checkpoint]} dot={i.checkpoint !== "waiting" && i.checkpoint !== "done"}>{CP_LABEL[i.checkpoint]}</Chip></Td>
                    <Td align="right">{cell("saved")}</Td><Td align="right">{cell("reach")}</Td><Td align="right">{cell("views")}</Td>
                    <Td align="center">{i.report ? <span className="text-navy font-semibold text-[12px]">준비됨</span> : <span className="text-gray-300">-</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        평균 대비 %는 Papillon 성과 API 의 코호트 중앙값 기준입니다. 보고글은 텍스트만 만들고, 카드 이미지(첨부 2장)는 Papillon 에서 내려받아 붙입니다.
        {onGo && <button type="button" onClick={() => onGo("astro-ops")} className="ml-1 text-navy font-medium hover:underline">매장 현황에서 담당 확인 →</button>}
      </p>

      {open && <InsightPanel i={open} onClose={() => setOpenKey(null)} />}
    </>
  );
}

function InsightPanel({ i, onClose }: { i: Insight; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() { if (!i.report) return; try { await navigator.clipboard.writeText(i.report); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 무시 */ } }
  return (
    <SlideOver open onClose={onClose} title={i.store} subtitle={i.topic} badge={<Chip tone={CP_TONE[i.checkpoint]}>{CP_LABEL[i.checkpoint]}</Chip>} width="lg"
      footer={<><Button variant="primary" icon={<IconCopy />} onClick={copy} disabled={!i.report}>{copied ? "복사했습니다" : "보고글 복사"}</Button>{i.permalink && <a href={i.permalink} target="_blank" rel="noreferrer"><Button icon={<IconBrandInstagram />}>게시물 열기</Button></a>}<span className="ml-auto text-[12px] text-gray-400">담당 태그 · 매장 채팅방 전달은 사람이 합니다</span></>}>
      <PanelSection title="지표">
        {!i.available ? <p className="text-[13px] text-gray-500">{i.reason ?? "아직 성과가 모이지 않았습니다."}</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {i.metrics.map((m) => (
              <div key={m.key} className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-[11px] text-gray-500">{M_LABEL[m.key] ?? m.key}</p>
                <p className="text-[18px] font-bold tabular-nums text-gray-900 leading-tight">{m.value.toLocaleString()}</p>
                <p className={`text-[11px] ${m.delta_pct === null ? "text-gray-400" : m.delta_pct >= 0 ? "text-emerald-700" : "text-red-600"}`}>{m.delta_pct === null ? "비교 기준 없음" : `평균 대비 ${m.delta_pct >= 0 ? "+" : ""}${m.delta_pct}%`}</p>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
      <PanelSection title="사장님 보고글 (초안)">
        {i.report ? <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800 bg-gray-50 rounded-lg p-3 font-[inherit]">{i.report}</pre> : <p className="text-[13px] text-gray-500">지표가 모이면 자동으로 문장이 만들어집니다.</p>}
        <p className="text-[12px] text-gray-500 mt-2">양식: 라라더 건(9/4 '대구 면 요리 맛집'). 금지 표현("전원 당첨" "보장" "예상 도달")은 쓰지 않습니다. <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-navy">인사이트 카드 캡처 <IconExternalLink size={11} aria-hidden="true" /></a></p>
      </PanelSection>
    </SlideOver>
  );
}
