"use client";

import { useEffect, useState } from "react";
import { IconBulb, IconChartBar, IconCode, IconSpeakerphone, IconUsers } from "@tabler/icons-react";
import { fetchJson } from "./fetchJson";
import { SlideOver, agoLabel, focusRing } from "./ui";

/**
 * 업무 대시보드 — 메인 맨 아래 (1121 민열님).
 *
 * 기능 조직 표(운영 로드맵 26-28 v2 · 트랙 3 × 기능 3) 그대로. 매주 월요일 #general 에서 나눈 이번 주 할 일,
 * 금요일 보고(성과 · 현황 · 이슈)를 리브라가 사람 칸에 채운다(백엔드 astro/workboard.py · AdminConfig home:workboard).
 * 2차(같은 날): 세틀라이트 톤 · 칸엔 건수만, 누르면 오른쪽 패널에 「현황 · 성과 · 이슈」 탭 · 표 아래 리브라 제언.
 * 표의 모양(누가 어느 칸)은 여기 있다 — 조직이 바뀌면 ORG 만 고친다.
 */

const FUNCS = [
  { key: "dev", name: "개발", lead: "재민", Icon: IconCode },
  { key: "sales", name: "영업", lead: "준영", Icon: IconUsers },
  { key: "mkt", name: "마케팅", lead: "아윤", Icon: IconSpeakerphone },
] as const;

type Meta = { who: string; role: string; scope: string[]; track: string; func: string };

const ORG: { no: number; track: string; goal: string; lead: string; cells: Omit<Meta, "track" | "func">[] }[] = [
  { no: 1, track: "온보딩 / 입점", goal: "매장이 들어온다", lead: "수연", cells: [
    { who: "재민", role: "플랫폼 아웃라인 · 개발", scope: ["파트너 모드", "계좌이체", "정산"] },
    { who: "수연", role: "외부 영업", scope: ["신규 발굴", "입점", "업종 확장"] },
    { who: "서연", role: "브랜딩", scope: ["입점 키트", "소개서", "시즌 비주얼"] },
  ] },
  { no: 2, track: "운영 / 플랜", goal: "매장이 남는다", lead: "민찬", cells: [
    { who: "민찬", role: "데이터 · 매장 · 성과 분석", scope: ["처리량 집계", "매장 리포트", "기준선"] },
    { who: "준영", role: "업세일링 (무료 → 유료)", scope: ["재계약", "선납", "무료 매장"] },
    { who: "희진", role: "매장 홍보 · 매거진", scope: ["인스타 매거진", "매장 소개 콘텐츠"] },
  ] },
  { no: 3, track: "플랫폼 / 매출 개선", goal: "매장이 번다", lead: "서지", cells: [
    { who: "성수", role: "쿠폰 · 스탬프 · 재방문", scope: ["전환율", "마일리지 흐름", "앱 경험"] },
    { who: "서지", role: "매장 단위 매출 개선", scope: ["유형별 개인화", "방학 모델", "BM"] },
    { who: "아윤", role: "마케팅 그로스 · 인사이트", scope: ["가입 · 활성 캠페인", "실험 분석"] },
  ] },
];

interface Cell { plan?: string[]; done?: string[]; status?: string; issues?: string[]; src?: string; at?: string }
interface Advice { title: string; body: string; who?: string[] }
interface Doc { week?: string; updated_at?: string | null; cells: Record<string, Cell>; advice?: Advice[]; advice_at?: string }
type Tab = "status" | "done" | "issues";

export default function WorkBoard() {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [pick, setPick] = useState<Meta | null>(null);
  const [tab, setTab] = useState<Tab>("status");
  useEffect(() => { fetchJson<Doc>("/api/workboard").then(setDoc); }, []);
  const cells = doc?.cells ?? {};
  const open = (m: Meta, t: Tab = "status") => { setPick(m); setTab(t); };

  return (
    <section aria-labelledby="h-work" className="mt-8">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-periwinkle">WEEKLY · 기능 조직</p>
          <h2 id="h-work" className="text-[18px] font-bold text-gray-900 tracking-[-0.015em] mt-0.5">
            업무 대시보드 {doc?.week && <span className="ml-1.5 align-middle text-[12px] font-semibold text-navy bg-navy/[0.07] rounded-full px-2 py-0.5">{doc.week}</span>}
          </h2>
          <p className="text-[12px] text-gray-500 mt-0.5">월요일 #general 공유 · 금요일 성과 · 현황 · 이슈 보고를 리브라가 정리합니다. 사람 칸을 누르면 자세히 봅니다.</p>
        </div>
        {doc?.updated_at && <span className="text-[11.5px] text-gray-400">{agoLabel(doc.updated_at)} 갱신</span>}
      </div>
      {doc === null && <p className="mb-2 text-[12px] text-red-600">업무 대시보드를 읽지 못했습니다 — 새로고침해 주세요.</p>}

      <div className="rounded-[22px] p-3 sm:p-4 bg-[linear-gradient(160deg,rgba(5,0,114,0.05),rgba(99,102,224,0.08))] border border-white/70 overflow-x-auto">
        <div className="min-w-[880px] grid grid-cols-[190px_repeat(3,minmax(0,1fr))] gap-2.5">
          <div />
          {FUNCS.map(({ key, name, lead, Icon }) => (
            <div key={key} className="flex items-center gap-2.5 px-3 py-2 rounded-[14px] bg-white/70 border border-white/70">
              <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white bg-[linear-gradient(135deg,#3B37C8,#050072)] shadow-[0_6px_14px_-8px_rgba(5,0,114,0.7)]"><Icon size={16} stroke={2} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-gray-900 leading-tight">{name}</span>
                <span className="block text-[11px] text-gray-500">기능 리드 <b className="text-gray-700">{lead}</b></span>
              </span>
            </div>
          ))}
          {ORG.map((row) => (
            <Row key={row.no} row={row} cells={cells} loading={doc === undefined} active={pick?.who ?? null} onOpen={open} />
          ))}
        </div>
      </div>

      <AdviceBox advice={doc?.advice ?? []} at={doc?.advice_at} loading={doc === undefined} />

      <SlideOver open={Boolean(pick)} onClose={() => setPick(null)} width="md"
        title={pick ? `${pick.who} · ${pick.role}` : ""}
        subtitle={pick ? `${pick.track} × ${pick.func}${doc?.week ? ` · ${doc.week}` : ""}` : ""}>
        {pick && <PersonPanel meta={pick} cell={cells[pick.who]} tab={tab} setTab={setTab} />}
      </SlideOver>
    </section>
  );
}

function Row({ row, cells, loading, active, onOpen }: { row: (typeof ORG)[number]; cells: Record<string, Cell>; loading: boolean; active: string | null; onOpen: (m: Meta, t?: Tab) => void }) {
  return (
    <>
      <div className="relative overflow-hidden rounded-[16px] text-white px-4 py-3.5 bg-[linear-gradient(150deg,#1512a3_0%,#050072_100%)] shadow-[0_14px_30px_-20px_rgba(5,0,114,0.8)]">
        <span aria-hidden="true" className="absolute -right-3 -bottom-6 text-[84px] font-black leading-none text-white/[0.07] tabular-nums">{row.no}</span>
        <p className="text-[11px] font-bold tracking-[0.12em] text-[#B9BBF5]">TRACK {row.no}</p>
        <p className="text-[15px] font-bold leading-snug mt-0.5">{row.track}</p>
        <p className="text-[12.5px] text-white/80 mt-1">{row.goal}</p>
        <p className="text-[11px] text-white/60 mt-2">트랙 리드 <b className="text-white/90">{row.lead}</b></p>
      </div>
      {row.cells.map((c, i) => {
        const meta: Meta = { ...c, track: row.track, func: FUNCS[i].name };
        return <PersonCell key={c.who} meta={meta} cell={cells[c.who]} loading={loading} on={active === c.who} onOpen={onOpen} />;
      })}
    </>
  );
}

function PersonCell({ meta, cell, loading, on, onOpen }: { meta: Meta; cell?: Cell; loading: boolean; on: boolean; onOpen: (m: Meta, t?: Tab) => void }) {
  const n = { plan: cell?.plan?.length ?? 0, done: cell?.done?.length ?? 0, issues: cell?.issues?.length ?? 0 };
  const empty = !cell || (!n.plan && !n.done && !n.issues && !cell.status);
  return (
    <button type="button" onClick={() => onOpen(meta)} aria-label={`${meta.who} 업무 보기`}
      className={`group text-left rounded-[16px] bg-white/85 backdrop-blur border px-3.5 py-3 min-w-0 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-22px_rgba(5,0,114,0.5)] ${on ? "border-navy/40 ring-2 ring-navy/15" : "border-white/70"} ${focusRing}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-full grid place-items-center text-[14px] font-bold text-white bg-[linear-gradient(135deg,#6366E0,#1512a3)] shrink-0">{meta.who.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-gray-900 leading-tight">{meta.who}</span>
          <span className="block text-[12px] font-semibold text-navy truncate">{meta.role}</span>
        </span>
        {cell?.at && <span className="text-[10.5px] text-gray-400 shrink-0">{agoLabel(cell.at)}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {meta.scope.map((s) => <span key={s} className="text-[10.5px] font-medium text-gray-600 bg-black/[0.04] rounded-full px-1.5 py-0.5">{s}</span>)}
      </div>
      <div className="mt-2.5 pt-2.5 border-t border-black/[0.06]">
        {loading ? <span className="text-[11.5px] text-gray-400">읽는 중…</span> : empty ? (
          <span className="text-[11.5px] text-gray-400">월요일 공유 전 — 리브라가 채웁니다</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Pill n={n.plan} label="이번 주" tone="navy" />
            <Pill n={n.done} label="성과" tone="green" />
            <Pill n={n.issues} label="이슈" tone="red" />
            {cell?.status && <span className="text-[11.5px] text-gray-600 truncate max-w-full">{cell.status}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function Pill({ n, label, tone }: { n: number; label: string; tone: "navy" | "green" | "red" }) {
  const cls = tone === "green" ? "bg-emerald-500/10 text-emerald-800" : tone === "red" ? (n ? "bg-red-500/10 text-red-700" : "bg-black/[0.04] text-gray-400") : "bg-navy/[0.07] text-navy";
  return <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-semibold ${cls}`}>{label}<b className="tabular-nums">{n}</b></span>;
}

function PersonPanel({ meta, cell, tab, setTab }: { meta: Meta; cell?: Cell; tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { k: Tab; label: string; n?: number }[] = [
    { k: "status", label: "현황" },
    { k: "done", label: "성과", n: cell?.done?.length ?? 0 },
    { k: "issues", label: "이슈", n: cell?.issues?.length ?? 0 },
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-3">
        {meta.scope.map((s) => <span key={s} className="text-[11px] font-medium text-gray-600 bg-black/[0.04] rounded-full px-2 py-0.5">{s}</span>)}
      </div>
      <div role="tablist" aria-label={`${meta.who} 업무`} className="inline-flex rounded-full bg-black/[0.05] p-0.5 mb-4">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} type="button" onClick={() => setTab(t.k)}
            className={`h-8 px-3.5 rounded-full text-[13px] font-semibold ${focusRing} ${tab === t.k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            {t.label}{t.n ? <span className={`ml-1 tabular-nums ${t.k === "issues" ? "text-red-600" : "text-emerald-700"}`}>{t.n}</span> : null}
          </button>
        ))}
      </div>
      {!cell ? <Empty /> : tab === "status" ? (
        <div className="space-y-4">
          <Block title="지금 상황">{cell.status ? <p className="text-[14px] text-gray-800 leading-relaxed">{cell.status}</p> : <Muted text="아직 적힌 현황이 없습니다." />}</Block>
          <Block title="이번 주 할 일 · 월요일 공유">{cell.plan?.length ? <List items={cell.plan} /> : <Muted text="월요일 #general 공유 뒤 채웁니다." />}</Block>
        </div>
      ) : tab === "done" ? (
        <Block title="이번 주 성과 · 금요일 보고">{cell.done?.length ? <List items={cell.done} tone="good" /> : <Muted text="금요일 보고 뒤 채웁니다." />}</Block>
      ) : (
        <Block title="이슈 · 막힌 것">{cell.issues?.length ? <List items={cell.issues} tone="bad" /> : <Muted text="보고된 이슈가 없습니다." />}</Block>
      )}
      {cell?.src && <p className="mt-5 text-[12px] text-gray-500">근거 · {/^https?:/.test(cell.src) ? <a href={cell.src} target="_blank" rel="noreferrer" className="text-navy font-semibold hover:underline">슬랙에서 보기</a> : cell.src}</p>}
      {cell?.at && <p className="mt-1 text-[11.5px] text-gray-400">{agoLabel(cell.at)} 리브라가 갱신</p>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-[11.5px] font-bold text-gray-500 mb-1.5">{title}</p>{children}</div>;
}
function List({ items, tone }: { items: string[]; tone?: "good" | "bad" }) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "bad" ? "bg-red-500" : "bg-navy";
  return <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-[13.5px] text-gray-800 leading-snug"><span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />{x}</li>)}</ul>;
}
function Muted({ text }: { text: string }) { return <p className="text-[13px] text-gray-400">{text}</p>; }
function Empty() { return <p className="text-[13px] text-gray-400">아직 이번 주 내용이 없습니다. 월요일 #general 공유 뒤 리브라가 채웁니다.</p>; }

function AdviceBox({ advice, at, loading }: { advice: Advice[]; at?: string; loading: boolean }) {
  return (
    <div className="mt-3 rounded-[20px] border border-libra/25 bg-[linear-gradient(135deg,rgba(43,190,155,0.07),rgba(127,233,203,0.12))] p-4">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="inline-flex items-center gap-1.5 text-[14px] font-bold text-libra-deep"><IconBulb size={17} stroke={2} aria-hidden="true" />리브라 제언</p>
        {at && <span className="text-[11px] text-gray-500">{agoLabel(at)}</span>}
      </div>
      {loading ? <p className="text-[12.5px] text-gray-500">읽는 중…</p> : advice.length === 0 ? (
        <p className="text-[12.5px] text-gray-500">아직 제언이 없습니다.</p>
      ) : (
        <ol className="grid gap-2 md:grid-cols-2">
          {advice.map((a, i) => (
            <li key={i} className="rounded-[14px] bg-white/80 px-3.5 py-3 min-w-0">
              <p className="text-[13.5px] font-bold text-gray-900 flex items-start gap-1.5"><span className="text-libra-deep tabular-nums">{i + 1}.</span>{a.title}</p>
              <p className="mt-1 text-[12.5px] text-gray-700 leading-relaxed">{a.body}</p>
              {a.who?.length ? <p className="mt-1.5 flex flex-wrap gap-1">{a.who.map((w) => <span key={w} className="text-[11px] font-semibold text-navy bg-navy/[0.07] rounded-full px-2 py-0.5">{w}</span>)}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-gray-500 inline-flex items-center gap-1"><IconChartBar size={12} aria-hidden="true" />세틀라이트 숫자 · 슬랙 공유 · 보고를 보고 리브라가 씁니다. 결정은 사람이 합니다.</p>
    </div>
  );
}
