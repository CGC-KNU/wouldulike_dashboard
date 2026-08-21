"use client";

import { useCallback, useEffect, useState } from "react";

import { CommentItem } from "./types";

/**
 * 콘텐츠 상세 · 발행 후 게시물 상세에서 재사용하는 댓글 스레드 (설계서 §16-6).
 *
 * draft 상태 콘텐츠는 부모(PlanEditor)에서 아예 이 컴포넌트를 렌더링하지 않는 걸로
 * 접근을 막는다 — 서버도 동일한 규칙(§07-2)으로 이중 방어한다.
 */
export default function CommentThread({ planId }: { planId: number }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/comments`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail ?? `불러오지 못했습니다 (${res.status})`);
      } else {
        setComments(d.comments ?? []);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "댓글 등록에 실패했습니다.");
        return;
      }
      setComments((prev) => [...prev, d]);
      setDraft("");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-800">댓글</h3>
        <span className="text-[11px] text-gray-400">{comments.length}개</span>
      </div>

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-2">
          <p className="text-[11px] text-red-600">{err}</p>
        </div>
      )}

      {loading && comments.length === 0 ? (
        <p className="text-[11px] text-gray-300 text-center py-3">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-gray-300 text-center py-3">아직 댓글이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2.5 mb-3 max-h-72 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-bold text-gray-700">{c.author_name}</span>
                {c.card_anchor != null && (
                  <span className="text-[10px] text-periwinkle bg-periwinkle/10 rounded-full px-1.5">
                    {c.card_anchor + 1}번째 장
                  </span>
                )}
                <span className="text-[10px] text-gray-300 ml-auto">{fmtDateTime(c.created_at)}</span>
              </div>
              <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="피드백을 남겨주세요"
          rows={2}
          className="flex-1 text-xs text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-periwinkle resize-none"
        />
        <button
          onClick={post}
          disabled={posting || !draft.trim()}
          className="px-3 text-[11px] font-semibold text-white bg-navy rounded-xl hover:bg-periwinkle disabled:opacity-40 transition-colors"
        >
          등록
        </button>
      </div>
    </section>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
