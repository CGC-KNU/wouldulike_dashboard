"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "../_shared/ui";
import { TagChip } from "./kit";
import { LIVE_FAILURES, LIVE_STEPS } from "@/lib/bigquery/liveShape";
import { NOW_BUCKETS, bucketLabel, type Ga4Now } from "@/lib/ga4/realtimeShape";

/**
 * Probe · 실시간 지표 맨 위 「지금」 칸 — GA4 실시간 API, 최근 30분을 5분 칸으로(민찬 1109).
 * 새 이벤트를 띄운 직후 반응을 보려는 칸이다. 화면이 보일 때만 1분마다 다시 읽는다(라우트 캐시도 1분).
 * 왼쪽이 25~29분 전, 오른쪽 끝이 지금(아직 덜 찬 칸).
 */

const EVENT_KO = new Map<string, string>([...LIVE_STEPS, ...LIVE_FAILURES]);
const FAILURES = new Set(LIVE_FAILURES.map(([ev]) => ev));
/** 오래된 칸 → 지금 순서 */
const ORDER = Array.from({ length: NOW_BUCKETS }, (_, i) => NOW_BUCKETS - 1 - i);
const shortLabel = (i: number) => (i === 0 ? "지금" : `${i * 5}분 전`);

const hms = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(11, 19);

export default function NowCard() {
  const [now, setNow] = useState<Ga4Now | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/probe/live/now")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { now: Ga4Now | null; generated_at: string }) => {
          if (!alive) return;
          setNow(d.now);
          setState(d.now ? "ok" : "failed");
          setCheckedAt(d.generated_at);
        })
        .catch(() => { if (alive) setState("failed"); });
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const bars = now ? ORDER.map((i) => ({ label: shortLabel(i), n: now.buckets[i].users, ev: now.buckets[i].events, full: bucketLabel(i) })) : [];

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-gray-900">
          지금 · 최근 30분 <TagChip>GA4 실시간 · 5분 칸</TagChip>
        </p>
        <span className="text-[12px] text-gray-500">
          {checkedAt ? `${hms(now?.generated_at ?? checkedAt)} 기준 · 1분마다 다시 읽음` : "읽는 중"}
        </span>
      </div>

      {state === "failed" && !now ? (
        <p className="text-[13px] text-gray-500">GA4 실시간을 읽지 못했습니다 — 0 이 아니라 모름입니다. 1분 뒤 다시 읽습니다.</p>
      ) : !now ? (
        <div className="h-40 rounded-lg bg-black/[0.03] animate-pulse" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
          <div className="min-w-0">
            <p className="text-[28px] leading-none font-semibold tabular-nums text-gray-900">
              {now.total.users.toLocaleString()}<span className="text-[14px] font-medium text-gray-500 ml-1">명</span>
            </p>
            <p className="text-[12px] text-gray-500 mt-1">최근 30분 앱 사용자 · iOS {now.total.ios} · 안드로이드 {now.total.android}</p>
            <div className="h-36 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={0} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} labelFormatter={(_l, p) => String(p?.[0]?.payload?.full ?? "")}
                    formatter={(n, _k, p) => [`${Number(n)}명 · 이벤트 ${p.payload.ev}건`, "사용자" as string]} />
                  <Bar dataKey="n" fill="#6366F1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {now.screens.length > 0 && (
              <div className="mt-3">
                <p className="text-[12.5px] font-medium text-gray-700 mb-1">지금 보는 화면</p>
                <ul className="divide-y divide-black/[0.05]">
                  {now.screens.map((s) => (
                    <li key={s.name} className="flex justify-between gap-2 py-1 text-[13px]">
                      <span className="text-gray-800 min-w-0 truncate">{s.name}</span>
                      <b className="tabular-nums text-gray-900 shrink-0">{s.users}명</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-gray-700 mb-1">이벤트 · 5분 칸별 건수</p>
            {now.events.length === 0 ? (
              <p className="text-[13px] text-gray-500">최근 30분 동안 들어온 앱 이벤트가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] tabular-nums">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-medium py-1 pr-2">이벤트</th>
                      {ORDER.map((i) => <th key={i} className="text-right font-medium py-1 px-1 whitespace-nowrap">{shortLabel(i)}</th>)}
                      <th className="text-right font-medium py-1 pl-2">합</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.05]">
                    {now.events.map((e) => (
                      <tr key={e.name} className={e.auto ? "text-gray-400" : "text-gray-800"}>
                        <td className="py-1 pr-2 max-w-[180px] truncate" title={e.name}>
                          {EVENT_KO.get(e.name) ?? e.name}
                        </td>
                        {ORDER.map((i) => (
                          <td key={i} className={`text-right py-1 px-1 ${e.perBucket[i] === 0 ? "text-gray-300" : FAILURES.has(e.name) ? "text-red-600 font-semibold" : ""}`}>
                            {e.perBucket[i] || "·"}
                          </td>
                        ))}
                        <td className="text-right py-1 pl-2 font-semibold">{e.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-[12px] text-gray-500 mt-3">
        사람 수는 칸마다 따로 센 값이라 칸을 더하면 30분 합과 다릅니다. 앱이 이벤트를 묶어 보내 몇 분 늦게 붙을 수 있습니다.
        실시간 API 는 사용자 id 를 주지 않아 <b className="font-medium text-gray-700">테스트 기기도 섞입니다</b> — 직접 앱을 열어 보면 1명이 늘어납니다.
        회색 줄은 앱이 저절로 보내는 이벤트(화면 보기 · 세션 시작 등)입니다.
      </p>
    </Card>
  );
}
