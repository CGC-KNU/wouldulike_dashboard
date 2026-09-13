"use client";

import { useCallback, useEffect, useState } from "react";
import { IconMessage, IconPhone, IconBrandMessenger, IconUsers, IconMapPin } from "@tabler/icons-react";
import type { Activity, ActivityKind } from "@/lib/draft/types";
import { Button, Textarea, agoLabel, focusRing } from "../_shared/ui";

/**
 * 활동 기록기. Pitchr 리드 상세에서 가장 잘 만든 부분을 그대로 가져왔다.
 *
 * **입력기가 항상 펼쳐져 있다.** "기록 추가" 버튼을 누른 뒤 입력하게 하면 아무도 안 쓴다.
 * 종류(메모/전화/카톡/미팅/방문)는 탭이고, 본문은 한 줄이면 Enter, 길면 Shift+Enter 로 줄바꿈.
 * 제휴 매장 소통이 전부 카톡이라 자동 수집이 안 되므로(2026-09-09 확인), 수기 입력의 마찰을 0 으로 만드는 게 답이다.
 */

const KINDS: { key: ActivityKind; Icon: typeof IconMessage }[] = [
  { key: "메모", Icon: IconMessage },
  { key: "전화", Icon: IconPhone },
  { key: "카톡", Icon: IconBrandMessenger },
  { key: "미팅", Icon: IconUsers },
  { key: "방문", Icon: IconMapPin },
];

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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await fetch("/api/astro/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, kind, body: text, author: actor }),
      });
      if (!res.ok) {
        setError("기록하지 못했습니다. 다시 눌러 주세요.");
        return;
      }
      setBody("");
      load();
      onLogged?.();
    } catch {
      setError("서버에 연결하지 못했습니다. 입력한 내용은 그대로 남겨 두었습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200">
      {/* 종류 탭 */}
      <div className="flex gap-1 p-2 border-b border-gray-100 overflow-x-auto" role="tablist" aria-label="기록 종류">
        {KINDS.map(({ key, Icon }) => {
          const on = kind === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setKind(key)}
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${focusRing} ${
                on ? "bg-navy text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={14} stroke={2} aria-hidden="true" />
              {key}
            </button>
          );
        })}
      </div>

      <div className="p-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`${kind} 내용 · 예: 사장님 통화, 다음 주 재방문 요청`}
          aria-label={`${kind} 내용`}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px] text-gray-400">Enter 로 기록 · Shift+Enter 줄바꿈</span>
          <Button size="sm" variant="primary" onClick={submit} disabled={!body.trim() || saving}>
            {saving ? "기록 중…" : "기록"}
          </Button>
        </div>
        {error && (
          <p className="text-[12px] text-red-600 mt-1.5" role="alert">
            {error}
          </p>
        )}
      </div>

      {items.length > 0 && (
        <ol className="border-t border-gray-100 divide-y divide-gray-100">
          {items.slice(0, 10).map((a) => {
            const meta = KINDS.find((k) => k.key === a.kind);
            const Icon = meta?.Icon ?? IconMessage;
            return (
              <li key={a.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <Icon size={15} stroke={1.75} className="text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-gray-800 leading-relaxed break-words">{a.body}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {a.kind} · {a.author} · {agoLabel(a.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
