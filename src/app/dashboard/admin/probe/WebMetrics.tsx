"use client";

import { useEffect, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button, Card, Kpi, Notice, PageHeader, Skeleton } from "../_shared/ui";
import { TagChip, Unknown } from "./kit";

/**
 * Probe · 웹 지표 — 우주라이크 홈(wouldulike.kr). 매장 지표 · 앱 지표 아래 세 번째 지표 화면.
 *
 * GA4 웹 스트림(앱과 같은 속성)을 Data API 로 읽는다(/api/probe/web). 0 이 아니라 모름은 「미확인」 — 앱 지표와 같은 규칙.
 * 신청 완료 이벤트는 아직 정해지지 않았다 — 정해지면 아래 APPLY_EVENT 에 이름만 넣으면 신청 칸이 채워진다.
 * 방문이 아직 적어(스트림 1027 생성) 증감에는 색을 입히지 않고 숫자만 보인다.
 */

interface Day { date: string; users: number; sessions: number }
interface Win { from: string; to: string; users: number | null; sessions: number | null }
interface Payload {
  ok: boolean;
  week: Win;
  prevWeek: Win;
  days: Day[];
  channels: { channel: string; sessions: number; users: number }[];
  events: { name: string; count: number; users: number }[];
  generated_at: string;
}

/** 신청 완료로 쓸 GA4 이벤트 이름 — 정해지기 전에는 null (신청 칸은 「미확인」) */
const APPLY_EVENT: string | null = null;

/** 심어 둔 이벤트의 이름 풀이. 모르는 이벤트는 이름 그대로 보인다 */
const EVENT_KO: Record<string, string> = {
  page_view: "페이지 조회", session_start: "세션 시작", first_visit: "첫 방문", user_engagement: "참여",
  scroll: "스크롤(90%)", section_view: "섹션 도달", cta_click: "신청 버튼 클릭",
};
const CHANNEL_KO: Record<string, string> = {
  Direct: "직접 유입", "Organic Search": "검색(구글·네이버)", "Organic Social": "소셜", Referral: "다른 사이트", "Paid Search": "검색 광고",
  "Paid Social": "소셜 광고", Email: "이메일", Unassigned: "분류 없음",
};

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const delta = (cur: number | null, prev: number | null) => {
  if (cur === null || prev === null) return undefined;
  const d = cur - prev;
  return `지난 7일 ${prev.toLocaleString()} → ${d > 0 ? "+" : ""}${d.toLocaleString()}`;
};

export default function WebMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    fetch("/api/probe/web")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const ev = (name: string) => data?.events.find((e) => e.name === name);
  const apply = APPLY_EVENT ? ev(APPLY_EVENT) : undefined;
  const total28 = data?.days.reduce((a, d) => a + d.sessions, 0) ?? 0;
  const chTotal = data?.channels.reduce((a, c) => a + c.sessions, 0) ?? 0;
  const range = data ? `${md(data.week.from)}~${md(data.week.to)}` : "";
  const val = (n: number | null | undefined) => (loading ? "-" : n === null || n === undefined ? "미확인" : n.toLocaleString());

  return (
    <>
      <PageHeader
        title="웹 지표"
        description="우주라이크 홈(wouldulike.kr)에 누가 오고, 어디서 오고, 무엇을 눌렀는지를 봅니다. 「미확인」은 0 이 아니라 읽지 못한 값입니다."
        actions={<Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>}
      />

      {!loading && failed && (
        <div className="mb-4">
          <Notice tone="red" title="지금 읽지 못했습니다">
            웹 지표를 읽지 못했습니다(GA4 Data API). 없는 것이 아니라 확인하지 못한 것입니다 — 새로고침해 주세요.
          </Notice>
        </div>
      )}

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-2">
        <Kpi label="방문자" value={val(data?.week.users)} suffix={data ? "명" : undefined} hint={[delta(data?.week.users ?? null, data?.prevWeek.users ?? null), range && `${range} · GA4`].filter(Boolean).join(" · ")} />
        <Kpi label="방문(세션)" value={val(data?.week.sessions)} suffix={data ? "회" : undefined} hint={[delta(data?.week.sessions ?? null, data?.prevWeek.sessions ?? null), range && `${range} · GA4`].filter(Boolean).join(" · ")} />
        <Kpi label="신청 버튼 클릭" value={val(data ? (ev("cta_click")?.count ?? 0) : null)} suffix={data ? "회" : undefined} hint="최근 28일 · cta_click" />
        <Kpi label="신청 완료" value={loading ? "-" : apply ? apply.count.toLocaleString() : "미확인"} suffix={apply ? "건" : undefined} hint={APPLY_EVENT ? `최근 28일 · ${APPLY_EVENT}` : "신청 완료 이벤트가 아직 정해지지 않았습니다"} />
      </div>
      <p className="text-[12px] text-gray-600 mb-4">
        어제까지의 7일을 그 앞 7일과 견줍니다(오늘은 끝나지 않아 뺍니다). 웹 스트림은 10/27에 생겨 방문이 아직 적습니다 — 증감은 숫자만 보이고 색 판정은 하지 않습니다. GA4 응답은 1시간 캐시합니다.
      </p>

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : !data ? null : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-[14px] font-semibold text-gray-900 mb-1">일별 방문자 <TagChip>GA4 · 최근 28일</TagChip></p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days.map((d) => ({ ...d, label: md(d.date) }))} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={6} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} formatter={(v: number, _n, p) => [`${v}명 · 세션 ${p.payload.sessions}회`, "방문자"]} labelFormatter={(l) => String(l)} />
                  <Bar dataKey="users" fill="#6366F1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <p className="text-[14px] font-semibold text-gray-900 mb-2">어디서 왔나 <TagChip>GA4 · 최근 28일 · 세션</TagChip></p>
            {data.channels.length === 0 ? <p className="text-[13px] text-gray-500">아직 읽을 방문이 없습니다.</p> : (
              <ul className="divide-y divide-black/[0.05]">
                {data.channels.map((c) => (
                  <li key={c.channel} className="flex items-center justify-between py-2 text-[13.5px]">
                    <span className="text-gray-800">{CHANNEL_KO[c.channel] ?? c.channel}</span>
                    <span className="tabular-nums text-gray-900"><b>{c.sessions.toLocaleString()}</b><span className="text-gray-500 ml-2">{chTotal ? `${Math.round((c.sessions / chTotal) * 100)}%` : ""}</span></span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-gray-500 mt-2">28일 세션 합 {total28.toLocaleString()}회 — 검색 등록(구글·네이버) 효과는 「검색」 줄이 늘어나는지로 봅니다.</p>
          </Card>

          <Card>
            <p className="text-[14px] font-semibold text-gray-900 mb-2">무엇을 했나 <TagChip>GA4 · 최근 28일 · 이벤트</TagChip></p>
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-gray-500"><th className="font-medium pb-1">이벤트</th><th className="font-medium pb-1 text-right">횟수</th><th className="font-medium pb-1 text-right">사람</th></tr></thead>
              <tbody className="divide-y divide-black/[0.05]">
                {data.events.map((e) => (
                  <tr key={e.name}>
                    <td className="py-1.5 text-gray-800">{EVENT_KO[e.name] ?? e.name}{EVENT_KO[e.name] && <span className="text-gray-400 ml-1.5 text-[11.5px]">{e.name}</span>}</td>
                    <td className="py-1.5 text-right tabular-nums">{e.count.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{e.users.toLocaleString()}</td>
                  </tr>
                ))}
                {!APPLY_EVENT && <tr><td className="py-1.5 text-gray-800">신청 완료</td><td className="py-1.5 text-right" colSpan={2}><Unknown why="신청 완료 이벤트 이름이 정해지지 않아 읽지 않았습니다" /></td></tr>}
              </tbody>
            </table>
          </Card>

          <Card>
            <p className="text-[14px] font-semibold text-gray-900 mb-2">읽는 법</p>
            <ul className="text-[13px] text-gray-600 leading-relaxed list-disc pl-4 space-y-1">
              <li>방문자는 GA4 「활성 사용자」(웹 스트림만), 방문은 세션입니다. 앱 지표의 기기 단위 숫자와 합치지 않습니다.</li>
              <li>같은 속성에 앱 이벤트도 들어 있어 모든 조회에 「플랫폼 = 웹」을 걸었습니다.</li>
              <li>신청 완료는 이벤트가 정해지면 채웁니다. 그 전의 「미확인」은 0 이 아닙니다.</li>
              <li>네이버 웹로그와 Clarity는 조회 방법이 마땅치 않아 연결하지 않았습니다 — 각 콘솔에서 봅니다.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
