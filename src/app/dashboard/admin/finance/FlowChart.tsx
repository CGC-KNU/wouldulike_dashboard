"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { won, wonShort, type MonthRow } from "@/lib/finance/calc";

/**
 * 월별 입금 · 출금 막대 — 재무 대시보드의 기본 그림(Mercury · Brex 의 cash in / cash out 막대와 같은 문법).
 *
 * 지킨 것: 축은 하나(원) · 시리즈 둘이라 범례를 항상 둔다 · 색은 검증된 팔레트의 1·2번(파랑 · 주황, 인접 쌍이 색각 이상에서도 갈린다) ·
 * 막대는 얇고 위쪽만 둥글고 막대 사이 2px · 격자는 가로만 옅게 · 호버하면 두 값과 순입금을 툴팁으로 · 표 보기(아래 details)를 같이 둔다.
 * 색은 CSS 변수라 다크 모드에서는 어두운 면에 맞춘 단계로 바뀐다.
 */

const label = (p: string) => `${Number(p.slice(5))}월`;

interface TipProps {
  active?: boolean;
  payload?: { payload: MonthRow }[];
}

function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl bg-white border border-black/[0.08] shadow-[0_8px_24px_-12px_rgba(16,24,40,0.3)] px-3 py-2.5 text-[12px] min-w-[10rem]">
      <p className="font-semibold text-gray-900 mb-1.5">{r.period.slice(0, 4)}년 {label(r.period)}</p>
      <p className="flex items-center justify-between gap-4 text-gray-700"><span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: "var(--fin-income)" }} />입금</span><b className="tabular-nums text-gray-900">{won(r.income)}</b></p>
      <p className="flex items-center justify-between gap-4 text-gray-700 mt-0.5"><span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: "var(--fin-expense)" }} />출금</span><b className="tabular-nums text-gray-900">{won(r.expense)}</b></p>
      <p className="flex items-center justify-between gap-4 text-gray-500 mt-1.5 pt-1.5 border-t border-black/[0.06]"><span>순입금</span><b className={`tabular-nums ${r.net < 0 ? "text-red-600" : "text-gray-900"}`}>{r.net < 0 ? "−" : ""}{won(Math.abs(r.net))}</b></p>
    </div>
  );
}

export default function FlowChart({ rows, selected, onSelect }: { rows: MonthRow[]; selected?: string; onSelect?: (period: string) => void }) {
  const empty = rows.every((r) => r.income === 0 && r.expense === 0);
  return (
    <div className="fin-viz">
      <style>{`
        .fin-viz { --fin-income:#2a78d6; --fin-expense:#eb6834; --fin-grid:rgba(16,24,40,0.07); --fin-axis:#6b7280; }
        @media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) .fin-viz { --fin-income:#3987e5; --fin-expense:#d95926; --fin-grid:rgba(255,255,255,0.1); --fin-axis:#c3c2b7; } }
        :root[data-theme="dark"] .fin-viz { --fin-income:#3987e5; --fin-expense:#d95926; --fin-grid:rgba(255,255,255,0.1); --fin-axis:#c3c2b7; }
      `}</style>

      <div className="flex items-center gap-4 text-[12px] text-gray-600 mb-3" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: "var(--fin-income)" }} />입금</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: "var(--fin-expense)" }} />출금</span>
      </div>

      {empty ? (
        <p className="py-16 text-center text-[13px] text-gray-500">이 기간에는 입금도 출금도 기록돼 있지 않습니다.</p>
      ) : (
        <div role="img" aria-label={`최근 ${rows.length}개월 입금과 출금. ${rows.map((r) => `${label(r.period)} 입금 ${won(r.income)} 출금 ${won(r.expense)}`).join(", ")}`} className="h-[240px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} onClick={(s) => { const p = (s as { activePayload?: { payload: MonthRow }[] } | undefined)?.activePayload?.[0]?.payload.period; if (p && onSelect) onSelect(p); }}>
              <CartesianGrid vertical={false} stroke="var(--fin-grid)" />
              <XAxis dataKey="period" tickFormatter={label} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--fin-axis)" }} />
              <YAxis tickFormatter={wonShort} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 12, fill: "var(--fin-axis)" }} />
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(5,0,114,0.04)" }} />
              <Bar dataKey="income" name="입금" fill="var(--fin-income)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Bar dataKey="expense" name="출금" fill="var(--fin-expense)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <details className="mt-3 group">
        <summary className="text-[12px] font-medium text-gray-500 cursor-pointer select-none hover:text-gray-800">표로 보기</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[12px] border-collapse min-w-[22rem]">
            <thead><tr className="text-gray-500"><th scope="col" className="text-left font-medium py-1.5">월</th><th scope="col" className="text-right font-medium py-1.5">입금</th><th scope="col" className="text-right font-medium py-1.5">출금</th><th scope="col" className="text-right font-medium py-1.5">순입금</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period} className={`border-t border-black/[0.05] ${selected === r.period ? "bg-navy/[0.04]" : ""}`}>
                  <th scope="row" className="text-left font-medium text-gray-700 py-1.5">{r.period.slice(0, 4)}년 {label(r.period)}</th>
                  <td className="text-right tabular-nums py-1.5">{won(r.income)}</td>
                  <td className="text-right tabular-nums py-1.5">{won(r.expense)}</td>
                  <td className={`text-right tabular-nums py-1.5 font-semibold ${r.net < 0 ? "text-red-600" : "text-gray-900"}`}>{r.net < 0 ? "−" : ""}{won(Math.abs(r.net))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
