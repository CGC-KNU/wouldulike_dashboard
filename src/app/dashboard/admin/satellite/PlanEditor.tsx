"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import AudioPicker from "./AudioPicker";
import CommentThread from "./CommentThread";
import FreeformBlockEditor from "./FreeformBlockEditor";
import LocationPicker from "./LocationPicker";
import PerformancePanel from "./PerformancePanel";
import ReelCoverPicker from "./ReelCoverPicker";
import {
  AudioTrack,
  JOB_STATE_META,
  MEDIA_META,
  MediaType,
  PlanAsset,
  PlanDetail,
  STATUS_META,
  fmtMD,
} from "./types";

/** 유형별 업로드 제약 — 서버와 같은 규칙을 화면에서도 강제한다 */
const ACCEPT: Record<MediaType, string> = {
  carousel: "image/png,image/jpeg,image/webp",
  image: "image/png,image/jpeg,image/webp",
  reel: "video/mp4,video/quicktime",
};

/**
 * 에디터 — 실제로 매주 쓰는 화면 (설계서 §07-4)
 *
 * 하드 제한 3개를 여기서 강제한다. 발행 시점에 터지면 이미 마감이 지난 뒤다.
 *   · 이미지 10장  — 11장째 파일 선택 자체를 막는다
 *   · 해시태그 5개 — 입력 중 카운터로 보여주고 초과 시 저장을 거부한다
 *   · JPEG 변환    — 업로드하면 서버가 바로 변환한다. 변환 전에는 준비완료로 못 넘어간다
 */
export default function PlanEditor({
  planId,
  onClose,
  onChanged,
  initialTab = "detail",
}: {
  planId: number;
  onClose: () => void;
  onChanged: () => void;
  /** 어느 탭을 보고 있다가 열었는지에 맞춰 시작 탭을 다르게 준다 (예: 내 대시보드에서
   *  성과를 보러 들어온 경우 바로 "게시물 상세"로). 기본은 기존과 동일하게 "콘텐츠 피드백". */
  initialTab?: "detail" | "content" | "post";
}) {
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [dragId, setDragId] = useState<number | null>(null);

  // 편집 중 값 (저장 전)
  const [caption, setCaption] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [collabInput, setCollabInput] = useState("");
  const [activeTab, setActiveTab] = useState<"detail" | "content" | "post">(initialTab);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (opts?: { preserveCaption?: boolean; silent?: boolean }) => {
      // 최초 진입만 전체 로딩 스피너 — 업로드·자동저장 뒤 재조회는 화면을 유지한다.
      if (!opts?.silent) setLoading(true);
      setErr("");
      try {
        const res = await fetch(`/api/satellite/plans/${planId}/detail`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(d.detail ?? `불러오지 못했습니다 (${res.status})`);
          if (!opts?.silent) setPlan(null);
        } else {
          setPlan(d);
          // 캡션 자동저장 직후에는 서버값으로 되돌리지 않는다 — 되돌리면 그 사이 계속
          // 입력 중이던 글자와 충돌해서 한글 조합이 끊기거나 중복 입력처럼 보인다.
          if (!opts?.preserveCaption) setCaption(d.caption ?? "");
          setPublishAt(d.desired_publish_at ? toLocalInput(d.desired_publish_at) : "");
        }
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [planId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // 에디터 탭은 담당자(또는 리드)에게만 보인다 — initialTab="content" 로 열렸는데
  // 실제로는 권한이 없는 경우(예: 남의 게시물을 딥링크로 직접 열었을 때) 안전하게
  // "콘텐츠 피드백" 탭으로 되돌린다.
  useEffect(() => {
    if (plan && !plan.can_edit && activeTab === "content") {
      setActiveTab("detail");
    }
  }, [plan, activeTab]);

  /* ─── 저장 ─────────────────────────────────────── */

  async function patch(body: Record<string, unknown>, silent = false) {
    if (!silent) setSaving(true);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "저장에 실패했습니다.");
        return false;
      }
      // 자동저장(silent)마다 부모 목록까지 통째 리로드하지 않는다 — 목록에 보이는
      // 필드가 바뀌는 명시적 저장·상태 전환에서만 onChanged 를 부른다.
      if (!silent) onChanged();
      return true;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  /** 낱장 대체 텍스트(접근성) 저장 — 플랜 전체가 아니라 자산 1개 단위 */
  async function patchAsset(assetId: number, body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/satellite/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "저장에 실패했습니다.");
        return false;
      }
      return true;
    } catch (e) {
      alert((e as Error).message);
      return false;
    }
  }

  /** 캡션은 타이핑이 멈추면 자동 저장한다 — 캡션 자체는 로컬 상태가 최신이라 되돌리지
   * 않지만(preserveCaption), validation 등 나머지 필드는 저장 뒤 조용히 다시 불러와야
   * "발행 전 확인" 경고와 준비완료 버튼이 최신 상태를 반영한다. */
  function onCaptionChange(v: string) {
    setCaption(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (countHashtags(v) <= (plan?.limits.max_hashtags ?? 5)) {
        patch({ caption: v }, true).then((ok) => {
          if (ok) load({ preserveCaption: true, silent: true });
        });
      }
    }, 800);
  }

  /** 협업자 추가 — 아이디만 받고 초대·수락 절차는 인스타 쪽에서 진행된다 */
  function addCollaborator() {
    if (!plan) return;
    const uname = collabInput.trim().replace(/^@/, "");
    if (!uname) return;
    const current = plan.collaborator_usernames || [];
    if (current.includes(uname)) {
      setCollabInput("");
      return;
    }
    if (current.length >= plan.limits.max_collaborators) {
      alert(`협업자는 최대 ${plan.limits.max_collaborators}명입니다.`);
      return;
    }
    const next = [...current, uname];
    setCollabInput("");
    patch({ collaborator_usernames: next }, true).then((ok) => {
      if (ok) setPlan((p) => (p ? { ...p, collaborator_usernames: next } : p));
    });
  }

  /* ─── 업로드 ───────────────────────────────────── */

  async function handleFiles(files: FileList | null) {
    if (!files || !plan) return;
    const list = Array.from(files);

    // 릴스는 동영상 1개, 카드뉴스는 이미지 10장
    const remaining = plan.is_reel ? 1 - plan.assets.length : plan.limits.max_cards - plan.assets.length;

    if (remaining <= 0) {
      alert(
        plan.is_reel
          ? "릴스는 동영상 1개만 발행됩니다.\n기존 동영상을 삭제한 뒤 올려주세요."
          : `${plan.limits.max_cards}장까지만 발행됩니다.`
      );
      return;
    }

    if (list.length > remaining) {
      alert(
        plan.is_reel
          ? "릴스는 동영상 1개만 올립니다.\n\n첫 번째 파일만 사용합니다."
          : `${plan.limits.max_cards}장까지만 발행됩니다.\n\n` +
              `현재 ${plan.assets.length}장 · 추가 가능 ${remaining}장 · 선택 ${list.length}장\n` +
              `앞의 ${remaining}장만 올립니다.`
      );
    }

    const target = list.slice(0, remaining);
    setUploading(target.length);

    for (const file of target) {
      try {
        // 1) 업로드 URL 발급
        const pres = await fetch(`/api/satellite/plans/${planId}/assets/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content_type: file.type }),
        });
        const p = await pres.json().catch(() => ({}));
        if (!pres.ok) {
          alert(p.detail ?? "업로드 URL 발급에 실패했습니다.");
          break;
        }

        // 2) S3 직접 PUT
        const put = await fetch(p.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) {
          alert(`${file.name} 업로드에 실패했습니다. (S3 ${put.status})`);
          continue;
        }

        // 3) 등록 — 서버가 여기서 JPEG 로 변환한다
        const reg = await fetch(`/api/satellite/plans/${planId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: p.key, filename: file.name, content_type: file.type }),
        });
        const r = await reg.json().catch(() => ({}));
        if (!reg.ok) {
          alert(r.detail ?? `${file.name} 등록에 실패했습니다.`);
          continue;
        }
        // 응답이 에셋 형태면 즉시 목록에 붙인다 — 전체 detail 재조회를 기다리지 않는다.
        if (r && typeof r.id === "number") {
          setPlan((prev) =>
            prev
              ? {
                  ...prev,
                  assets: [...prev.assets, r as PlanAsset],
                  card_count: prev.assets.length + 1,
                }
              : prev
          );
        }
      } catch (e) {
        alert(`${file.name}: ${(e as Error).message}`);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }

    setUploading(0);
    if (fileInput.current) fileInput.current.value = "";
    // 변환 상태(is_ready 등) 동기화만 백그라운드 — 화면은 유지
    await load({ preserveCaption: true, silent: true });
    onChanged();
  }

  async function removeAsset(assetId: number) {
    if (!confirm("이 이미지를 삭제할까요?")) return;
    const prevAssets = plan?.assets;
    setPlan((p) =>
      p ? { ...p, assets: p.assets.filter((a) => a.id !== assetId), card_count: Math.max(0, p.assets.length - 1) } : p
    );
    const res = await fetch(`/api/satellite/assets/${assetId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      await load({ preserveCaption: true, silent: true });
      onChanged();
    } else {
      if (prevAssets) setPlan((p) => (p ? { ...p, assets: prevAssets, card_count: prevAssets.length } : p));
      const d = await res.json().catch(() => ({}));
      alert(d.detail ?? "삭제에 실패했습니다.");
    }
  }

  /* ─── 순서 변경 (드래그) ───────────────────────── */

  async function dropOn(targetId: number) {
    if (!plan || dragId == null || dragId === targetId) return;
    const ids = plan.assets.map((a) => a.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;

    ids.splice(to, 0, ...ids.splice(from, 1));
    setDragId(null);

    // 낙관적 반영 — 서버 응답을 기다리지 않고 먼저 그린다
    setPlan({ ...plan, assets: ids.map((id) => plan.assets.find((a) => a.id === id)!) });

    const res = await fetch(`/api/satellite/plans/${planId}/assets/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ids }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.detail ?? "순서 변경에 실패했습니다.");
      await load({ preserveCaption: true, silent: true });
    }
  }

  /* ─── 상태 전환 ───────────────────────────────── */

  async function toReady() {
    setSaving(true);
    try {
      // 최신 캡션·시간을 먼저 저장한 뒤 전환한다
      const ok = await patch(
        {
          caption,
          desired_publish_at: publishAt ? new Date(publishAt).toISOString() : null,
        },
        true
      );
      if (!ok) return;

      const res = await fetch(`/api/satellite/plans/${planId}/ready`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const problems: string[] = d.problems ?? [];
        alert(
          problems.length
            ? `준비완료로 바꿀 수 없습니다.\n\n${problems.map((p) => `· ${p}`).join("\n")}`
            : d.detail ?? "전환에 실패했습니다."
        );
      }
      await load({ preserveCaption: true, silent: true });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function toDraft() {
    const res = await fetch(`/api/satellite/plans/${planId}/ready`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.detail ?? "전환에 실패했습니다.");
    }
    await load({ preserveCaption: true, silent: true });
    onChanged();
  }

  async function publishNow() {
    if (!confirm("지금 바로 인스타그램에 발행합니다.\n\n되돌릴 수 없습니다. 계속할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/publish-now`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const problems: string[] = d.problems ?? [];
        alert(
          problems.length
            ? `발행 조건을 만족하지 않습니다.\n\n${problems.map((p) => `· ${p}`).join("\n")}`
            : d.detail ?? "발행 요청에 실패했습니다."
        );
      } else {
        alert("발행 대기열에 넣었습니다. 크론이 곧 처리합니다.");
      }
      await load({ preserveCaption: true, silent: true });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function manualPublish() {
    const permalink = prompt(
      "인스타에 직접 올린 게시물 링크를 붙여넣으세요.\n\n" +
        "성과와 담당자는 원래 작성자에게 그대로 귀속됩니다.\n" +
        "예: https://www.instagram.com/p/XXXXXXX/"
    );
    if (!permalink) return;
    const igMediaId = prompt(
      "(선택) 게시물의 Media ID를 알고 있으면 붙여넣으세요.\n\n" +
        "비워두면 '내 대시보드'·'게시물 상세'에서 이 게시물의 성과·인사이트가 연결되지 않습니다 " +
        "— 인스타 API/그래프 API 탐색기 등으로 media_id를 확인해 나중에 다시 '재연결'할 수 있습니다."
    );
    const res = await fetch(`/api/satellite/plans/${planId}/manual-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permalink, ig_media_id: igMediaId || "" }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) alert(d.detail ?? "연결에 실패했습니다.");
    await load({ preserveCaption: true, silent: true });
    onChanged();
  }

  /* ─── 렌더 ─────────────────────────────────────── */

  const hashtags = countHashtags(caption);
  const maxTags = plan?.limits.max_hashtags ?? 5;
  const maxCards = plan?.limits.max_cards ?? 10;
  const overTags = hashtags > maxTags;
  const latestJob = plan?.publish_jobs?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-background w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-xl">
        {/* 헤더 */}
        <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-periwinkle uppercase tracking-widest">Editor</p>
            <h2 className="text-sm font-bold text-navy truncate">
              {plan ? `${fmtMD(plan.scheduled_date)} · ${plan.topic || "(주제 미정)"}` : "불러오는 중"}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {plan && (
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_META[plan.status].cls}`}>
                {STATUS_META[plan.status].label}
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {loading && !plan ? (
            <p className="text-xs text-gray-300 text-center py-12">불러오는 중...</p>
          ) : err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs text-red-600">{err}</p>
            </div>
          ) : plan ? (
            <>
              {/* 업로드 예정 시간 미도달 잠금 — 건별 실시간 판정 (§16-2 ①, 통합 업무 관리 기획안 §10) */}
              {plan.status === "locked" && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-red-700">마감을 넘겨 잠겼습니다</p>
                    <p className="text-[11px] text-red-600 mt-0.5 leading-relaxed">
                      {plan.is_lead
                        ? "리드 승인으로 다시 편집할 수 있게 열 수 있습니다."
                        : "리드에게 잠금 해제를 요청해주세요."}
                    </p>
                  </div>
                  {plan.is_lead && (
                    <button
                      onClick={() =>
                        fetch(`/api/satellite/plans/${plan.id}/unlock`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ unlock_type: "late_upload" }),
                        })
                          .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, d })))
                          .then(({ ok, d }) => {
                            if (!ok) {
                              alert(d.detail ?? "잠금 해제에 실패했습니다.");
                              return;
                            }
                            load({ preserveCaption: true, silent: true });
                          })
                      }
                      className="shrink-0 text-[11px] font-semibold text-white bg-red-500 rounded-xl px-3 py-2 hover:bg-red-600"
                    >
                      잠금 해제
                    </button>
                  )}
                </div>
              )}

              {/* 발행 결과 / 실패 안내 */}
              {latestJob && (
                <div className={`rounded-xl border px-4 py-3 ${JOB_STATE_META[latestJob.state].cls}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold">
                      발행 {JOB_STATE_META[latestJob.state].label}
                    </span>
                    <span className="text-[10px] opacity-70">시도 {latestJob.attempt_no}회</span>
                    {latestJob.permalink && (
                      <a
                        href={latestJob.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold underline underline-offset-2 ml-auto"
                      >
                        게시물 보기
                      </a>
                    )}
                  </div>
                  {latestJob.error_message && (
                    <p className="text-[11px] mt-1 leading-relaxed break-words">
                      [{latestJob.error_code}] {latestJob.error_message}
                    </p>
                  )}
                  {latestJob.recovered_by && (
                    <p className="text-[11px] mt-1">{latestJob.recovered_by} 님이 수동으로 발행</p>
                  )}
                </div>
              )}

              {!plan.publish_enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    발행 스위치가 꺼져 있습니다. 작업은 저장되지만 인스타에 올라가지 않습니다.
                    <br />
                    서버 환경변수 <code className="font-mono">IG_PUBLISH_ENABLED=1</code> 설정이 필요합니다.
                  </p>
                </div>
              )}

              {/* 상위 탭 — 목업의 세 화면(콘텐츠 피드백/에디터/게시물 상세)을 그대로 매핑한다.
                  "에디터"는 카드/캡션·발행 두 하위 탭을 계속 갖는다 — 한 화면에 몰아넣지
                  않으려고 예전에 나눈 걸 그대로 유지, 상위 탭 하나로만 묶었다.
                  "에디터" 탭 자체는 담당자(또는 리드)에게만 보인다 — 비담당자는 이 탭을
                  아예 못 본다 (필드만 비활성화하던 예전 방식에서 변경, 마케팅팀 피드백
                  2026-08-20: "비담당자: 에디터 접근 불가"). */}
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 sticky top-0 z-10">
                <button
                  onClick={() => setActiveTab("detail")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all min-h-[36px] ${
                    activeTab === "detail" ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  콘텐츠 피드백
                  {plan.comment_count > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-periwinkle">{plan.comment_count}</span>
                  )}
                </button>
                {plan.can_edit && (
                  <button
                    onClick={() => setActiveTab("content")}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all min-h-[36px] ${
                      activeTab === "content" ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    에디터
                  </button>
                )}
                <button
                  onClick={() => setActiveTab("post")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all min-h-[36px] ${
                    activeTab === "post" ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  게시물 상세
                </button>
              </div>

              {activeTab === "detail" && (
                <>
                  <section className="bg-white rounded-2xl border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">콘텐츠 피드백</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold">담당자</p>
                        <p className="text-xs text-gray-700 mt-0.5">{plan.owner_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold">유형</p>
                        <p className="text-xs text-gray-700 mt-0.5">{MEDIA_META[plan.media_type].label}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold">업로드 예정일</p>
                        <p className="text-xs text-gray-700 mt-0.5">{fmtMD(plan.scheduled_date)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold">카드 · 해시태그</p>
                        <p className="text-xs text-gray-700 mt-0.5">
                          {plan.card_count}장 · #{plan.hashtag_count}
                        </p>
                      </div>
                    </div>
                    {plan.assets.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-[10px] text-gray-400 font-semibold mb-1.5">
                          등록된 콘텐츠 · {plan.assets.length}장
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {[...plan.assets]
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((a: PlanAsset) => (
                              <div
                                key={a.id}
                                className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-gray-50"
                              >
                                {a.kind === "video" ? (
                                  <video
                                    src={a.preview_url}
                                    className="w-full h-full object-cover"
                                    muted
                                    playsInline
                                  />
                                ) : (
                                  <PreviewableImg
                                    src={a.preview_url}
                                    alt={a.alt_text || `카드 ${a.sort_order + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                                {a.kind === "video" && (
                                  <span className="absolute bottom-1 right-1 text-[9px] font-bold text-white bg-black/50 rounded px-1">
                                    ▶
                                  </span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    {plan.caption && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-[10px] text-gray-400 font-semibold mb-1">캡션</p>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{plan.caption}</p>
                      </div>
                    )}
                  </section>

                  <CommentThread planId={plan.id} />
                </>
              )}

              {activeTab === "content" && (
                <>
              {/* 유형 */}
              <section className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-2">콘텐츠 유형</h3>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  {(Object.keys(MEDIA_META) as MediaType[]).map((k) => (
                    <button
                      key={k}
                      disabled={!plan.can_edit || plan.assets.length > 0}
                      title={
                        plan.assets.length > 0
                          ? "올린 파일을 모두 삭제한 뒤 유형을 바꿀 수 있습니다"
                          : ""
                      }
                      onClick={() => patch({ media_type: k }).then(() => load({ preserveCaption: true, silent: true }))}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        plan.media_type === k
                          ? "bg-white text-navy shadow-sm"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {MEDIA_META[k].label}
                    </button>
                  ))}
                </div>
                {plan.assets.length > 0 && plan.can_edit && (
                  <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                    파일이 올라간 뒤에는 유형을 바꿀 수 없습니다. 릴스는 동영상, 카드뉴스는 이미지만 받습니다.
                  </p>
                )}
                {plan.is_reel && (
                  <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">
                    릴스는 프로필 방문·팔로우 지표를 제공하지 않습니다. 계정 성장 기여도 분석은 카드뉴스 표본으로만 가능합니다.
                  </p>
                )}
                {plan.media_type === "image" && (
                  <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                    자유 형식 콘텐츠입니다 — 발행 대상이 아니라 사진/텍스트 자료 보관용입니다.
                    위치·협업자·발행 시간 같은 발행 관련 항목은 없습니다.
                  </p>
                )}
              </section>

              {plan.media_type === "image" ? (
                <FreeformBlockEditor
                  planId={plan.id}
                  blocks={plan.content_blocks}
                  editable={plan.can_edit}
                  onChanged={(blocks) => setPlan((p) => (p ? { ...p, content_blocks: blocks } : p))}
                />
              ) : (
                <>
              {/* 파일 */}
              <section className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">
                      {plan.is_reel ? "동영상" : MEDIA_META[plan.media_type].label}
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {plan.is_reel
                        ? "MP4 또는 MOV · 1개만 발행됩니다"
                        : "끌어서 순서를 바꿉니다 · 첫 장이 표지입니다"}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      !plan.is_reel && plan.assets.length >= maxCards ? "text-amber-600" : "text-gray-400"
                    }`}
                  >
                    {plan.assets.length}/{plan.is_reel ? 1 : maxCards}
                  </span>
                </div>

                <div className={plan.is_reel ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 sm:grid-cols-5 gap-2"}>
                  {plan.assets.map((a, i) => (
                    <AssetTile
                      key={a.id}
                      asset={a}
                      index={i}
                      editable={plan.can_edit}
                      showOrder={!plan.is_reel}
                      draggableTile={!plan.is_reel}
                      onDragStart={() => setDragId(a.id)}
                      onDrop={() => dropOn(a.id)}
                      onRemove={() => removeAsset(a.id)}
                      onAltTextChange={(v) => {
                        setPlan((prev) =>
                          prev
                            ? {
                                ...prev,
                                assets: prev.assets.map((x) =>
                                  x.id === a.id ? { ...x, alt_text: v } : x
                                ),
                              }
                            : prev
                        );
                        patchAsset(a.id, { alt_text: v });
                      }}
                    />
                  ))}

                  {plan.can_edit && plan.assets.length < (plan.is_reel ? 1 : maxCards) && (
                    <button
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading > 0}
                      className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-300 hover:border-periwinkle hover:text-periwinkle transition-colors disabled:opacity-50"
                    >
                      {uploading > 0 ? (
                        <>
                          <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
                          <span className="text-[9px]">{uploading}장 처리 중</span>
                        </>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          <span className="text-[9px]">추가</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT[plan.media_type]}
                  multiple={!plan.is_reel}
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                />

                <p className="text-[10px] text-gray-400 mt-2.5 leading-relaxed">
                  {plan.is_reel
                    ? "동영상은 변환 없이 원본이 그대로 발행됩니다. 인코딩은 인스타가 처리하며 최대 5분 걸릴 수 있습니다."
                    : "PNG 로 올려도 서버가 발행용 JPEG 로 변환합니다. 원본은 그대로 보관됩니다."}
                </p>
              </section>

              {/* 릴스 전용 — 음원 */}
              {plan.is_reel && (
                <AudioPicker
                  audioId={plan.audio_id}
                  audioVolume={plan.audio_volume}
                  editable={plan.can_edit}
                  onSelect={(id: string, _track: AudioTrack | null) => {
                    patch({ audio_id: id }, true).then((ok) => {
                      if (ok) setPlan((p) => (p ? { ...p, audio_id: id } : p));
                    });
                  }}
                  onVolumeChange={(v: number | null) => {
                    patch({ audio_volume: v }, true).then((ok) => {
                      if (ok) setPlan((p) => (p ? { ...p, audio_volume: v } : p));
                    });
                  }}
                />
              )}

              {/* 릴스 전용 — 실제 트렌드 음원 안내 */}
              {plan.is_reel && (
                <p className="text-[11px] text-gray-400 leading-relaxed -mt-1 px-1">
                  여기서 고를 수 있는 음원은 API로 반출이 허가된 목록뿐이라, 앱에서 찜해둔 트렌드
                  음원과 다를 수 있어요. 특정 트렌드 음원이 꼭 필요하면 이 콘텐츠는 자동 발행 대신
                  인스타 앱에서 직접 올리며 붙이고, 앱의 &quot;고급 설정 → 예약 게시&quot;로 원하는
                  시간에 걸어두세요. 발행 후 하단 &quot;수동 연결&quot;로 링크만 붙이면 실적은 그대로
                  잡힙니다.
                </p>
              )}

              {/* 릴스 전용 — 노출 · 커버 */}
              {plan.is_reel && (
                <section className="bg-white rounded-2xl border border-gray-100 p-4">
                  <h3 className="text-sm font-bold text-gray-800 mb-1">노출 · 커버</h3>
                  <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                    끄면 릴스 탭에만 노출되고 피드에는 뜨지 않습니다. 커버는 안 정하면 인스타가 자동으로 고릅니다.
                  </p>

                  <label className="flex items-center justify-between py-1.5">
                    <span className="text-xs font-medium text-gray-700">피드에도 노출</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={plan.reel_share_to_feed}
                      disabled={!plan.can_edit}
                      onClick={() => {
                        const next = !plan.reel_share_to_feed;
                        patch({ reel_share_to_feed: next }, true).then((ok) => {
                          if (ok) setPlan((p) => (p ? { ...p, reel_share_to_feed: next } : p));
                        });
                      }}
                      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${
                        plan.reel_share_to_feed ? "bg-periwinkle" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          plan.reel_share_to_feed ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </label>

                  <div className="mt-2.5">
                    <label className="text-[11px] text-gray-500 mb-1 block">커버 프레임</label>
                    {plan.assets[0]?.preview_url ? (
                      <ReelCoverPicker
                        videoUrl={plan.assets[0].preview_url}
                        offsetMs={plan.reel_thumb_offset_ms}
                        editable={plan.can_edit}
                        onChange={(ms) => {
                          setPlan((prev) => (prev ? { ...prev, reel_thumb_offset_ms: ms } : prev));
                          patch({ reel_thumb_offset_ms: ms }, true);
                        }}
                      />
                    ) : (
                      <p className="text-[11px] text-gray-400">동영상을 올리면 프레임을 고를 수 있습니다.</p>
                    )}
                  </div>
                </section>
              )}

              {/* 위치 */}
              <LocationPicker
                locationId={plan.location_id}
                locationName={plan.location_name}
                editable={plan.can_edit}
                onSelect={(id: string, name: string) => {
                  patch({ location_id: id, location_name: name }, true).then((ok) => {
                    if (ok) setPlan((p) => (p ? { ...p, location_id: id, location_name: name } : p));
                  });
                }}
              />

              {/* 협업자 */}
              <section className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-gray-800">협업자</h3>
                  <span className="text-[11px] text-gray-400">
                    {plan.collaborator_usernames.length}/{plan.limits.max_collaborators} · 선택 사항
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                  공개 인스타 아이디만 가능합니다. 상대가 초대를 수락해야 공동 게시물로 표시됩니다.
                </p>

                {plan.collaborator_usernames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {plan.collaborator_usernames.map((u) => (
                      <span
                        key={u}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-periwinkle bg-periwinkle/10 border border-periwinkle/20 rounded-full pl-2.5 pr-1.5 py-1"
                      >
                        @{u}
                        {plan.can_edit && (
                          <button
                            onClick={() => {
                              const next = plan.collaborator_usernames.filter((x) => x !== u);
                              patch({ collaborator_usernames: next }, true).then((ok) => {
                                if (ok) setPlan((p) => (p ? { ...p, collaborator_usernames: next } : p));
                              });
                            }}
                            className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-periwinkle/20"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {plan.can_edit && plan.collaborator_usernames.length < plan.limits.max_collaborators && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={collabInput}
                      onChange={(e) => setCollabInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCollaborator();
                        }
                      }}
                      placeholder="인스타 아이디 (@ 없이)"
                      className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-periwinkle"
                    />
                    <button
                      onClick={addCollaborator}
                      disabled={!collabInput.trim()}
                      className="px-4 py-2 text-xs font-semibold text-periwinkle border border-periwinkle/30 rounded-xl hover:bg-periwinkle/5 disabled:opacity-40 transition-colors"
                    >
                      추가
                    </button>
                  </div>
                )}
              </section>

              {/* 캡션 */}
              <section className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-800">캡션</h3>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={overTags ? "text-red-500 font-bold" : "text-gray-400"}>
                      해시태그 {hashtags}/{maxTags}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{caption.length}자</span>
                  </div>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => onCaptionChange(e.target.value)}
                  disabled={!plan.can_edit}
                  rows={7}
                  placeholder="본문과 해시태그를 입력하세요"
                  className={`w-full text-sm text-gray-700 border rounded-xl px-3 py-2.5 focus:outline-none resize-y disabled:bg-gray-50 ${
                    overTags ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-periwinkle"
                  }`}
                />
                {overTags && (
                  <p className="text-[11px] text-red-500 mt-1.5">
                    해시태그가 {maxTags}개를 넘었습니다. 줄여야 저장됩니다. (팀 운영 규칙)
                  </p>
                )}
              </section>

              {/* 희망 발행 시간 */}
              <section className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-1">희망 발행 시간</h3>
                <p className="text-[11px] text-gray-400 mb-2.5">
                  실측 기준 15~18시가 평균 대비 +41% 였습니다. 강제는 아닙니다.
                </p>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => setPublishAt(e.target.value)}
                    onBlur={() =>
                      patch({
                        desired_publish_at: publishAt ? new Date(publishAt).toISOString() : null,
                      }, true).then((ok) => {
                        if (ok) load({ preserveCaption: true, silent: true });
                      })
                    }
                    disabled={!plan.can_edit}
                    className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-periwinkle disabled:bg-gray-50"
                  />
                  <button
                    onClick={() => {
                      const d = new Date(plan.scheduled_date + "T15:00");
                      const v = toLocalInput(d.toISOString());
                      setPublishAt(v);
                      patch({ desired_publish_at: d.toISOString() }, true).then((ok) => {
                        if (ok) load({ preserveCaption: true, silent: true });
                      });
                    }}
                    disabled={!plan.can_edit}
                    className="px-3 text-[11px] font-semibold text-periwinkle border border-periwinkle/25 rounded-xl hover:bg-periwinkle/5 disabled:opacity-40"
                  >
                    15시
                  </button>
                </div>
              </section>

              {/* 발행 전 점검 */}
              {plan.validation.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-bold text-amber-700 mb-1.5">발행 전 확인이 필요합니다</p>
                  <ul className="flex flex-col gap-1">
                    {plan.validation.map((v) => (
                      <li key={v} className="text-[11px] text-amber-700 leading-relaxed">
                        · {v}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 마감 후 수정 요청 (§16-2 ②) — 지각으로 안 잡힌다 */}
              {plan.status === "scheduled" && (
                <EditRequestPanel
                  planId={plan.id}
                  isOwner={plan.is_owner}
                  isLead={plan.is_lead}
                  editRequestCount={plan.edit_request_count}
                  onDone={() => load({ preserveCaption: true, silent: true })}
                />
              )}
                </>
              )}
                </>
              )}

              {activeTab === "post" && (
                <>
              {(plan.is_owner || plan.is_lead) && plan.status !== "draft" && plan.status !== "ready" ? (
                <PerformancePanel planId={plan.id} status={plan.status} />
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-[11px] text-gray-400">
                    {plan.status === "draft" || plan.status === "ready"
                      ? "아직 발행 전입니다. 발행 후 게시물 상세를 확인할 수 있습니다."
                      : "본인 콘텐츠 또는 리드만 게시물 상세를 볼 수 있습니다."}
                  </p>
                </div>
              )}
                </>
              )}
            </>
          ) : null}
        </div>

        {/* 하단 액션 */}
        {plan && (
          <div className="bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-2 shrink-0">
            {plan.status === "draft" ? (
              <button
                onClick={toReady}
                disabled={saving || plan.validation.length > 0 || !plan.can_edit}
                className="flex-1 py-2.5 bg-navy text-white text-xs font-bold rounded-xl hover:bg-periwinkle transition-colors disabled:opacity-40"
              >
                {saving ? "저장 중..." : "준비완료로 전환"}
              </button>
            ) : plan.status === "published" ? (
              <p className="flex-1 text-center text-xs text-gray-400">발행이 완료된 콘텐츠입니다</p>
            ) : (
              <>
                <button
                  onClick={toDraft}
                  disabled={saving || !plan.can_edit}
                  className="px-4 py-2.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
                >
                  작업중으로
                </button>
                {plan.is_lead && (
                  <button
                    onClick={publishNow}
                    disabled={saving || plan.validation.length > 0}
                    className="flex-1 py-2.5 bg-navy text-white text-xs font-bold rounded-xl hover:bg-periwinkle transition-colors disabled:opacity-40"
                  >
                    지금 발행
                  </button>
                )}
              </>
            )}

            {plan.is_lead && (plan.status !== "published" || !plan.has_post) && (
              <button
                onClick={manualPublish}
                className="px-3 py-2.5 text-[11px] font-semibold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50"
                title={
                  plan.status === "published"
                    ? "media_id가 없어 성과·인사이트가 연결되지 않은 게시물입니다 — media_id를 넣어 재연결합니다"
                    : "인스타에 직접 올린 뒤 링크를 연결합니다"
                }
              >
                {plan.status === "published" ? "게시물 재연결" : "수동 연결"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 마감 후 수정 요청 (§16-2 ②) ─────────────────── */

function EditRequestPanel({
  planId,
  isOwner,
  isLead,
  editRequestCount,
  onDone,
}: {
  planId: number;
  isOwner: boolean;
  isLead: boolean;
  editRequestCount: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  if (!isOwner && !isLead) return null;

  async function requestEdit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/edit-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "수정 요청에 실패했습니다.");
        return;
      }
      alert("리드에게 수정 요청을 보냈습니다.");
      setReason("");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/edit-request/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "승인에 실패했습니다.");
        return;
      }
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-800">마감 후 수정</h3>
        <span className="text-[11px] text-gray-400">누적 {editRequestCount}회 · 지각 아님</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">
        발행 대기 중인 콘텐츠를 고치려면 리드 승인이 필요합니다. 오탈자 등 단순 수정은 근태에 반영되지 않습니다.
      </p>
      <div className="flex gap-2">
        {!isLead && (
          <>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="수정 사유 (선택)"
              className="flex-1 text-xs text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-periwinkle"
            />
            <button
              onClick={requestEdit}
              disabled={busy}
              className="shrink-0 px-3 py-2 text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-xl hover:bg-periwinkle/5 disabled:opacity-40"
            >
              수정 요청
            </button>
          </>
        )}
        {isLead && (
          <button
            onClick={approve}
            disabled={busy}
            className="flex-1 py-2 text-[11px] font-semibold text-white bg-navy rounded-xl hover:bg-periwinkle disabled:opacity-40"
          >
            수정 허용 (편집 다시 열기)
          </button>
        )}
      </div>
    </section>
  );
}

/* ─── 이미지 타일 ─────────────────────────────────── */

function AssetTile({
  asset,
  index,
  editable,
  showOrder = true,
  draggableTile = true,
  onDragStart,
  onDrop,
  onRemove,
  onAltTextChange,
}: {
  asset: PlanAsset;
  index: number;
  editable: boolean;
  showOrder?: boolean;
  draggableTile?: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onRemove: () => void;
  onAltTextChange?: (v: string) => void;
}) {
  const isVideo = asset.kind === "video";
  const canDrag = editable && draggableTile;
  const [altOpen, setAltOpen] = useState(false);
  const [altDraft, setAltDraft] = useState(asset.alt_text);

  useEffect(() => {
    setAltDraft(asset.alt_text);
  }, [asset.alt_text]);

  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50 group ${
        isVideo ? "aspect-[9/16]" : "aspect-square"
      } ${canDrag ? "cursor-grab" : ""}`}
    >
      {asset.preview_url ? (
        isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={asset.preview_url} controls playsInline className="w-full h-full object-cover bg-black" />
        ) : (
          <PreviewableImg src={asset.preview_url} alt={`${index + 1}번째 장`} className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-300">
          미리보기 없음
        </div>
      )}

      {/* 순번 — 릴스는 순서 개념이 없어 숨긴다 */}
      {showOrder && (
        <span className="absolute top-1 left-1 text-[9px] font-bold text-white bg-black/50 rounded px-1.5 py-0.5">
          {index + 1}
        </span>
      )}

      {/* 변환 상태 */}
      {!asset.is_ready && (
        <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-1 px-1">
          {asset.convert_error ? (
            <>
              <span className="text-[9px] font-bold text-red-500">변환 실패</span>
              <span className="text-[8px] text-red-400 text-center leading-tight line-clamp-3">
                {asset.convert_error}
              </span>
            </>
          ) : (
            <>
              <div className="w-3 h-3 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
              <span className="text-[8px] text-gray-400">변환 중</span>
            </>
          )}
        </div>
      )}

      {editable && (
        <button
          onClick={onRemove}
          aria-label="삭제"
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* 대체 텍스트(접근성) — 동영상엔 없는 파라미터라 이미지에만 노출 */}
      {!isVideo && onAltTextChange && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAltOpen((v) => !v);
            }}
            className={`absolute bottom-1 left-1 text-[8px] font-bold rounded px-1.5 py-0.5 ${
              asset.alt_text
                ? "bg-periwinkle text-white"
                : "bg-black/50 text-white opacity-0 group-hover:opacity-100"
            } transition-opacity`}
          >
            ALT
          </button>

          {altOpen && (
            <div
              className="absolute inset-0 bg-black/70 flex flex-col justify-end p-1.5 gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                value={altDraft}
                onChange={(e) => setAltDraft(e.target.value)}
                disabled={!editable}
                placeholder="대체 텍스트 (접근성)"
                rows={3}
                className="w-full text-[9px] text-white bg-black/40 border border-white/30 rounded px-1.5 py-1 focus:outline-none resize-none placeholder:text-white/50"
              />
              <button
                onClick={() => {
                  onAltTextChange(altDraft);
                  setAltOpen(false);
                }}
                className="text-[9px] font-bold text-navy bg-white rounded px-1.5 py-0.5"
              >
                저장
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── 유틸 ────────────────────────────────────────── */

function countHashtags(caption: string): number {
  return (caption.match(/#[^\s#]+/g) ?? []).length;
}

/** ISO → datetime-local 입력값 (로컬 시간대) */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
