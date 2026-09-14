"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconBuildingStore, IconHome, IconReceipt2 } from "@tabler/icons-react";

/**
 * 사장님 패널 하단 바 — 폰에서 쓰는 길.
 *
 * 0914: 관리자 도크와 같은 결로 맞췄다(같은 아이콘 집합, 켜진 칸은 네이비).
 * 손으로 그린 SVG 를 걷어냈다 — 같은 아이콘이 두 벌 있으면 반드시 어긋난다.
 */

const NAV = [
  { base: "/dashboard/owner", label: "홈", exact: true, Icon: IconHome },
  { base: "/dashboard/owner/restaurant", label: "식당", exact: false, Icon: IconBuildingStore },
  { base: "/dashboard/owner/plan", label: "플랜", exact: false, Icon: IconReceipt2 },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const ridParam = rid ? `?rid=${rid}` : "";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-t border-black/[0.06] safe-area-pb">
      <ul className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV.map(({ base, label, exact, Icon }) => {
          const on = exact ? pathname === base : pathname.startsWith(base);
          return (
            <li key={base} className="flex-1">
              <Link
                href={`${base}${ridParam}`}
                aria-current={on ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              >
                <span className={`w-9 h-7 rounded-[9px] flex items-center justify-center transition-colors ${on ? "bg-navy text-white" : "text-gray-400"}`}>
                  <Icon size={19} stroke={1.85} aria-hidden="true" />
                </span>
                <span className={`text-[10.5px] font-semibold leading-none ${on ? "text-navy" : "text-gray-400"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
