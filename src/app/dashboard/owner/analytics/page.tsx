"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconChartBar, IconLock } from "@tabler/icons-react";

/**
 * 통계 — **잠금** (민열님 0924).
 *
 * 여기 있던 화면은 막대 그래프를 그렸는데, 숫자가 전부 코드에 박아 둔 가짜였다.
 * 사장님이 그걸 우리 가게 숫자로 읽는다. 없는 화면보다 **틀린 숫자를 보여 주는 화면이 훨씬 나쁘다.**
 *
 * 하단 바에도 없는 길이라 평소엔 보이지 않는다. 그래도 주소를 아는 사람은 들어올 수 있어서,
 * 빈 페이지 대신 "아직 준비 중이고, 진짜 숫자는 리포트에 있다"고 말해 준다.
 * 실측 숫자가 붙는 날 이 파일을 되살린다.
 */
export default function AnalyticsLocked() {
  const rid = useSearchParams().get("rid");
  const q = rid ? `?rid=${rid}` : "";

  return (
    <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-navy mb-5">통계</h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-gray-100 items-center justify-center mb-3">
          <IconLock size={22} className="text-gray-400" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-gray-800">아직 준비 중입니다</p>
        <p className="text-[12.5px] text-gray-500 mt-1.5 leading-relaxed">
          쿠폰·스탬프·재방문을 실제로 센 숫자가 붙는 대로 엽니다.
          지어낸 숫자를 보여 드릴 수는 없어 잠가 두었습니다.
        </p>

        <Link
          href={`/dashboard/owner/reports${q}`}
          className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-xl bg-navy text-white text-[13px] font-semibold active:scale-[0.98] transition-transform"
        >
          <IconChartBar size={15} aria-hidden="true" />
          월간 리포트 보기
        </Link>
      </div>
    </div>
  );
}
