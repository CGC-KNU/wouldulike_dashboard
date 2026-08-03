"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useViewMode } from "@/contexts/ViewModeContext";

const NAV_ITEMS = [
  { base: "/dashboard/owner", label: "홈", exact: true, icon: HomeIcon },
  { base: "/dashboard/owner/restaurant", label: "식당 정보", exact: false, icon: StoreIcon },
  { base: "/dashboard/owner/plan", label: "플랜", exact: false, icon: PlanIcon },
] as const;

export default function SideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const ridParam = rid ? `?rid=${rid}` : "";
  const { toggle } = useViewMode();

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-navy flex flex-col z-40 shadow-xl">
      {/* 브랜드 */}
      <div className="px-5 pt-7 pb-5 border-b border-white/8">
        <p className="text-[10px] text-periwinkle/60 font-semibold uppercase tracking-widest mb-1">사장님 패널</p>
        <p className="text-white font-bold text-lg leading-tight">우주라이크</p>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 pt-4 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ base, label, exact, icon: Icon }) => {
          const active = exact ? pathname === base : pathname.startsWith(base);
          const href = `${base}${ridParam}`;
          return (
            <Link
              key={base}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-periwinkle/20 text-white"
                  : "text-white/45 hover:text-white/80 hover:bg-white/6"
              }`}
            >
              <Icon active={active} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 뷰 전환 버튼 */}
      <div className="px-3 pb-7 pt-2 border-t border-white/8">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 text-xs font-medium transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <line x1="12" y1="18" x2="12" y2="18.01"/>
          </svg>
          모바일 뷰
        </button>
      </div>
    </aside>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
        stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinejoin="round" />
    </svg>
  );
}

function StoreIcon({ active }: { active: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M3 9l1-5h16l1 5" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M5 11v8a1 1 0 001 1h12a1 1 0 001-1v-8"
        stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" />
      <rect x="9" y="14" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
    </svg>
  );
}

function PlanIcon({ active }: { active: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" />
    </svg>
  );
}
