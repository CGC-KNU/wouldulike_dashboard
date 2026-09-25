"use client";

import { useEffect } from "react";

/**
 * 파트너 화면이 터졌을 때 사장님이 보는 것 (0924).
 *
 * ## 왜 필요한가
 * 이 경계가 없어서 페이지마다 실패 문구를 제각각 지어냈고, 대부분은 **못 읽은 것을
 * "없는 것"으로 바꿔 말했다.** 리포트 탭은 서버 오류를 "계약 시작일이 아직 안 적혀 있다"로
 * 바꿔 말해, 사장님을 없는 문제로 담당자에게 전화하게 만들기까지 했다.
 *
 * ## 무엇을 말하고 무엇을 말하지 않나
 * - 사장님이 **지금 할 수 있는 일**을 말한다: 다시 열기, 그래도 안 되면 연락.
 * - **손님 쪽은 멀쩡하다는 것**을 말한다. 이 화면이 안 열리는 것과 손님이 쿠폰을 못 받는 것은
 *   전혀 다른 일인데, 사장님은 그걸 구분할 방법이 없어 최악을 상상한다.
 * - 오류 원문은 말하지 않는다. 뜻을 모르는 영어 한 줄은 "고장났다"로만 읽힌다.
 *   대신 브라우저 콘솔에는 남겨 둔다 — 우리가 물어볼 때 캡처 한 장으로 끝나게.
 */
export default function OwnerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[owner]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <p className="text-[15px] font-bold text-gray-900">화면을 여는 데 실패했습니다</p>
      <p className="text-[12.5px] text-gray-500 mt-2 leading-relaxed max-w-[30ch]">
        잠깐 문제가 생겼습니다. <b className="text-gray-700">손님께 나가는 쿠폰과 스탬프는 그대로 돌아갑니다.</b>
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-5 h-10 px-5 rounded-xl bg-navy text-white text-[13.5px] font-semibold active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
      >
        다시 열기
      </button>

      <p className="text-[11.5px] text-gray-400 mt-4">
        계속 안 되면 <a href="mailto:hello@wouldulike.kr" className="text-navy font-semibold">hello@wouldulike.kr</a> 로 알려 주세요
        {error.digest ? <span className="block mt-0.5 text-gray-300 tabular-nums">확인 번호 {error.digest}</span> : null}
      </p>
    </div>
  );
}
