"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconBuildingStore, IconFileDescription, IconGift, IconHome, IconPhoto, IconReceipt2 } from "@tabler/icons-react";

/**
 * 파트너 패널 하단 바 — 폰에서 쓰는 길.
 *
 * 0914: 관리자 도크와 같은 결로 맞췄다(같은 아이콘 집합, 켜진 칸은 네이비).
 * 손으로 그린 SVG 를 걷어냈다 — 같은 아이콘이 두 벌 있으면 반드시 어긋난다.
 */

/** 0919 민열님: 홈·매장·혜택·콘텐츠·리포트·플랜 여섯. 첫 화면은 폼이 아니라 숫자다. */
const NAV = [
  { base: "/dashboard/owner", label: "홈", exact: true, Icon: IconHome, q: "" },
  { base: "/dashboard/owner/restaurant", label: "매장", exact: true, Icon: IconBuildingStore, q: "" },
  { base: "/dashboard/owner/restaurant", label: "혜택", exact: true, Icon: IconGift, q: "tab=coupon" },
  { base: "/dashboard/owner/content", label: "콘텐츠", exact: false, Icon: IconPhoto, q: "" },
  { base: "/dashboard/owner/reports", label: "리포트", exact: false, Icon: IconFileDescription, q: "" },
  { base: "/dashboard/owner/plan", label: "플랜", exact: false, Icon: IconReceipt2, q: "" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const tab = searchParams.get("tab") ?? "";
  const withQ = (base: string, q: string) => {
    const parts = [q, rid ? `rid=${rid}` : ""].filter(Boolean);
    return parts.length ? `${base}?${parts.join("&")}` : base;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-t border-black/[0.06] safe-area-pb">
      <ul className="flex items-center justify-around h-16 max-w-xl mx-auto px-1">
        {NAV.map(({ base, label, exact, Icon, q }) => {
          // 매장·혜택은 같은 주소에 탭만 다르다 — 켜진 칸을 tab 으로 가른다
          const here = exact ? pathname === base : pathname.startsWith(base);
          const on = here && (q ? tab === "coupon" : tab !== "coupon");
          return (
            <li key={label} className="flex-1">
              <Link
                href={withQ(base, q)}
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
