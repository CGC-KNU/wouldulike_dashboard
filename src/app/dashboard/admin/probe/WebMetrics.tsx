"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button, Card, Kpi, Notice, PageHeader, Skeleton } from "../_shared/ui";
import { TagChip } from "./kit";

/**
 * Probe · 웹 지표 — 우주라이크 홈(wouldulike.kr). 매장 지표 · 앱 지표 아래 세 번째 지표 화면.
 *
 * GA4 웹 스트림(앱과 같은 속성)을 Data API 로 읽는다(/api/probe/web). 0 이 아니라 모름은 「미확인」 — 앱 지표와 같은 규칙.
 * 방문이 아직 적어(스트림 1027 생성) 증감에는 색을 입히지 않고 숫자만 보인다.
 *
 * 1028 A: 한국만 센다(해외는 참여 0 인 봇으로 보여 뺀 수만 보인다). 신청 완료 = `/join` 의 `sign_up`.
 * 입점 신청 깔때기 · 페이지별 · 앱 설치 버튼 클릭을 더했다.
 */

interface Win { from: string; to: string; users: number; sessions: number; engaged: number }
interface Page { key: string; label: string; users: number; views: number }
interface Payload {
  ok: boolean;
  week: Win;
  prevWeek: Win;
  abroad: { week: number; d28: number };
  days: { date: string; users: number; sessions: number }[];
  channels: { channel: string; sessions: number; users: number }[];
  events: { name: string; count: number; users: number }[];
  pages: Page[];
  funnel: { home: number; join: number; step: number; signup: number };
  stores: { ios: number; android: number; byPage: { key: string; label: string; ios: number; android: number }[] };
  generated_at: string;
}

/** 우리가 심은 이벤트 — 안 찍혀도 0 으로 보인다(안 심은 것과 안 눌린 것을 가르려고). 위에서부터 이 순서 */
const OUR_EVENTS: [string, string][] = [
  ["section_view", "섹션 도달"], ["cta_click", "버튼 클릭(신청 · 상담)"], ["deck_open", "소개서 열기"], ["faq_open", "FAQ 펼치기"],
  ["generate_lead", "상담 · 견적 제출"], ["signup_step_complete", "신청 단계 넘김"], ["sign_up", "입점 신청 완료"],
];
/** GA4 가 알아서 남기는 이벤트의 이름 풀이 */
const AUTO_KO: Record<string, string> = {
  page_view: "페이지 조회", session_start: "세션 시작", first_visit: "첫 방문", user_engagement: "참여",
  scroll: "스크롤(90%)", click: "바깥 링크 클릭", form_start: "폼 입력 시작", form_submit: "폼 제출", file_download: "파일 내려받기",
};
const CHANNEL_KO: Record<string, string> = {
  Direct: "직접 유입", "Organic Search": "검색(구글 · 네이버)", "Organic Social": "소셜", Referral: "다른 사이트", "Paid Search": "검색 광고",
  "Paid Social": "소셜 광고", Email: "이메일", Unassigned: "분류 없음",
};

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
/** 머리 칸 설명은 한 줄에서 잘린다(폰 폭 약 13자) — 짧게 */
const delta = (cur: number, prev: number) => {
  const d = cur - prev;
  return `앞 7일 ${prev.toLocaleString()} · ${d > 0 ? "+" : ""}${d.toLocaleString()}`;
};

/** 머리 칸 둘째 줄 */
function Sub({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-gray-500 mt-0.5 truncate">{children}</p>;
}

function Title({ children, tag }: { children: string; tag: string }) {
  return <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-gray-900 mb-2">{children} <TagChip>{tag}</TagChip></p>;
}

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
  const chTotal = data?.channels.reduce((a, c) => a + c.sessions, 0) ?? 0;
  const range = data ? `${md(data.week.from)}~${md(data.week.to)}` : "";
  const v = (n: number | undefined) => (loading ? "-" : n === undefined ? "미확인" : n.toLocaleString());
  const funnel = data ? [
    { label: "사장님 홈 방문", n: data.funnel.home },
    { label: "신청 페이지 도착", n: data.funnel.join },
    { label: "신청 단계 하나 이상 넘김", n: data.funnel.step },
    { label: "입점 신청 완료", n: data.funnel.signup },
  ] : [];
  const fMax = Math.max(1, ...funnel.map((f) => f.n));
  const autoEvents = (data?.events ?? []).filter((e) => !OUR_EVENTS.some(([k]) => k === e.name));

  return (
    <>
      <PageHeader
        title="웹 지표"
        description="우주라이크 홈(wouldulike.kr)에 누가 오고, 어디서 오고, 무엇을 눌렀는지를 봅니다. 한국 방문만 셉니다. 「미확인」은 0 이 아니라 읽지 못한 값입니다."
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
        <Kpi label="방문자(한국)" value={v(data?.week.users)} suffix={data ? "명" : undefined}
          hint={data ? delta(data.week.users, data.prevWeek.users) : "최근 7일"} extra={data?.abroad.week ? <Sub>해외 {data.abroad.week}명 뺌(봇 추정)</Sub> : undefined} />
        <Kpi label="참여 세션" value={v(data?.week.engaged)} suffix={data ? "회" : undefined}
          hint={data ? delta(data.week.engaged, data.prevWeek.engaged) : "최근 7일"} extra={data ? <Sub>세션 {data.week.sessions}회 중</Sub> : undefined} />
        <Kpi label="입점 신청 완료" value={v(data ? (ev("sign_up")?.count ?? 0) : undefined)} suffix={data ? "건" : undefined} hint="최근 28일" extra={<Sub>sign_up · 제출 성공 뒤</Sub>} />
        <Kpi label="앱 설치 버튼 클릭" value={v(data ? data.stores.ios + data.stores.android : undefined)} suffix={data ? "회" : undefined}
          hint="최근 28일" extra={data ? <Sub>iOS {data.stores.ios} · 안드로이드 {data.stores.android}</Sub> : undefined} />
      </div>
      <p className="text-[12px] text-gray-600 mb-4">
        어제까지의 7일{range ? `(${range})` : ""}을 그 앞 7일과 견줍니다(오늘은 끝나지 않아 뺍니다). 해외 방문은 미국 데이터센터 도시에서 참여 없이 찍혀 봇으로 보고 셈에서 뺐습니다.
        참여 세션은 10초 넘게 머물렀거나 두 쪽 이상 본 세션입니다. 방문이 아직 적어 증감은 숫자만 보이고 색 판정은 하지 않습니다. GA4 응답은 1시간 캐시합니다.
      </p>

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : !data ? null : (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <Card>
            <Title tag="GA4 · 최근 28일 · 사람">입점 신청 깔때기</Title>
            <ol className="space-y-2">
              {funnel.map((f, i) => (
                <li key={f.label}>
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span className="text-gray-800">{i + 1}. {f.label}</span>
                    <b className="tabular-nums text-gray-900">{f.n.toLocaleString()}명</b>
                  </div>
                  <div className="h-2 mt-1 rounded-full bg-[#EEF1FF] overflow-hidden"><div className="h-full rounded-full bg-[#6366F1]" style={{ width: `${(f.n / fMax) * 100}%` }} /></div>
                </li>
              ))}
            </ol>
            <p className="text-[12px] text-gray-500 mt-3">단계마다 따로 센 사람 수입니다. DM · QR 링크는 홈을 거치지 않고 신청 페이지로 바로 오므로 뒷단이 앞단보다 클 수 있습니다.</p>
          </Card>

          <Card>
            <Title tag="GA4 · 최근 28일 · 한국">일별 방문자</Title>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days.map((d) => ({ ...d, label: md(d.date) }))} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={6} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} formatter={(n: number, _k, p) => [`${n}명 · 세션 ${p.payload.sessions}회`, "방문자"]} labelFormatter={(l) => String(l)} />
                  <Bar dataKey="users" fill="#6366F1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <Title tag="GA4 · 최근 28일">페이지별</Title>
            {data.pages.length === 0 ? <p className="text-[13px] text-gray-500">아직 읽을 방문이 없습니다.</p> : (
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-left text-[12px] text-gray-500"><th className="font-medium pb-1">페이지</th><th className="font-medium pb-1 text-right">사람</th><th className="font-medium pb-1 text-right">조회</th></tr></thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {data.pages.map((p) => (
                    <tr key={p.key}>
                      <td className="py-1.5 text-gray-800">{p.label}{p.label !== p.key && <span className="text-gray-400 ml-1.5 text-[11.5px]">{p.key}</span>}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.users.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600">{p.views.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <Title tag="GA4 · 최근 28일 · 세션">어디서 왔나</Title>
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
            <p className="text-[12px] text-gray-500 mt-2">검색 등록(구글 · 네이버) 효과는 「검색」 줄이 늘어나는지로 봅니다.</p>
          </Card>

          <Card>
            <Title tag="GA4 · 최근 28일 · 바깥 링크 클릭">앱 설치 버튼</Title>
            {data.stores.byPage.length === 0 ? <p className="text-[13px] text-gray-500">아직 앱스토어 · 플레이스토어로 나간 클릭이 없습니다.</p> : (
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-left text-[12px] text-gray-500"><th className="font-medium pb-1">어느 페이지에서</th><th className="font-medium pb-1 text-right">iOS</th><th className="font-medium pb-1 text-right">안드로이드</th></tr></thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {data.stores.byPage.map((p) => (
                    <tr key={p.key}>
                      <td className="py-1.5 text-gray-800">{p.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.ios.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.android.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[12px] text-gray-500 mt-2">버튼을 누른 횟수입니다 — 실제 설치까지 이어졌는지는 아직 잇지 못합니다.</p>
          </Card>

          <Card>
            <Title tag="GA4 · 최근 28일 · 이벤트">무엇을 했나</Title>
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-gray-500"><th className="font-medium pb-1">이벤트</th><th className="font-medium pb-1 text-right">횟수</th><th className="font-medium pb-1 text-right">사람</th></tr></thead>
              <tbody className="divide-y divide-black/[0.05]">
                {OUR_EVENTS.map(([k, ko]) => {
                  const e = ev(k);
                  return (
                    <tr key={k}>
                      <td className="py-1.5 text-gray-800">{ko}<span className="text-gray-400 ml-1.5 text-[11.5px]">{k}</span></td>
                      <td className="py-1.5 text-right tabular-nums">{(e?.count ?? 0).toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600">{(e?.users ?? 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
                {autoEvents.map((e) => (
                  <tr key={e.name} className="text-gray-500">
                    <td className="py-1.5">{AUTO_KO[e.name] ?? e.name}<span className="text-gray-400 ml-1.5 text-[11.5px]">{e.name} · 자동</span></td>
                    <td className="py-1.5 text-right tabular-nums">{e.count.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{e.users.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] text-gray-500 mt-2">「상담 · 견적 제출」은 지금 입력 검증 전에 찍혀 실패한 시도도 셉니다 — 홈페이지 쪽 수정 전까지는 참고만 합니다.</p>
          </Card>

          <Card>
            <p className="text-[14px] font-semibold text-gray-900 mb-2">읽는 법</p>
            <ul className="text-[13px] text-gray-600 leading-relaxed list-disc pl-4 space-y-1">
              <li>방문자는 GA4 「활성 사용자」(웹 스트림 · 한국만)입니다. 앱 지표의 기기 단위 숫자와 합치지 않습니다.</li>
              <li>같은 속성에 앱 이벤트도 들어 있어 모든 조회에 「플랫폼 = 웹」을 걸었습니다.</li>
              <li>「버튼 클릭」은 입점 신청 버튼과 상담 버튼이 섞여 있습니다 — GA4 에 버튼 종류(cta_type)를 맞춤 측정기준으로 등록하면 가를 수 있습니다.</li>
              <li>네이버 웹로그와 Clarity는 조회 방법이 마땅치 않아 연결하지 않았습니다 — 각 콘솔에서 봅니다.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
