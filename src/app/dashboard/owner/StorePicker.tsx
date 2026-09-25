"use client";

import { useMemo, useState } from "react";
import { IconChevronRight, IconSearch } from "@tabler/icons-react";

/**
 * 관리자가 '파트너' 로 넘어왔을 때 — **어느 매장의 눈으로 볼지** 고른다 (민열님 0919).
 *
 * 전에는 관리자가 파트너를 누르면 볼 매장이 없어 곧바로 관리자 화면으로 되돌렸다.
 * 화면이 그대로여서 '눌러도 안 바뀐다' 로 보였다. 되돌리는 대신 물어본다.
 * 점주 계정은 자기 매장이 있으니 여기까지 오지 않는다.
 */
export interface PickStore { restaurant_id: number; name: string; tier: string | null; is_affiliate?: boolean }

export default function StorePicker({ stores }: { stores: PickStore[] }) {
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const key = q.trim().toLowerCase();
    const rows = stores.filter((s) => s.is_affiliate !== false);
    const hit = key ? rows.filter((s) => s.name.toLowerCase().includes(key) || String(s.restaurant_id).includes(key)) : rows;
    // 유료 매장이 먼저 — 파트너 뷰를 확인할 일이 제일 잦은 곳이다
    const paid = (s: PickStore) => (s.tier === "BOOST" || s.tier === "CONTENT" ? 0 : 1);
    return [...hit].sort((a, b) => paid(a) - paid(b) || a.name.localeCompare(b.name, "ko"));
  }, [stores, q]);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-16">
      <h1 className="text-[20px] font-bold text-gray-900 tracking-[-0.01em]">어느 매장으로 볼까요?</h1>
      <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
        파트너 뷰는 <b className="text-gray-700">점주가 보는 화면</b>입니다. 관리자에게는 자기 매장이 없어서, 볼 매장을 골라 주셔야 해요.
      </p>

      <div className="relative mt-5">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="매장 이름 또는 ID"
          aria-label="매장 찾기"
          className="w-full text-[13.5px] border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-periwinkle"
        />
      </div>

      {stores.length === 0 ? (
        <p className="text-[13px] text-gray-400 mt-6">매장 목록을 읽지 못했습니다 — 0곳이 아니라 모름입니다. 새로고침해 보세요.</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-gray-400 mt-6">‘{q}’ 에 맞는 매장이 없습니다.</p>
      ) : (
        <ul className="mt-4 bg-white rounded-[18px] border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {list.map((s) => (
            <li key={s.restaurant_id}>
              <a href={`/dashboard/owner?rid=${s.restaurant_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-gray-900 truncate">{s.name}</span>
                  <span className="block text-[11.5px] text-gray-400">ID {s.restaurant_id}</span>
                </span>
                <span className={`shrink-0 text-[12px] font-bold px-2 py-0.5 rounded-full ${s.tier === "BOOST" ? "bg-navy/[0.08] text-navy" : s.tier === "CONTENT" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                  {s.tier ?? "FREE"}
                </span>
                <IconChevronRight size={16} className="shrink-0 text-gray-300" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] text-gray-400 mt-4">
        고른 매장은 주소에 <code className="font-mono">?rid=</code> 로 남습니다. 관리자 화면으로 돌아가려면 위 전환 버튼에서 직함 쪽을 누르세요.
      </p>
    </div>
  );
}
