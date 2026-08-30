"use client";

import { useState } from "react";

import { ContentPlan, fmtMD } from "./types";

/**
 * 삭제 2차 확인 모달 — 실수로 한 번 눌러서 지워지는 사고를 막기 위해
 * 클릭 한 번짜리 브라우저 confirm() 대신 두 단계를 거치게 한다.
 * 실제로는 소프트 삭제라 설정 → "삭제된 매거진 주제"에서 복구할 수 있다는
 * 것도 함께 안내한다.
 *
 * (2026-08-26 — 이 파일은 원래 "매거진 주제 리스트" 표 컴포넌트였다. 콘텐츠
 * 칸반과 완전히 같은 데이터를 표로만 다시 보여주는 중복 화면이라 마케팅팀
 * 요청으로 표는 제거했고, ContentKanban이 계속 쓰는 이 모달만 남겼다.)
 */
export function DeleteConfirmModal({
  plan,
  onCancel,
  onConfirmed,
}: {
  plan: Pick<ContentPlan, "scheduled_date" | "topic" | "status">;
  onCancel: () => void;
  onConfirmed: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        {step === 1 ? (
          <>
            <h4 className="text-sm font-bold text-gray-800 mb-1.5">이 주제를 삭제할까요?</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              {fmtMD(plan.scheduled_date)} · <span className="font-medium text-gray-700">{plan.topic || "(미정)"}</span>
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={onCancel}
                className="text-xs font-medium text-gray-500 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-red-600 bg-red-50 rounded-lg px-3 py-2 hover:bg-red-100"
              >
                삭제할게요
              </button>
            </div>
          </>
        ) : (
          <>
            <h4 className="text-sm font-bold text-red-600 mb-1.5">정말 삭제할까요?</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              한 번 더 확인합니다. &ldquo;{plan.topic || "(미정)"}&rdquo;이 캘린더·주제표에서 사라집니다.
              {plan.status === "published" && (
                <>
                  <br />
                  이미 발행완료된 콘텐츠입니다 — 소프트 삭제라 지금까지 쌓인 성과 데이터는
                  그대로 남고, 이 목록에서만 사라집니다.
                </>
              )}
              <br />
              필요하면 설정 → <span className="font-medium text-gray-700">삭제된 매거진 주제</span>에서 나중에 복구할 수 있습니다.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={onCancel}
                disabled={busy}
                className="text-xs font-medium text-gray-500 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-40"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  await onConfirmed();
                }}
                disabled={busy}
                className="text-xs font-semibold text-white bg-red-500 rounded-lg px-3 py-2 hover:bg-red-600 disabled:opacity-50"
              >
                {busy ? "삭제 중..." : "네, 삭제합니다"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
