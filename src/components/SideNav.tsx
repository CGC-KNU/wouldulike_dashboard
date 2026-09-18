"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconBuildingStore, IconFileDescription, IconGift, IconHome, IconPhoto, IconReceipt2, IconChevronRight, IconDeviceMobile } from "@tabler/icons-react";
import { useViewMode } from "@/contexts/ViewModeContext";

/**
 * 파트너 패널 사이드바.
 *
 * 0914: 관리자 쪽 `ToolShell` 과 **같은 언어로** 맞췄다 — 흰 카드, 같은 모서리(18px),
 * 같은 그림자, 같은 아이콘 집합(@tabler). 예전에는 진한 네이비 레일에 손으로 그린 SVG 였다.
 *
 * 두 화면을 같은 사람이 오간다(관리자는 '파트너 뷰'로 넘어온다). 화면 언어가 다르면
 * 넘어올 때마다 다른 제품처럼 읽히고, 점주에게 보여 줄 때도 급조한 티가 난다.
 */

/** 0919 민열님: 홈·매장·혜택·콘텐츠·리포트·플랜 여섯 — 폰 하단 바와 같은 순서. */
const NAV = [
  { base: "/dashboard/owner", label: "홈", exact: true, Icon: IconHome, q: "" },
  { base: "/dashboard/owner/restaurant", label: "매장 정보", exact: true, Icon: IconBuildingStore, q: "" },
  { base: "/dashboard/owner/restaurant", label: "혜택 (쿠폰·스탬프)", exact: true, Icon: IconGift, q: "tab=coupon" },
  { base: "/dashboard/owner/content", label: "콘텐츠", exact: false, Icon: IconPhoto, q: "" },
  { base: "/dashboard/owner/reports", label: "리포트", exact: false, Icon: IconFileDescription, q: "" },
  { base: "/dashboard/owner/plan", label: "플랜", exact: false, Icon: IconReceipt2, q: "" },
] as const;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

export default function SideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const tab = searchParams.get("tab") ?? "";
  // 매장·혜택은 같은 주소에 탭만 다르다 — 켜진 칸을 tab 으로 가른다
  const withQ = (base: string, q: string) => { const parts = [q, rid ? `rid=${rid}` : ""].filter(Boolean); return parts.length ? `${base}?${parts.join("&")}` : base; };
  const { toggle } = useViewMode();

  return (
    <aside className="fixed left-0 top-0 h-full w-56 p-3 z-40">
      <div className="h-full flex flex-col bg-white/75 backdrop-blur-xl rounded-[18px] border border-white/60 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-28px_rgba(5,0,114,0.35)] overflow-hidden">
        <div className="px-3 pt-3 pb-2.5 border-b border-black/[0.05] flex items-center gap-2">
          <img src="/satellite/satellite_app.svg" alt="" width={30} height={30} className="w-[30px] h-[30px] rounded-[9px] shrink-0 ring-1 ring-black/[0.06]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[14px] font-bold text-gray-900 leading-tight tracking-[-0.01em]">우주라이크</span>
            <span className="block text-[11px] text-gray-500 leading-tight">파트너 패널</span>
          </span>
        </div>

        <nav className="flex-1 p-2">
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ base, label, exact, Icon, q }) => {
              const here = exact ? pathname === base : pathname.startsWith(base);
              const on = here && (q ? tab === "coupon" : tab !== "coupon");
              return (
                <li key={label}>
                  <Link
                    href={withQ(base, q)}
                    aria-current={on ? "page" : undefined}
                    className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150 ${focusRing} ${
                      on
                        ? "bg-[linear-gradient(180deg,#1512a3,#050072)] text-white shadow-[0_6px_16px_-8px_rgba(5,0,114,0.7)]"
                        : "text-gray-600 hover:bg-navy/[0.05] hover:text-gray-900"
                    }`}
                  >
                    <Icon size={18} stroke={1.75} className={on ? "text-white/90" : "text-gray-400"} aria-hidden="true" />
                    {label}
                    {on && <IconChevronRight size={14} className="ml-auto text-white/60" aria-hidden="true" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-2 border-t border-black/[0.05]">
          <button
            type="button"
            onClick={toggle}
            className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold text-gray-500 hover:bg-navy/[0.05] hover:text-gray-800 ${focusRing}`}
          >
            <IconDeviceMobile size={17} stroke={1.75} className="text-gray-400" aria-hidden="true" />
            모바일 뷰로 보기
          </button>
        </div>
      </div>
    </aside>
  );
}
