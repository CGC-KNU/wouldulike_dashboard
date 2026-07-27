"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_BASE = [
  { base: "/dashboard/owner", label: "홈", icon: HomeIcon, exact: true },
  { base: "/dashboard/owner/restaurant", label: "식당", icon: StoreIcon, exact: false },
  { base: "/dashboard/owner/plan", label: "플랜", icon: PlanIcon, exact: false },
];

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const ridParam = rid ? `?rid=${rid}` : "";

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-pb">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_BASE.map(({ base, label, icon: Icon, exact }) => {
          const active = exact ? pathname === base : pathname.startsWith(base);
          const href = `${base}${ridParam}`;
          return (
            <Link
              key={base}
              href={href}
              className={`flex flex-col items-center gap-0.5 flex-1 py-2 ${
                active ? "text-periwinkle" : "text-gray-400"
              }`}
            >
              <Icon active={active} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StoreIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9l1-5h16l1 5"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 9h18M3 9c0 1.1-.9 2-2 2s-2-.9-2-2M21 9c0 1.1.9 2 2 2s2-.9 2-2M3 9c0 1.1.9 2 2 2s2-.9 2-2M9 9c0 1.1.9 2 2 2s2-.9 2-2M15 9c0 1.1.9 2 2 2s2-.9 2-2"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinecap="round"
      />
      <path
        d="M5 11v8a1 1 0 001 1h12a1 1 0 001-1v-8"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinecap="round"
      />
      <rect x="9" y="14" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} />
    </svg>
  );
}

function PlanIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} />
      <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" />
    </svg>
  );
}
