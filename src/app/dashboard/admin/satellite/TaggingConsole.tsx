"use client";

import { useCallback, useEffect, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import { SatelliteMember, TaggingPost } from "./types";

/**
 * 태깅 콘솔 (설계서 §05-3 · §11 IA) — 리드 전용.
 *
 * 담당자 미지정 게시물(과거 백필 건 + 웹을 거치지 않은 외부 발행 건)에 담당자를
 * 지정하는 유일한 화면. 이게 없으면 수집기가 잡은 외부 발행 건이 어디에도 안 보인다.
 */
interface Props {
  onClose: () => void;
  embedded?: boolean;
}

export default function TaggingConsole({ onClose, embedded = false }: Props) {
  const [posts, setPosts] = useState<TaggingPost[]>([]);
  const [members, setMembers] = useState<SatelliteMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [queueRes, membersRes] = await Promise.all([
        fetch("/api/satellite/tagging-queue"),
        fetch("/api/satellite/members"),
      ]);
      const queueData = await queueRes.json().catch(() => ({}));
      const membersData = await membersRes.json().catch(() => []);
      if (!queueRes.ok) {
        setErr(queueData.detail ?? `불러오지 못했습니다 (${queueRes.status})`);
      } else {
        setPosts(queueData.posts ?? []);
      }
      if (membersRes.ok) setMembers(membersData ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(postId: number) {
    const memberId = picked[postId];
    if (!memberId) return;
    setBusyId(postId);
    try {
      const res = await fetch(`/api/satellite/posts/${postId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: Number(memberId) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "담당자 지정에 실패했습니다.");
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const body = (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-gray-800">태깅 콘솔</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            담당자 미지정 게시물 {posts.length}건 — 과거 백필 · 웹을 거치지 않은 발행
          </p>
        </div>
        {!embedded && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-3">
              <p className="text-[11px] text-red-600">{err}</p>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-gray-300 text-center py-8">불러오는 중...</p>
          ) : posts.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-8">미지정 게시물이 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {posts.map((p) => (
                <div key={p.id} className="rounded-xl border border-gray-100 px-3 py-2.5 flex items-center gap-3">
                  {p.thumb_url ? (
                    <PreviewableImg src={p.thumb_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 bg-gray-100" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-gray-400">{fmtDate(p.posted_at)}</span>
                      <span className="text-[10px] text-periwinkle bg-periwinkle/10 rounded-full px-1.5">
                        {p.format_label}
                      </span>
                      <span className="text-[10px] text-amber-600 bg-amber-50 rounded-full px-1.5">
                        {p.source_label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 truncate">{p.caption || "(캡션 없음)"}</p>
                    {p.permalink && (
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-gray-400 hover:text-periwinkle underline"
                      >
                        게시물 보기
                      </a>
                    )}
                  </div>
                  <select
                    value={picked[p.id] ?? ""}
                    onChange={(e) => setPicked((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="shrink-0 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
                  >
                    <option value="">담당자 선택</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => assign(p.id)}
                    disabled={!picked[p.id] || busyId === p.id}
                    className="shrink-0 text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle disabled:opacity-40 transition-colors"
                  >
                    {busyId === p.id ? "처리 중..." : "지정"}
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-xl">
        {body}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
