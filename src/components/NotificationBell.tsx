"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconBell } from "@tabler/icons-react";

/**
 * 알림 종 — 지금은 **혜택 변경 신청**만 (민열님 0924).
 *
 * ## 왜 헤더에 있나
 * 신청은 슬랙으로도 간다. 그런데 슬랙은 흘러간다 — 스크롤 두 번이면 안 보인다.
 * 처리해야 할 것이 **몇 건 남았는지**는 툴을 열면 항상 보여야 한다. 그래서 메인 헤더다.
 *
 * ## 규칙
 * - 숫자는 **대기 중인 건수**다. 0 이면 점도 숫자도 없다 — 빈 배지는 없는 것만 못하다.
 * - 못 읽었으면 0 이라고 하지 않는다. 종은 조용히 두고, 열었을 때 못 읽었다고 말한다.
 * - 60초마다 다시 센다. 실시간일 필요가 없다 — 사람이 승인하는 일이다.
 */

interface Req {
  id: number;
  restaurant_id: number;
  store_name: string;
  field_label: string;
  before: string;
  after: string;
  created_at: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function NotificationBell() {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/astro/benefit-requests?status=PENDING", { cache: "no-store" });
      if (!res.ok) { setFailed(true); return; }
      const d = await res.json();
      setRows(Array.isArray(d.requests) ? d.requests : []);
      setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // 바깥을 누르거나 Esc 면 닫는다. 드롭다운이 열린 채 다른 걸 누르면 길을 잃는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const count = rows?.length ?? 0;

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={count > 0 ? `알림 ${count}건` : "알림"}
        title={count > 0 ? `처리할 신청 ${count}건` : "알림"}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <IconBell size={16} stroke={2} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#E0A23C] text-[9.5px] font-bold text-white flex items-center justify-center tabular-nums">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 w-[290px] max-w-[calc(100vw-2rem)] bg-white rounded-[14px] border border-black/[0.08] shadow-[0_16px_48px_-16px_rgba(5,0,114,0.45)] overflow-hidden z-50"
        >
          <div className="px-3.5 py-2.5 border-b border-black/[0.06]">
            <p className="text-[12.5px] font-bold text-gray-900">처리할 것</p>
          </div>

          {failed ? (
            <p className="px-3.5 py-5 text-[12px] text-gray-500 leading-relaxed">
              지금 읽지 못했습니다. 없는 게 아니라 못 읽은 것입니다.
            </p>
          ) : rows === null ? (
            <p className="px-3.5 py-5 text-[12px] text-gray-400">세는 중…</p>
          ) : rows.length === 0 ? (
            <p className="px-3.5 py-5 text-[12px] text-gray-500">처리할 신청이 없습니다.</p>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto divide-y divide-black/[0.05]">
              {rows.map((r) => (
                <li key={r.id}>
                  <a
                    href="/dashboard/admin?tab=astro-benefits"
                    className="block px-3.5 py-2.5 hover:bg-navy/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-gray-900 truncate">
                        {r.store_name || `매장 ${r.restaurant_id}`}
                      </span>
                      <span className="text-[10.5px] text-gray-400 ml-auto shrink-0">{ago(r.created_at)}</span>
                    </div>
                    <p className="text-[11.5px] text-gray-500 mt-0.5 truncate">
                      {r.field_label} · {r.after}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <a
            href="/dashboard/admin?tab=astro-benefits"
            className="block px-3.5 py-2.5 border-t border-black/[0.06] text-[12px] font-semibold text-navy hover:bg-navy/[0.05] transition-colors"
          >
            혜택 신청 전체 보기
          </a>
        </div>
      )}
    </div>
  );
}
