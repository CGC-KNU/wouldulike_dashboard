"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, Empty, FilterPills, Kpi, Notice, PageHeader, Select, Skeleton, Table, Td, Th, type ChipTone } from "../_shared/ui";
import { SurveyCreateSlideOver, SurveyEditSlideOver } from "./SurveyEditor";

/**
 * Probe · 설문 조사 — 앱 내 설문을 켜고 끄고 결과를 본다 (1109 민찬).
 *
 * 설문 하나에 보상 쿠폰 캠페인 · 홈 배너가 묶여 있어서, 켜기/끄기는 백엔드(surveys/ops.py)가 셋을 같이 움직인다.
 * 앱은 열린 설문을 하나만 받아 가므로 백엔드가 둘째 설문 켜기를 막는다(409).
 * 결과는 「끝낸 응답」(답 + 쿠폰 수령)만 센다. 쿠폰 고르기에서 나가면 답도 남지 않는다(11/8 결정).
 * 테스트 계정은 백엔드에서 뺀다.
 * 설문 내용(문구 · 문항 · 선택지) 고치기와 새 설문 만들기는 SurveyEditor.tsx — 보상 쿠폰도 설문마다 새로 만든다.
 * 켜져 있는 동안은 「진행 현황」을 15초마다 다시 읽는다.
 */

type State = "live" | "scheduled" | "ended" | "off";
interface Counts { opened: number; completed: number }
interface Survey {
  code: string; title: string; version: number; state: State; active: boolean;
  start_at: string | null; end_at: string | null; exclude_campuses: string[];
  reward_coupon_type_code: string; reward_campaign_active: boolean | null;
  banner: boolean; banner_active: boolean | null; question_count: number; counts: Counts; updated_at: string | null;
}
interface Option { value: string; label: string; count: number; fast: number }
interface Question { code: string; badge: string; text: string; answered: number; options: Option[] }
interface Progress {
  seconds_left: number | null; opened: number; completed: number; in_progress: number;
  completion_rate: number | null; fast: number; last_submitted_at: string | null; last_24h: number;
  hourly: { hour: string; count: number }[]; as_of: string;
}
interface Results {
  survey: Survey; progress?: Progress; version: number | null; versions: number[]; fast_seconds: number;
  totals: { opened: number; completed: number; fast: number };
  questions: Question[]; by_campus: Record<string, number>; by_entry: Record<string, number>; by_day: Record<string, number>;
}

const S_LABEL: Record<State, string> = { live: "응답 받는 중", scheduled: "시작 전", ended: "마감", off: "꺼짐" };
const S_TONE: Record<State, ChipTone> = { live: "green", scheduled: "navy", ended: "gray", off: "gray" };
const ENTRY_LABEL: Record<string, string> = { push: "푸시 알림", home_promo: "홈 프로모", home_featured: "홈 세로배너", wallet_card: "쿠폰함 카드", deeplink: "링크", unknown: "모름" };
const DAY_CHOICES = [3, 5, 7, 10, 14];
const REFRESH_MS = 15_000;

const leftLabel = (sec: number | null) => {
  if (sec === null) return "마감 없음";
  if (sec <= 0) return "마감";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

const kst = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
};
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export default function SurveyOps() {
  const [list, setList] = useState<Survey[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [res, setRes] = useState<Results | null>(null);
  const [resErr, setResErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipFast, setSkipFast] = useState(false);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "amber" | "red" | "blue"; text: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [auto, setAuto] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const loadList = useCallback(async () => {
    setListErr(null);
    try {
      const r = await fetch("/api/probe/surveys", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail ?? `응답 ${r.status}`);
      const rows: Survey[] = j.surveys ?? [];
      setList(rows);
      setCode((c) => (c && rows.some((s) => s.code === c) ? c : (rows.find((s) => s.state === "live") ?? rows[0])?.code ?? null));
    } catch (e) {
      setList(null);
      setListErr(e instanceof Error ? e.message : "목록을 읽지 못했습니다");
    }
  }, []);

  const loadResults = useCallback(async (c: string, v: number | null) => {
    setResErr(null);
    try {
      const q = new URLSearchParams({ code: c });
      if (v !== null) q.set("version", String(v));
      const r = await fetch(`/api/probe/surveys?${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail ?? `응답 ${r.status}`);
      setRes(j as Results);
      setRefreshedAt(new Date());
    } catch (e) {
      setRes(null);
      setResErr(e instanceof Error ? e.message : "결과를 읽지 못했습니다");
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await loadList();
    setLoading(false);
  }, [loadList]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (code) void loadResults(code, version); else setRes(null); }, [code, version, loadResults]);

  const survey = res?.survey ?? list?.find((s) => s.code === code) ?? null;

  // 응답을 받는 동안은 진행 현황을 15초마다 다시 읽는다
  const live = survey?.state === "live";
  useEffect(() => {
    if (!live || !auto || !code) return;
    const t = setInterval(() => { void loadList(); void loadResults(code, version); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [live, auto, code, version, loadList, loadResults]);

  async function afterEdit(note: string) {
    setMsg({ tone: "blue", text: note });
    await loadList();
    if (code) await loadResults(code, version);
  }
  async function afterCreate(newCode: string) {
    setMsg({ tone: "blue", text: `「${newCode}」를 만들었습니다 — 꺼진 채입니다. 내용을 확인하고 켜세요` });
    setVersion(null);
    await loadList();
    setCode(newCode);
  }

  async function toggle(action: "open" | "close") {
    if (!survey || busy) return;
    const ask = action === "open"
      ? `「${survey.title}」을 지금부터 ${days}일 동안 켤까요?\n\n앱에 설문 · 보상 쿠폰${survey.banner ? " · 홈 배너" : ""}가 같이 열립니다.${survey.exclude_campuses.length ? `\n${survey.exclude_campuses.join(" · ")} 사용자에게는 보이지 않습니다.` : ""}`
      : `「${survey.title}」을 끌까요?\n\n설문 · 보상 쿠폰${survey.banner ? " · 홈 배너" : ""}가 같이 닫힙니다. 이미 받은 쿠폰과 응답은 그대로 남습니다.`;
    if (!window.confirm(ask)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/probe/surveys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: survey.code, action, days }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail ?? `응답 ${r.status}`);
      setMsg({ tone: "blue", text: action === "open" ? `켰습니다 — ${kst(j.survey?.end_at ?? null)}까지` : "껐습니다" });
      await loadList();
      await loadResults(survey.code, version);
    } catch (e) {
      setMsg({ tone: "red", text: `${action === "open" ? "켜지" : "끄지"} 못했습니다: ${e instanceof Error ? e.message : "알 수 없는 오류"}` });
    } finally {
      setBusy(false);
    }
  }

  const totals = res?.totals;
  const completed = totals ? totals.completed - (skipFast ? totals.fast : 0) : 0;

  return (
    <>
      <PageHeader title="설문 조사" description="앱 내 설문을 켜고 끄고, 끝낸 응답(답 + 쿠폰 수령)을 봅니다. 테스트 계정은 빠져 있습니다."
        actions={<><Button icon={<IconPlus />} onClick={() => setCreateOpen(true)}>새 설문</Button><Button icon={<IconRefresh />} onClick={() => { void reload(); if (code) void loadResults(code, version); }} disabled={loading}>다시 읽기</Button></>} />

      {listErr && <div className="mb-4"><Notice tone="red" title="설문 목록을 읽지 못했습니다">{listErr}</Notice></div>}
      {msg && <div className="mb-4"><Notice tone={msg.tone} title={msg.text} /></div>}

      {loading && !list ? <Card><Skeleton rows={4} cols={3} /></Card> : list && list.length === 0 ? (
        <Card><Empty title="아직 만든 설문이 없습니다" detail="오른쪽 위 「새 설문」으로 만드세요. 꺼진 채로 생기고, 내용을 확인한 뒤 여기서 켭니다." /></Card>
      ) : survey && (
        <>
          {list && list.length > 1 && (
            <div className="mb-3"><FilterPills soft label="설문" value={survey.code} onChange={(c) => { setCode(c); setVersion(null); }} options={list.map((s) => ({ key: s.code, label: s.title }))} /></div>
          )}

          <section className="bg-white rounded-[18px] border border-black/[0.05] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-24px_rgba(5,0,114,0.25)] p-4 mb-4" aria-label="설문 상태">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-gray-500">{survey.code} · 문항 {survey.question_count}개 · v{survey.version}</p>
                <p className="flex items-center gap-2 flex-wrap text-[20px] font-bold text-gray-900 tracking-[-0.02em] mt-1">{survey.title} <Chip tone={S_TONE[survey.state]} dot={survey.state === "live"}>{S_LABEL[survey.state]}</Chip></p>
                <p className="text-[13px] text-gray-600 mt-1">
                  기간 {kst(survey.start_at)} ~ {survey.end_at ? kst(survey.end_at) : "마감 없음"}
                  {survey.exclude_campuses.length > 0 && <> · 제외 {survey.exclude_campuses.join(" · ")}</>}
                </p>
                <p className="flex items-center gap-1.5 flex-wrap text-[12px] text-gray-600 mt-2">
                  보상 쿠폰 {survey.reward_campaign_active === null ? <Chip tone="amber">캠페인 없음</Chip> : <Chip tone={survey.reward_campaign_active ? "green" : "gray"}>{survey.reward_campaign_active ? "켜짐" : "꺼짐"}</Chip>}
                  <span className="ml-2">홈 배너</span> {survey.banner ? <Chip tone={survey.banner_active ? "green" : "gray"}>{survey.banner_active ? "켜짐" : "꺼짐"}</Chip> : <Chip tone="gray">없음</Chip>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setEditOpen(true)} disabled={busy}>내용 고치기</Button>
                {survey.state === "live" || survey.state === "scheduled" ? (
                  <Button onClick={() => toggle("close")} disabled={busy}>끄기</Button>
                ) : (
                  <>
                    <Select aria-label="응답 기간" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} disabled={busy}>
                      {DAY_CHOICES.map((d) => <option key={d} value={d}>{d}일</option>)}
                    </Select>
                    <Button variant="primary" onClick={() => toggle("open")} disabled={busy}>지금 켜기</Button>
                  </>
                )}
              </div>
            </div>
            {survey.state === "live" && survey.reward_campaign_active === false && (
              <p className="mt-3 px-3 py-2 rounded-[10px] bg-amber-400/15 text-[13px] text-amber-900">설문은 열려 있는데 보상 쿠폰 캠페인이 꺼져 있습니다 — 답한 사람이 쿠폰을 못 받습니다. 끄고 다시 켜면 같이 맞춰집니다.</p>
            )}
          </section>

          {resErr && <div className="mb-4"><Notice tone="red" title="결과를 읽지 못했습니다">{resErr}</Notice></div>}

          {res?.progress && (
            <Card className="mb-4" title="진행 현황"
              description={live ? `응답 받는 중${refreshedAt ? ` · ${refreshedAt.toLocaleTimeString("ko-KR", { hour12: false })} 기준` : ""}` : "마지막으로 읽은 값"}
              actions={live ? (
                <label className="inline-flex items-center gap-2 text-[12px] text-gray-700 select-none">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 15초마다 새로 읽기
                </label>
              ) : undefined}>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                <Kpi label="끝낸 사람" value={res.progress.completed} suffix="명" hint={`최근 24시간 ${res.progress.last_24h}명`} />
                <Kpi label="연 사람" value={res.progress.opened} suffix="명" hint="로그인한 사람만 셉니다" />
                <Kpi label="아직 못 끝냄" value={res.progress.in_progress} suffix="명" hint="열었지만 쿠폰은 안 받음" />
                <Kpi label="완료율" value={res.progress.completion_rate === null ? "—" : `${Math.round(res.progress.completion_rate * 100)}`} suffix={res.progress.completion_rate === null ? undefined : "%"} />
                <Kpi label="남은 시간" value={leftLabel(res.progress.seconds_left)} hint={`마감 ${kst(survey.end_at)}`} />
              </div>
              <div className="mt-4">
                <p className="text-[12px] font-semibold text-gray-700 mb-1.5">최근 24시간 완료 수 <span className="font-normal text-gray-500">· 마지막 응답 {kst(res.progress.last_submitted_at)}</span></p>
                <div className="flex items-end gap-[3px] h-16" role="img" aria-label="최근 24시간 시간대별 완료 수">
                  {(() => {
                    const top = Math.max(1, ...res.progress.hourly.map((h) => h.count));
                    return res.progress.hourly.map((h) => (
                      <span key={h.hour} title={`${kst(h.hour)} · ${h.count}명`} className="flex-1 bg-navy rounded-t-[3px]"
                        style={{ height: `${Math.max(h.count ? 6 : 2, (h.count / top) * 100)}%`, opacity: h.count ? 1 : 0.15 }} />
                    ));
                  })()}
                </div>
                <div className="flex justify-between text-[11px] text-gray-400 mt-1"><span>{kst(res.progress.hourly[0]?.hour ?? null)}</span><span>지금</span></div>
              </div>
            </Card>
          )}

          {res && totals && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                {res.versions.length > 1 ? (
                  <FilterPills soft label="판" value={version === null ? "all" : String(version)} onChange={(v) => setVersion(v === "all" ? null : Number(v))}
                    options={[{ key: "all", label: "전체" }, ...res.versions.map((v) => ({ key: String(v), label: `v${v}` }))]} />
                ) : <span />}
                <label className="inline-flex items-center gap-2 text-[13px] text-gray-700 select-none">
                  <input type="checkbox" checked={skipFast} onChange={(e) => setSkipFast(e.target.checked)} />
                  {res.fast_seconds}초 안에 끝낸 응답 빼기
                </label>
              </div>

              <div className="sat-stagger grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                <Kpi label="끝낸 사람" value={completed} suffix="명" hint={skipFast ? `${res.fast_seconds}초 미만 ${totals.fast}명 뺌` : "답 + 쿠폰 수령"} />
                <Kpi label="연 사람" value={totals.opened} suffix="명" hint={`끝낸 비율 ${pct(totals.completed, totals.opened)} · 로그인한 사람만 셉니다`} />
                <Kpi label={`${res.fast_seconds}초 안에 끝냄`} value={totals.fast} suffix="명" hint={`끝낸 사람의 ${pct(totals.fast, totals.completed)} · 대충 누른 응답일 수 있습니다`} />
              </div>

              {completed === 0 ? (
                <Card className="mb-4"><Empty title="아직 끝낸 응답이 없습니다" detail={survey.state === "off" ? "설문이 꺼져 있습니다. 켜면 앱에 열립니다." : "앱에서 답하고 쿠폰을 받으면 여기에 쌓입니다."} /></Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                  {res.questions.map((q, i) => <QuestionCard key={q.code} n={i + 1} q={q} skipFast={skipFast} />)}
                </div>
              )}

              {completed > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <Breakdown title="학교별" description="답한 순간 등록된 학교" rows={res.by_campus} total={totals.completed} />
                  <Breakdown title="들어온 길" rows={res.by_entry} total={totals.completed} label={(k) => ENTRY_LABEL[k] ?? k} />
                  <Breakdown title="날짜별" description="KST" rows={res.by_day} total={totals.completed} label={(k) => `${+k.slice(5, 7)}/${+k.slice(8, 10)}`} keepOrder />
                </div>
              )}
              {skipFast && completed > 0 && <p className="text-[12px] text-gray-500 mb-4">학교별 · 들어온 길 · 날짜별은 빠른 응답을 빼지 않은 값입니다.</p>}
            </>
          )}

          <p className="text-[12px] text-gray-600 leading-relaxed">설문은 한 번에 하나만 켤 수 있습니다. 문구는 언제든 고칠 수 있고, 이미 답이 있는 문항 · 선택지는 지울 수 없습니다. 문항이 바뀌면 판(v)이 올라가 집계가 나뉩니다.</p>
        </>
      )}

      <SurveyEditSlideOver code={code} open={editOpen} onClose={() => setEditOpen(false)} onSaved={(note) => void afterEdit(note)} />
      <SurveyCreateSlideOver open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(c) => void afterCreate(c)} />
    </>
  );
}

function QuestionCard({ n, q, skipFast }: { n: number; q: Question; skipFast: boolean }) {
  const opts = q.options.map((o) => ({ ...o, n: skipFast ? o.count - o.fast : o.count }));
  const total = opts.reduce((a, o) => a + o.n, 0);
  const top = Math.max(1, ...opts.map((o) => o.n));
  return (
    <Card title={`${n}. ${q.text.replace(/\n/g, " ")}`} description={`${q.badge ? `${q.badge} · ` : ""}${total}명 답함`}>
      <ul className="space-y-2">
        {opts.map((o) => (
          <li key={o.value} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-[13px]">
            <span className="text-gray-800 truncate" title={o.label}>{o.label}</span>
            <span className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <span className="block h-full bg-navy rounded-full" style={{ width: `${(o.n / top) * 100}%`, opacity: o.n === top ? 1 : 0.55 }} />
            </span>
            <span className="tabular-nums text-right w-[5.5rem]"><b className="text-gray-900">{o.n}</b> <span className="text-gray-500">· {pct(o.n, total)}</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Breakdown({ title, description, rows, total, label = (k) => k, keepOrder }: { title: string; description?: string; rows: Record<string, number>; total: number; label?: (k: string) => string; keepOrder?: boolean }) {
  const entries = useMemo(() => { const e = Object.entries(rows); return keepOrder ? e : e.sort((a, b) => b[1] - a[1]); }, [rows, keepOrder]);
  return (
    <Card flush title={title} description={description}>
      <Table minWidth="12rem" stack={false}>
        <thead><tr><Th>{title === "날짜별" ? "날짜" : "항목"}</Th><Th align="right">명</Th><Th align="right">비율</Th></tr></thead>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}><Td>{label(k)}</Td><Td align="right" numeric>{v}</Td><Td align="right" numeric className="text-gray-500">{pct(v, total)}</Td></tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
