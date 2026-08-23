"use client";

import { useCallback, useEffect, useState } from "react";

import { CommentItem, REACTION_EMOJIS } from "./types";

/**
 * 콘텐츠 상세 · 발행 후 게시물 상세에서 재사용하는 댓글 스레드 (설계서 §16-6).
 *
 * draft 상태 콘텐츠는 부모(PlanEditor)에서 아예 이 컴포넌트를 렌더링하지 않는 걸로
 * 접근을 막는다 — 서버도 동일한 규칙(§07-2)으로 이중 방어한다.
 *
 * 이모지 반응 · 수정("수정됨" 표기) · 삭제 · 대댓글은 2026-08-23 RD 요청으로 추가.
 * 서버가 내려주는 flat 목록(parent_id 포함)을 여기서 1단계 트리로 묶어서 그린다 —
 * 대댓글에는 또 대댓글을 못 달게 백엔드가 막아두므로 깊이는 항상 최대 2단.
 */
export default function CommentThread({ planId }: { planId: number }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const [replyOpenId, setReplyOpenId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [pickerOpenId, setPickerOpenId] = useState<number | null>(null);

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

  function replaceComment(updated: CommentItem) {
    setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

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

  async function postReply(parentId: number) {
    const body = replyDraft.trim();
    if (!body) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parent_id: parentId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "답글 등록에 실패했습니다.");
        return;
      }
      setComments((prev) => [...prev, d]);
      setReplyDraft("");
      setReplyOpenId(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setReplying(false);
    }
  }

  async function saveEdit(id: number) {
    const body = editDraft.trim();
    if (!body) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/satellite/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "수정에 실패했습니다.");
        return;
      }
      replaceComment(d);
      setEditingId(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/satellite/comments/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        alert(d.detail ?? "삭제에 실패했습니다.");
        return;
      }
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_deleted: true, body: "" } : c))
      );
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function toggleReaction(id: number, emoji: string) {
    setPickerOpenId(null); // 팔레트에서 골랐으면 바로 닫는다
    try {
      const res = await fetch(`/api/satellite/comments/${id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "반응 처리에 실패했습니다.");
        return;
      }
      replaceComment(d);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const topLevel = comments.filter((c) => c.parent_id === null);
  const repliesByParent = new Map<number, CommentItem[]>();
  comments.forEach((c) => {
    if (c.parent_id == null) return;
    const arr = repliesByParent.get(c.parent_id) ?? [];
    arr.push(c);
    repliesByParent.set(c.parent_id, arr);
  });

  const visibleCount = comments.filter((c) => !c.is_deleted).length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-800">댓글</h3>
        <span className="text-[11px] text-gray-400">{visibleCount}개</span>
      </div>

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-2">
          <p className="text-[11px] text-red-600">{err}</p>
        </div>
      )}

      {loading && comments.length === 0 ? (
        <p className="text-[11px] text-gray-300 text-center py-3">불러오는 중...</p>
      ) : topLevel.length === 0 ? (
        <p className="text-[11px] text-gray-300 text-center py-3">아직 댓글이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2.5 mb-3 max-h-96 overflow-y-auto">
          {topLevel.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <CommentRow
                c={c}
                editing={editingId === c.id}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onStartEdit={() => {
                  setEditingId(c.id);
                  setEditDraft(c.body);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => saveEdit(c.id)}
                saving={saving}
                onDelete={() => remove(c.id)}
                onToggleReaction={(emoji) => toggleReaction(c.id, emoji)}
                pickerOpen={pickerOpenId === c.id}
                onTogglePicker={() => setPickerOpenId((prev) => (prev === c.id ? null : c.id))}
                onToggleReply={() => {
                  setReplyOpenId((prev) => (prev === c.id ? null : c.id));
                  setReplyDraft("");
                }}
                replyOpen={replyOpenId === c.id}
              />

              {replyOpenId === c.id && (
                <div className="flex gap-2 pl-6">
                  <textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="답글을 남겨주세요"
                    rows={2}
                    autoFocus
                    className="flex-1 text-xs text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-periwinkle resize-none"
                  />
                  <button
                    onClick={() => postReply(c.id)}
                    disabled={replying || !replyDraft.trim()}
                    className="px-3 text-[11px] font-semibold text-white bg-navy rounded-xl hover:bg-periwinkle disabled:opacity-40 transition-colors shrink-0"
                  >
                    등록
                  </button>
                </div>
              )}

              {(repliesByParent.get(c.id) ?? []).map((r) => (
                <div key={r.id} className="pl-6 border-l-2 border-gray-100 ml-1.5">
                  <CommentRow
                    c={r}
                    editing={editingId === r.id}
                    editDraft={editDraft}
                    onEditDraftChange={setEditDraft}
                    onStartEdit={() => {
                      setEditingId(r.id);
                      setEditDraft(r.body);
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(r.id)}
                    saving={saving}
                    onDelete={() => remove(r.id)}
                    onToggleReaction={(emoji) => toggleReaction(r.id, emoji)}
                    pickerOpen={pickerOpenId === r.id}
                    onTogglePicker={() => setPickerOpenId((prev) => (prev === r.id ? null : r.id))}
                  />
                </div>
              ))}
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

/** 댓글/답글 한 줄 — 본문(또는 편집창)·반응 배지·액션 버튼을 함께 그린다. */
function CommentRow({
  c,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  saving,
  onDelete,
  onToggleReaction,
  pickerOpen,
  onTogglePicker,
  onToggleReply,
  replyOpen,
}: {
  c: CommentItem;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  saving: boolean;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onToggleReply?: () => void;
  replyOpen?: boolean;
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[11px] font-bold text-gray-700">{c.author_name}</span>
        {c.card_anchor != null && (
          <span className="text-[10px] text-periwinkle bg-periwinkle/10 rounded-full px-1.5">
            {c.card_anchor + 1}번째 장
          </span>
        )}
        {c.edited_at && !c.is_deleted && (
          <span className="text-[10px] text-gray-300">(수정됨)</span>
        )}
        <span className="text-[10px] text-gray-300 ml-auto">{fmtDateTime(c.created_at)}</span>
      </div>

      {c.is_deleted ? (
        <p className="text-xs text-gray-300 italic">삭제된 댓글입니다.</p>
      ) : editing ? (
        <div className="flex flex-col gap-1.5 mt-1">
          <textarea
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            rows={2}
            autoFocus
            className="text-xs text-gray-700 border border-periwinkle/40 rounded-lg px-2.5 py-1.5 focus:outline-none resize-none bg-white"
          />
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={onCancelEdit}
              className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              취소
            </button>
            <button
              onClick={onSaveEdit}
              disabled={saving || !editDraft.trim()}
              className="text-[10px] font-semibold text-white bg-navy rounded-md px-2.5 py-1 hover:bg-periwinkle disabled:opacity-40"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{c.body}</p>
      )}

      {!c.is_deleted && !editing && (
        <div className="flex items-center flex-wrap gap-1 mt-1.5">
          {/* 이미 하나라도 반응이 붙은 이모지만 알약 배지로 상시 노출 — 눌러서 토글 */}
          {c.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onToggleReaction(r.emoji)}
              title="공감 취소/추가"
              className={`text-[11px] leading-none rounded-full px-1.5 py-1 border transition-colors ${
                r.reacted_by_me
                  ? "bg-periwinkle/10 border-periwinkle/40"
                  : "bg-white border-gray-100 hover:border-gray-200"
              }`}
            >
              {r.emoji}
              <span className={`ml-0.5 text-[9px] font-semibold ${r.reacted_by_me ? "text-periwinkle" : "text-gray-400"}`}>
                {r.count}
              </span>
            </button>
          ))}

          {/* "+" 버튼을 누르면 이모지 팔레트가 팝업으로 뜨고, 거기서 골라야 반응이 붙는다. */}
          <div className="relative">
            <button
              onClick={onTogglePicker}
              title="이모지로 공감하기"
              aria-expanded={pickerOpen}
              className={`text-[11px] leading-none rounded-full w-6 h-6 flex items-center justify-center border transition-colors ${
                pickerOpen
                  ? "bg-periwinkle/10 border-periwinkle/40 text-periwinkle"
                  : "bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
            {pickerOpen && (
              <div className="absolute z-10 top-full left-0 mt-1 flex gap-0.5 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onToggleReaction(emoji)}
                    title={emoji}
                    className="text-base leading-none rounded-lg w-7 h-7 flex items-center justify-center hover:bg-periwinkle/10 hover:scale-110 transition-all"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="ml-auto flex items-center gap-2.5">
            {onToggleReply && (
              <button
                onClick={onToggleReply}
                className={`text-[10px] font-semibold ${
                  replyOpen ? "text-periwinkle" : "text-gray-400 hover:text-periwinkle"
                }`}
              >
                답글
              </button>
            )}
            {c.can_edit && (
              <button onClick={onStartEdit} className="text-[10px] font-semibold text-gray-400 hover:text-periwinkle">
                수정
              </button>
            )}
            {c.can_delete && (
              <button onClick={onDelete} className="text-[10px] font-semibold text-gray-400 hover:text-red-500">
                삭제
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
