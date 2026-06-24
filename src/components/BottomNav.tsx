"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "홈", icon: HomeIcon },
  { href: "/dashboard/analytics", label: "분석", icon: ChartIcon },
  { href: "/dashboard/coupons", label: "쿠폰", icon: CouponIcon },
  { href: "/dashboard/store", label: "가게", icon: StoreIcon },
  { href: "/dashboard/plan", label: "플랜", icon: PlanIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-pb">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 flex-1 py-2 ${
                active ? "text-periwinkle" : "text-gray-400"
              }`}
            >
              <Icon active={active} />
              <span className="text-[10px] font-medium">{label}</span>
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

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20V14M9 20V8M14 20V12M19 20V4"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function CouponIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect
        x="2"
        y="6"
        width="20"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
      />
      <path
        d="M15 6V18M15 10H18M15 14H18"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StoreIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9H21L19 4H5L3 9ZM3 9V20H21V9"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinejoin="round"
      />
      <rect
        x="9"
        y="13"
        width="6"
        height="7"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
      />
    </svg>
  );
}

function PlanIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}
