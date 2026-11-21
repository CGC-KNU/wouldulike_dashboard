"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "./fetchJson";
import { agoLabel } from "./ui";

/**
 * 업무 대시보드 — 메인 맨 아래 (1121 민열님).
 *
 * 기능 조직 표(운영 로드맵 26-28 v2 · 트랙 3 × 기능 3) 그대로. 매주 월요일 #general 에서 나눈 이번 주 할 일,
 * 금요일 보고(성과 · 현황 · 문제)를 리브라가 사람 칸에 채운다(백엔드 astro/workboard.py · AdminConfig home:workboard). 화면은 읽기만.
 * 표의 모양(누가 어느 칸)은 여기 있다 — 조직이 바뀌면 ORG 만 고친다.
 */

const FUNCS = [
  { key: "dev", name: "개발", lead: "재민" },
  { key: "sales", name: "영업", lead: "준영" },
  { key: "mkt", name: "마케팅", lead: "아윤" },
] as const;

const ORG: { track: string; goal: string; lead: string; cells: { who: string; role: string; scope: string }[] }[] = [
  { track: "1 · 온보딩 / 입점", goal: "매장이 들어온다", lead: "수연", cells: [
    { who: "재민", role: "플랫폼 아웃라인 · 개발", scope: "파트너 모드 · 계좌이체 · 정산" },
    { who: "수연", role: "외부 영업", scope: "신규 발굴 · 입점 · 업종 확장" },
    { who: "서연", role: "브랜딩", scope: "입점 키트 · 소개서 · 시즌 비주얼" },
  ] },
  { track: "2 · 운영 / 플랜", goal: "매장이 남는다", lead: "민찬", cells: [
    { who: "민찬", role: "데이터 · 매장 · 성과 분석", scope: "처리량 집계 · 매장 리포트 · 기준선" },
    { who: "준영", role: "업세일링 (무료 → 유료)", scope: "재계약 · 선납 · 무료 매장" },
    { who: "희진", role: "매장 홍보 · 매거진", scope: "인스타 매거진 · 매장 소개 콘텐츠" },
  ] },
  { track: "3 · 플랫폼 / 매출 개선", goal: "매장이 번다", lead: "서지", cells: [
    { who: "성수", role: "쿠폰 · 스탬프 · 재방문", scope: "전환율 · 마일리지 흐름 · 앱 경험" },
    { who: "서지", role: "매장 단위 매출 개선", scope: "유형별 개인화 · 방학 모델 · BM" },
    { who: "아윤", role: "마케팅 그로스 · 인사이트", scope: "가입 · 활성 캠페인 · 실험 분석" },
  ] },
];

interface Cell { plan?: string[]; done?: string[]; status?: string; issues?: string[]; src?: string; at?: string }
interface Doc { week?: string; updated_at?: string | null; cells: Record<string, Cell> }

export default function WorkBoard() {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  useEffect(() => { fetchJson<Doc>("/api/workboard").then(setDoc); }, []);

  return (
    <section aria-labelledby="h-work" className="mt-7">
      <div className="flex items-baseline justify-between gap-3 mb-2.5 flex-wrap">
        <h2 id="h-work" className="text-[15px] font-bold text-gray-900 tracking-[-0.01em]">
          업무 대시보드
          <span className="ml-2 text-[12px] font-medium text-gray-500">{doc?.week ? `${doc.week} · ` : ""}월요일 #general 공유 · 금요일 성과 · 현황 · 문제 보고를 리브라가 정리</span>
        </h2>
        {doc?.updated_at && <span className="text-[11.5px] text-gray-400">{agoLabel(doc.updated_at)} 갱신</span>}
      </div>
      {doc === null && <p className="mb-2 text-[12px] text-red-600">업무 대시보드를 읽지 못했습니다 — 새로고침해 주세요.</p>}

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[860px] grid grid-cols-[200px_repeat(3,minmax(0,1fr))] gap-2">
          <div />
          {FUNCS.map((f) => (
            <div key={f.key} className="text-center pb-1.5 border-b-2 border-[#C9A96B]/60">
              <p className="text-[14px] font-bold text-gray-900">{f.name}</p>
              <p className="text-[11px] text-gray-500">리드 {f.lead}</p>
            </div>
          ))}
          {ORG.map((row) => (
            <Row key={row.track} row={row} cells={doc?.cells ?? {}} loading={doc === undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({ row, cells, loading }: { row: (typeof ORG)[number]; cells: Record<string, Cell>; loading: boolean }) {
  return (
    <>
      <div className="rounded-[14px] bg-[#3F9A7E] text-white px-4 py-3.5">
        <p className="text-[15px] font-bold leading-snug">{row.track}</p>
        <p className="text-[12.5px] text-white/85 mt-1">{row.goal}</p>
        <p className="text-[11px] text-white/65 mt-1.5">트랙 리드 {row.lead}</p>
      </div>
      {row.cells.map((c) => <PersonCell key={c.who} meta={c} cell={cells[c.who]} loading={loading} />)}
    </>
  );
}

function PersonCell({ meta, cell, loading }: { meta: { who: string; role: string; scope: string }; cell?: Cell; loading: boolean }) {
  const empty = !cell || (!cell.plan?.length && !cell.done?.length && !cell.status && !cell.issues?.length);
  return (
    <div className="rounded-[14px] bg-white/90 border border-black/[0.06] px-3.5 py-3 min-w-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[16px] font-bold text-gray-900">{meta.who}</p>
        {cell?.at && <span className="text-[10.5px] text-gray-400 shrink-0">{agoLabel(cell.at)}</span>}
      </div>
      <p className="text-[12.5px] font-bold text-[#2F8A6E] leading-snug">{meta.role}</p>
      <p className="text-[11.5px] text-gray-500 mt-0.5">{meta.scope}</p>
      <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-2 text-[12.5px] leading-snug">
        {loading ? <p className="text-gray-400">읽는 중…</p> : empty ? (
          <p className="text-gray-400">월요일 #general 공유 뒤 리브라가 채웁니다.</p>
        ) : (
          <>
            {cell!.plan?.length ? <Part label="이번 주" items={cell!.plan} /> : null}
            {cell!.done?.length ? <Part label="성과" items={cell!.done} tone="good" /> : null}
            {cell!.status ? <div><p className="text-[10.5px] font-bold text-gray-500">현황</p><p className="text-gray-800">{cell!.status}</p></div> : null}
            {cell!.issues?.length ? <Part label="문제" items={cell!.issues} tone="bad" /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Part({ label, items, tone }: { label: string; items: string[]; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className={`text-[10.5px] font-bold ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-gray-500"}`}>{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((x, i) => <li key={i} className="text-gray-800 pl-2.5 relative before:content-['·'] before:absolute before:left-0 before:text-gray-400">{x}</li>)}
      </ul>
    </div>
  );
}
