"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * 파트너 뷰 상단 바 — **우리가 파트너 눈으로 보고 있을 때만** 뜬다 (민열님 0925 디자인 통일).
 *
 * ## 왜 다시 그렸나
 * 관리자 화면 머리는 공들여 만들어 뒀는데, 파트너 뷰로 넘어오면 갑자기 얇은 띠 하나가 떴다.
 * 높이도 글자 크기도 알약 모양도 다 달라서, 전환하는 순간 **다른 제품에 들어온 것처럼** 보였다.
 * 같은 도구의 두 화면이면 머리도 같은 뼈대여야 한다.
 *
 * 그래서 `AdminHeader` 와 **같은 부품**을 쓴다 — 같은 높이(h-14), 같은 남색 위에 흐림,
 * 같은 마크, 같은 알약 전환기. 다른 건 내용뿐이다.
 *
 * ## 사장님은 이 바를 보지 않는다
 * `layout.tsx` 가 관리자 토큰일 때만 그린다. 진짜 사장님 화면에는 머리가 없고 내용이 바로 온다 —
 * 폰에서 보는 화면이라 세로 한 줄이 아깝고, 자기 가게 이름은 첫 화면이 이미 크게 말해 준다.
 *
 * ## 매장 이름을 여기 적는 이유
 * 전에는 지금 어느 매장을 보고 있는지가 화면 **내용 안**에만 있었다. 매장을 갈아 가며 볼 때
 * 머리를 보면 알 수 있어야 한다. 이름은 `?rid` 가 있을 때만, 한 번만 읽는다.
 */
export default function AdminViewBanner() {
  const rid = useSearchParams().get("rid");
  const [store, setStore] = useState<string | null>(null);

  useEffect(() => {
    if (!rid) { setStore(null); return; }
    let live = true;
    fetch(`/api/dashboard/restaurant?rid=${rid}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setStore((d?.name as string) || null); })
      .catch(() => { if (live) setStore(null); });
    return () => { live = false; };
  }, [rid]);

  return (
    <header className="sticky top-0 z-40 h-14 bg-[#050072]/95 backdrop-blur-xl text-white border-b border-white/10 flex items-center gap-3 px-4">
      <img
        src="/satellite/satellite_app.svg" alt="" width={26} height={26} aria-hidden="true"
        className="w-[26px] h-[26px] rounded-[8px] shrink-0 ring-1 ring-white/25"
      />
      <span className="text-[15px] font-bold tracking-[-0.01em] shrink-0">파트너 뷰</span>
      <span className="hidden sm:inline text-[12px] font-medium text-white/45 shrink-0">
        사장님에게 보이는 화면입니다
      </span>

      {store && (
        <>
          <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-white/15" />
          <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-white/20 text-white truncate max-w-[9rem]">
            {store}
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {/* 관리자 화면 머리의 전환기와 **같은 부품**이다. 둘을 오갈 때 같은 자리에서 같은 모양으로 움직인다. */}
        <div className="inline-flex items-center p-[3px] rounded-full bg-white/10" role="group" aria-label="보기 전환">
          <span
            aria-current="page" title="파트너 화면"
            className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-white text-navy shadow-sm whitespace-nowrap"
          >
            파트너
          </span>
          <a
            href="/dashboard/admin"
            className="px-2.5 py-1 rounded-full text-[12px] font-semibold text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            관리자
          </a>
        </div>

        {rid && (
          <a
            href="/dashboard/owner"
            title="다른 매장으로 보기"
            className="hidden sm:inline-flex items-center h-8 px-2.5 rounded-lg text-[12px] font-semibold text-white/55 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            매장 바꾸기
          </a>
        )}
      </div>
    </header>
  );
}
