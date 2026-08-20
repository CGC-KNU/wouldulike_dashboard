"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ContentPlan,
  LeaderboardBadge,
  OverviewPerformance,
  PlansResponse,
  SatelliteMember,
  STATUS_META,
  TrimmedStats,
} from "./types";

interface PublishStatus {
  account: { username: string; followers: number | null; media_count: number | null } | null;
  quota: { quota_usage: number; quota_total: number } | null;
}

const BADGE_META: Record<LeaderboardBadge, { label: string; cls: string }> = {
  ready: { label: "표본 안정", cls: "bg-green-50 text-green-600 border-green-100" },
  low_sample: { label: "참고용", cls: "bg-amber-50 text-amber-600 border-amber-100" },
  insufficient: { label: "표본 부족", cls: "bg-gray-50 text-gray-400 border-gray-100" },
  backfill_needed: { label: "미지정 · 백필 필요", cls: "bg-gray-50 text-gray-400 border-gray-100" },
};

/**
 * 오버뷰 (목업 §s-over) — 채널 지표 + 담당자별 이번 달 성과를 한눈에.
 * §05-4 블라인드 원칙(성과 수치는 본인+리드만)의 예외 화면 — RD 확인(2026-08-20)에 따라
 * 이 요약 화면(조회·저장 중앙값·모멘텀·담당자 리더보드)만 전원 공개로 합의됐다.
 * 개별 콘텐츠 상세(PerformancePanel)는 기존 블라인드 규칙을 그대로 유지한다.
 */
export default function OverviewScreen() {
  const now = new Date();
  const [data, setData] = useState<PlansResponse | null>(null);
  const [members, setMembers] = useState<SatelliteMember[]>([]);
  const [pubStatus, setPubStatus] = useState<PublishStatus | null>(null);
  const [perf, setPerf] = useState<OverviewPerformance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, membersRes, pubRes, perfRes] = await Promise.all([
        fetch(`/api/satellite/plans?year=${now.getFullYear()}&month=${now.getMonth() + 1}`),
        fetch("/api/satellite/members"),
        fetch("/api/satellite/publish-status"),
        fetch("/api/satellite/overview/performance"),
      ]);
      if (plansRes.ok) setData(await plansRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
      if (pubRes.ok) setPubStatus(await pubRes.json());
      if (perfRes.ok) setPerf(await perfRes.json());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
        <p className="text-xs text-gray-300">불러오는 중...</p>
      </div>
    );
  }

  const plans = data?.plans ?? [];
  const published = plans.filter((p) => p.status === "published").length;
  const inProgress = plans.filter((p) => p.status === "draft" || p.status === "ready").length;
  const locked = plans.filter((p) => p.status === "locked").length;

  const byOwner = new Map<number, { name: string; total: number; published: number; inProgress: number }>();
  for (const p of plans) {
    const row = byOwner.get(p.owner_id) ?? { name: p.owner_name, total: 0, published: 0, inProgress: 0 };
    row.total += 1;
    if (p.status === "published") row.published += 1;
    if (p.status === "draft" || p.status === "ready") row.inProgress += 1;
    byOwner.set(p.owner_id, row);
  }
  // 이번 달에 아직 한 건도 없는 멤버도 0건으로 보이게 채운다
  for (const m of members) {
    if (!byOwner.has(m.id) && m.is_active) byOwner.set(m.id, { name: m.display_name, total: 0, published: 0, inProgress: 0 });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="팔로워" value={pubStatus?.account?.followers?.toLocaleString() ?? "—"} />
        <StatTile label="이번 달 발행" value={String(published)} accent="text-green-600" />
        <StatTile label="작업 중" value={String(inProgress)} accent="text-amber-600" />
        <StatTile label="마감 지연" value={String(locked)} accent="text-red-500" />
      </div>

      {pubStatus?.quota && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[11px] text-gray-400">
            발행 쿼터(24h) <span className="font-semibold text-gray-600">{pubStatus.quota.quota_usage}/{pubStatus.quota.quota_total}</span>
            {pubStatus.account?.username && <span className="ml-2">· @{pubStatus.account.username}</span>}
          </p>
        </div>
      )}

      {perf && <ChannelMetrics perf={perf} />}
      {perf && <Leaderboard rows={perf.leaderboard} />}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-bold text-gray-800">담당자별 이번 달 현황</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-2 px-4">이름</th>
              <th className="text-right font-medium py-2">등록</th>
              <th className="text-right font-medium py-2 text-green-600">발행</th>
              <th className="text-right font-medium py-2 text-amber-600 px-4">작업 중</th>
            </tr>
          </thead>
          <tbody>
            {[...byOwner.values()].map((row) => (
              <tr key={row.name} className="border-b border-gray-50 last:border-0">
                <td className="py-2 px-4 text-gray-700 font-medium">{row.name}</td>
                <td className="text-right py-2 text-gray-600">{row.total}</td>
                <td className="text-right py-2 text-green-600 font-semibold">{row.published}</td>
                <td className="text-right py-2 px-4 text-amber-600">{row.inProgress}</td>
              </tr>
            ))}
            {byOwner.size === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-300">
                  이번 달 등록된 콘텐츠가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RecentPublished plans={plans} />
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10px] text-gray-400 font-semibold">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${accent ?? "text-gray-800"}`}>{value}</p>
    </div>
  );
}

function fmtStat(v: number | null | undefined) {
  return v == null ? "—" : Math.round(v).toLocaleString();
}

function MetricCard({ label, stats }: { label: string; stats: TrimmedStats }) {
  const hidden = stats.n < 5;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10px] text-gray-400 font-semibold">{label} 중앙값</p>
      {hidden ? (
        <p className="text-xs text-gray-300 mt-1.5">표본 부족 (n={stats.n})</p>
      ) : (
        <>
          <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtStat(stats.median)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            p10 {fmtStat(stats.p10)} · p90 {fmtStat(stats.p90)} · n={stats.n}
          </p>
        </>
      )}
    </div>
  );
}

function MomentumCard({ momentum }: { momentum: OverviewPerformance["momentum"] }) {
  if (!momentum.available) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <p className="text-[10px] text-gray-400 font-semibold">모멘텀</p>
        <p className="text-xs text-gray-300 mt-1.5">집계 중 (표본 n={momentum.n})</p>
      </div>
    );
  }
  const dir = momentum.direction;
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "▬";
  const cls = dir === "up" ? "text-green-600" : dir === "down" ? "text-red-500" : "text-gray-500";
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10px] text-gray-400 font-semibold">모멘텀 (조회 · 최근 90일 전/후반 비교)</p>
      <p className={`text-lg font-bold mt-0.5 ${cls}`}>
        {arrow} {momentum.delta_pct != null && momentum.delta_pct > 0 ? "+" : ""}
        {momentum.delta_pct}%
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5">
        {fmtStat(momentum.older_median)} → {fmtStat(momentum.recent_median)} (n={momentum.n})
      </p>
    </div>
  );
}

function ChannelMetrics({ perf }: { perf: OverviewPerformance }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MetricCard label="조회" stats={perf.channel.views} />
      <MetricCard label="저장" stats={perf.channel.saved} />
      <MetricCard label="참여" stats={perf.channel.engagement} />
      <MomentumCard momentum={perf.momentum} />
    </div>
  );
}

function Leaderboard({ rows }: { rows: OverviewPerformance["leaderboard"] }) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-800">담당자 리더보드 (최근 90일 · PI 기준)</h3>
        <span className="text-[10px] text-gray-300">코호트 대비 성과지수</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-gray-400 border-b border-gray-100">
            <th className="text-left font-medium py-2 px-4">이름</th>
            <th className="text-right font-medium py-2">중앙값 PI</th>
            <th className="text-right font-medium py-2 px-4">표본</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = BADGE_META[row.badge];
            return (
              <tr key={row.member_id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 px-4 text-gray-700 font-medium">{row.name}</td>
                <td className="text-right py-2 text-gray-700 font-semibold">
                  {row.median_pi != null ? `${row.median_pi}%` : "—"}
                </td>
                <td className="py-2 px-4">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                    {badge.label} · n={row.n}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentPublished({ plans }: { plans: ContentPlan[] }) {
  const recent = plans.filter((p) => p.status === "published").slice(-8).reverse();
  if (recent.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-800">최근 발행</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {recent.map((p) => (
          <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-700 truncate">{p.topic || "(주제 미정)"}</p>
              <p className="text-[10px] text-gray-400">{p.scheduled_date} · {p.owner_name}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_META[p.status].cls}`}>
              {STATUS_META[p.status].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
