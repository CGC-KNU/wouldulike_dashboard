"use client";

import { useMemo, useState } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import { BLOCKER_KIND_LABEL, type Blocker } from "@/lib/draft/blockers";
import type { StoreMetric, StoreRow } from "@/lib/draft/types";
import { focusRing } from "./ui";
import StoreBenefitModal from "./StoreBenefitModal";

/**
 * 메인 「파트너 매장」 칸 (1121 민열님 2차: "덜 직관적 — 매장별 쿠폰 · 스탬프 처리량이 바로 보이게, 상권(대학)별 탭").
 *
 * 매장 한 곳 = 한 줄. 이번 달 쿠폰 · 스탬프 · 재방문(Probe 매장 지표)과 그 매장에 걸린 할 일 하나(영업 홈 「지금 막힌 것」)를 같이 둔다.
 * 후보(아직 매장이 아닌 곳)의 막힌 일은 매장 줄에 섞지 않고 맨 아래 한 줄로만.
 * 지표를 못 읽은 매장은 0 이 아니라 「—」.
 */

const CAMPUS_ORDER = ["경북대", "영남대", "계명대"];
const nf = new Intl.NumberFormat("ko-KR");
type Sort = "use" | "todo";

interface Row {
  id: number; name: string; campus: string; paid: boolean; hidden: boolean;
  coupon?: number; stamp?: number; revisit?: number; prevUse?: number | null;
  todo?: Blocker; todoCount: number;
}

export default function HomeStores({ stores, metrics, blockers, leadStale, meetings, onGo, actor, onStoresChanged }: {
  stores: StoreRow[] | null; metrics: StoreMetric[] | null | undefined; blockers: Blocker[];
  leadStale?: number; meetings?: number; onGo: (t: string) => void;
  /** 쿠폰 · 스탬프 팝업에서 영업 기록을 저장할 때 「누가」 */
  actor: string; onStoresChanged?: () => void;
}) {
  /** 매장 이름을 누르면 그 매장 쿠폰 · 스탬프 팝업 (1121) */
  const [benefitOf, setBenefitOf] = useState<number | null>(null);
  const [campus, setCampus] = useState<string>("전체");
  const [sort, setSort] = useState<Sort>("use");

  const rows = useMemo<Row[]>(() => {
    if (!stores) return [];
    const m = new Map((metrics ?? []).map((x) => [x.restaurant_id, x]));
    const todos = new Map<number, Blocker[]>();
    for (const b of blockers) {
      const rid = Number(b.id.split(":")[1]);
      if (b.kind === "lead" || Number.isNaN(rid)) continue;
      todos.set(rid, [...(todos.get(rid) ?? []), b]);
    }
    return stores.filter((s) => s.is_affiliate && !s.ops?.is_test).map((s) => {
      const x = m.get(s.restaurant_id);
      const ok = x && !x.unavailable;
      const t = (todos.get(s.restaurant_id) ?? []).sort((a, b) => a.rank - b.rank);
      return {
        id: s.restaurant_id, name: s.name, campus: s.ops?.campus ?? x?.campus ?? "경북대",
        paid: s.tier === "BOOST" || s.tier === "CONTENT", hidden: Boolean(x?.hidden_from_app),
        coupon: ok ? x.coupon_redeemed_this_month : undefined, stamp: ok ? x.stamp_earned_this_month : undefined,
        revisit: ok ? x.revisit_this_month : undefined,
        prevUse: ok && x.prev ? x.prev.coupon_redeemed + x.prev.stamp_earned : null,
        todo: t[0], todoCount: t.length,
      };
    });
  }, [stores, metrics, blockers]);

  const campuses = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.campus))].sort((a, b) => (CAMPUS_ORDER.indexOf(a) + 1 || 99) - (CAMPUS_ORDER.indexOf(b) + 1 || 99));
    return ["전체", ...names];
  }, [rows]);
  const here = rows.filter((r) => campus === "전체" || r.campus === campus);
  const use = (r: Row) => (r.coupon ?? 0) + (r.stamp ?? 0);
  const sorted = [...here].sort((a, b) => sort === "todo"
    ? (a.todo?.rank ?? 99) - (b.todo?.rank ?? 99) || use(b) - use(a)
    : use(b) - use(a) || (a.todo?.rank ?? 99) - (b.todo?.rank ?? 99));
  const sum = (k: "coupon" | "stamp" | "revisit") => here.reduce((a, r) => a + (r[k] ?? 0), 0);
  const known = here.some((r) => r.coupon !== undefined);
  const todoN = here.filter((r) => r.todo).length;

  if (!stores) return <p className="text-[13px] text-gray-500 py-8 text-center">매장을 읽는 중…</p>;

  return (
    <div>
      {/* 상권 탭 */}
      <div role="tablist" aria-label="상권" className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
        {campuses.map((c) => {
          const n = c === "전체" ? rows.length : rows.filter((r) => r.campus === c).length;
          const on = campus === c;
          return (
            <button key={c} role="tab" aria-selected={on} type="button" onClick={() => setCampus(c)}
              className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors ${focusRing} ${on ? "bg-navy text-white" : "bg-black/[0.04] text-gray-700 hover:bg-black/[0.07]"}`}>
              {c} <span className={`tabular-nums ${on ? "opacity-80" : "text-gray-500"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* 이 상권 합계 */}
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        <Sum label="매장" value={here.length} sub={`유료 ${here.filter((r) => r.paid).length}`} />
        <Sum label="쿠폰 사용" value={known ? sum("coupon") : undefined} sub="이번 달" />
        <Sum label="스탬프 적립" value={known ? sum("stamp") : undefined} sub="이번 달" />
        <Sum label="할 일 있는 매장" value={todoN} alert sub={todoN ? "아래 빨간 줄" : "없음"} />
      </div>

      {/* 매장 줄 */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-gray-500">매장별 이번 달 · 지난달 대비</span>
        <div className="inline-flex rounded-full bg-black/[0.04] p-0.5" role="group" aria-label="정렬">
          {(["use", "todo"] as Sort[]).map((k) => (
            <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
              className={`h-6 px-2.5 rounded-full text-[11.5px] font-semibold ${focusRing} ${sort === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {k === "use" ? "많이 쓴 순" : "할 일 먼저"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">매장 이름을 누르면 쿠폰 · 스탬프를 보고 바로 고칠 수 있습니다.</p>
      <div className="mt-1.5 -mx-1 max-h-[24rem] overflow-y-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-white z-[1]">
            <tr className="text-[11px] text-gray-500">
              <th scope="col" className="text-left font-semibold py-1.5 px-1">매장</th>
              <th scope="col" className="text-right font-semibold py-1.5 px-1 w-12">쿠폰</th>
              <th scope="col" className="text-right font-semibold py-1.5 px-1 w-12">스탬프</th>
              <th scope="col" className="text-right font-semibold py-1.5 px-1 w-12 hidden sm:table-cell">재방문</th>
              <th scope="col" className="text-right font-semibold py-1.5 px-1">할 일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {sorted.map((r) => {
              const now = use(r);
              const diff = r.prevUse === null || r.prevUse === undefined || r.coupon === undefined ? null : now - r.prevUse;
              const urgent = r.todo && r.todo.rank <= 1;
              return (
                <tr key={r.id} className={urgent ? "bg-red-500/[0.035]" : ""}>
                  <td className={`py-2 px-1 min-w-0 border-l-2 ${urgent ? "border-l-red-400" : r.todo ? "border-l-amber-300" : "border-l-transparent"}`}>
                    <button type="button" onClick={() => setBenefitOf(r.id)} title="쿠폰 · 스탬프 보기 · 고치기" className={`text-left hover:underline decoration-dotted underline-offset-2 ${focusRing} rounded`}>
                      <span className="font-semibold text-gray-900">{r.name}</span>
                    </button>
                    <span className="ml-1.5 text-[10.5px] font-semibold text-gray-400">{r.paid ? "유료" : "무료"}{campus === "전체" ? ` · ${r.campus}` : ""}{r.hidden ? " · 앱 숨김" : ""}</span>
                    {diff !== null && diff !== 0 && (
                      <span className={`ml-1 text-[10.5px] font-semibold tabular-nums ${diff > 0 ? "text-emerald-700" : "text-red-600"}`}>{diff > 0 ? "▲" : "▼"}{Math.abs(diff)}</span>
                    )}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums font-semibold text-gray-900">{r.coupon === undefined ? "—" : nf.format(r.coupon)}</td>
                  <td className="py-2 px-1 text-right tabular-nums font-semibold text-gray-900">{r.stamp === undefined ? "—" : nf.format(r.stamp)}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-gray-600 hidden sm:table-cell">{r.revisit === undefined ? "—" : nf.format(r.revisit)}</td>
                  <td className="py-2 px-1 text-right">
                    {r.todo ? (
                      <button type="button" onClick={() => onGo(r.todo!.action.go)} title={r.todo.why}
                        className={`inline-flex items-center gap-1 h-7 px-2 rounded-[8px] text-[11.5px] font-semibold whitespace-nowrap ${focusRing} ${urgent ? "bg-red-600 text-white hover:bg-red-700" : "bg-black/[0.05] text-gray-800 hover:bg-black/[0.08]"}`}>
                        {BLOCKER_KIND_LABEL[r.todo.kind]}{r.todoCount > 1 && ` +${r.todoCount - 1}`}<IconArrowRight size={12} aria-hidden="true" />
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {here.length === 0 && <p className="text-[13px] text-gray-500 py-6 text-center">이 상권에는 파트너 매장이 없습니다.</p>}
      </div>
      {metrics === null && <p className="mt-2 text-[11.5px] text-gray-500">쿠폰 · 스탬프를 읽지 못했습니다 — 「—」는 0 이 아니라 모름입니다.</p>}

      {/* 후보는 매장이 아니라 한 줄로 */}
      <div className="mt-3 pt-3 border-t border-black/[0.06] flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <button type="button" onClick={() => onGo("astro-leads")} className={`font-semibold hover:underline ${focusRing} rounded ${leadStale ? "text-red-600" : "text-gray-700"}`}>
          7일 넘게 멈춘 후보 {leadStale ?? "—"}곳 →
        </button>
        <button type="button" onClick={() => onGo("astro-calendar")} className={`font-semibold text-gray-700 hover:underline ${focusRing} rounded`}>
          이번 주 미팅 {meetings ?? "—"} →
        </button>
      </div>
      <StoreBenefitModal store={stores.find((s) => s.restaurant_id === benefitOf) ?? null} actor={actor} onClose={() => setBenefitOf(null)} onGo={onGo} onSaved={onStoresChanged} />
    </div>
  );
}

function Sum({ label, value, sub, alert }: { label: string; value: number | undefined; sub?: string; alert?: boolean }) {
  const hot = alert && typeof value === "number" && value > 0;
  return (
    <div className={`rounded-[12px] px-2.5 py-2 min-w-0 ${hot ? "bg-red-500/[0.06]" : "bg-black/[0.03]"}`}>
      <span className="block text-[11px] font-semibold text-gray-500 truncate">{label}</span>
      <span className={`block text-[18px] font-bold tabular-nums leading-tight ${hot ? "text-red-600" : "text-gray-900"}`}>{value === undefined ? "—" : nf.format(value)}</span>
      {sub && <span className="block text-[10.5px] text-gray-500 truncate">{sub}</span>}
    </div>
  );
}
