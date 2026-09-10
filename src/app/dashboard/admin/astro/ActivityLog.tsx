"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, ActivityKind } from "@/lib/draft/types";
import { agoLabel } from "../_shared/ui";

/**
 * 활동 기록기 — ADIT Pitchr 리드 상세에서 가져온 유일하게 중요한 UI 습관.
 *
 * **입력기가 항상 펼쳐져 있다.** "기록 추가" 버튼을 누른 뒤에 입력하게 만들면 아무도 안 쓴다.
 * 제휴 매장 소통이 전부 카톡이라 자동 수집이 불가능하다는 걸 2026-09-09 에 확인했으므로,
 * 자동화 대신 **수기 입력의 마찰을 0에 가깝게** 만드는 쪽이 현실적인 답이다.
 *
 * 종류(메모/전화/카톡/미팅/방문)를 고정 enum 으로 둔 것도 의도다 — 자유 텍스트로 흘리면
 * 나중에 "이 매장 몇 번 방문했지"를 셀 수 없다.
 */

const KINDS: ActivityKind[] = ["메모", "전화", "카톡", "미팅", "방문"];

const KIND_TONE: Record<ActivityKind, string> = {
  메모: "bg-gray-100 text-gray-600",
  전화: "bg-blue-50 text-blue-700",
  카톡: "bg-amber-100 text-amber-700",
  미팅: "bg-indigo-100 text-indigo-700",
  방문: "bg-emerald-50 text-emerald-700",
};

export default function ActivityLog({
  targetType,
  targetId,
  actor,
  onLogged,
}: {
  targetType: "lead" | "store";
  targetId: string;
  actor: string;
  onLogged?: () => void;
}) {
  const [items, setItems] = useState<Activity[]>([]);
  const [kind, setKind] = useState<ActivityKind>("메모");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/astro/activities?target_type=${targetType}&target_id=${targetId}`)
      .then((r) => r.json())
      .then((d) => setItems(d.activities ?? []))
      .catch(() => setItems([]));
  }, [targetType, targetId]);

  useEffect(load, [load]);

  async function submit() {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/astro/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, kind, body: text, author: actor }),
      });
      if (res.ok) {
        setBody("");
        load();
        onLogged?.();
      }
    } catch {
      // 입력은 남겨 둔다 — 다시 누르면 된다
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 bg-white rounded-xl p-3">
      <p className="text-[10px] font-semibold text-gray-400 mb-2">기록</p>

      {/* 입력기 — 항상 펼쳐져 있다 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
              kind === k ? KIND_TONE[k] : "bg-white text-gray-400 border border-gray-200 hover:border-periwinkle"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder="한 줄로 — 예: 사장님 통화, 다음 주 재방문 요청"
          aria-label="활동 기록"
          autoComplete="off"
          className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        />
        <button
          onClick={submit}
          disabled={!body.trim() || saving}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-3 disabled:opacity-30 hover:bg-periwinkle transition-colors"
        >
          기록
        </button>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-[11px]">
              <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${KIND_TONE[a.kind]}`}>
                {a.kind}
              </span>
              <span className="flex-1 text-gray-700 leading-relaxed">{a.body}</span>
              <span className="shrink-0 text-[10px] text-gray-400">
                {a.author} · {agoLabel(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
