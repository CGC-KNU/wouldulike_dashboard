"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import {
  BannerCampaignDetail,
  BannerCampaignSummary,
  BannerPlacement,
  BannerRatio,
} from "./types";

/**
 * 배너랩 — 배너/팝업 자동화 컴포저 (Phase 1, 2026-08-17 착수).
 *
 * 흐름: 사진 풀 + 문구 풀을 캠페인에 쌓아두고 "생성" 한 번으로 몇 장을
 * 합성해서 슬랙 채널에 예시로 보낸다. 슬랙 버튼 선택(Interactive Components)은
 * 다음 단계 — 지금은 발송까지만.
 */

const RATIO_OPTIONS: { value: BannerRatio; label: string }[] = [
  { value: "4:5", label: "4:5 세로 (기본)" },
  { value: "1:1", label: "1:1 정사각" },
  { value: "9:16", label: "9:16 스토리" },
  { value: "16:9", label: "16:9 가로" },
];

const PLACEMENT_OPTIONS: { value: BannerPlacement; label: string }[] = [
  { value: "bottom", label: "하단" },
  { value: "center", label: "중앙" },
  { value: "top", label: "상단" },
];

export default function BannerLabComposer() {
  const [campaigns, setCampaigns] = useState<BannerCampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BannerCampaignDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [err, setErr] = useState("");

  // 새 캠페인 폼
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRatio, setNewRatio] = useState<BannerRatio>("4:5");
  const [newTone, setNewTone] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 문구 입력
  const [copyText, setCopyText] = useState("");
  const [copyPlacement, setCopyPlacement] = useState<BannerPlacement>("bottom");
  const [copyColor, setCopyColor] = useState("#FFFFFF");
  const [addingCopy, setAddingCopy] = useState(false);

  const [uploading, setUploading] = useState(0);
  const [generating, setGenerating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // AI 지시문
  const [aiPrompt, setAiPrompt] = useState("");
  const [savingAiPrompt, setSavingAiPrompt] = useState(false);
  const [retouchingId, setRetouchingId] = useState<number | null>(null);

  // 무드 참고사진
  const [uploadingMood, setUploadingMood] = useState(false);
  const [removingMood, setRemovingMood] = useState(false);
  const moodFileInput = useRef<HTMLInputElement>(null);

  const loadCampaigns = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/bannerlab/campaigns");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCampaigns(data.campaigns ?? []);
      else setErr(data.detail ?? "캠페인 목록을 불러오지 못했습니다.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setErr("");
    try {
      const res = await fetch(`/api/bannerlab/campaigns/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDetail(data);
      else setErr(data.detail ?? "캠페인을 불러오지 못했습니다.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    setAiPrompt(detail?.ai_prompt ?? "");
  }, [detail?.id, detail?.ai_prompt]);

  async function createCampaign() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setErr("");
    try {
      const res = await fetch("/api/bannerlab/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), ratio: newRatio, tone: newTone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.detail ?? "캠페인 생성에 실패했습니다.");
        return;
      }
      setNewTitle("");
      setNewTone("");
      setShowNew(false);
      await loadCampaigns();
      setSelectedId(data.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || !files.length || !detail) return;
    setUploading(files.length);
    for (const file of Array.from(files)) {
      try {
        const pres = await fetch(`/api/bannerlab/campaigns/${detail.id}/photos/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content_type: file.type || "image/jpeg" }),
        });
        const p = await pres.json().catch(() => ({}));
        if (!pres.ok) {
          alert(p.detail ?? "업로드 URL 발급에 실패했습니다.");
          continue;
        }
        const put = await fetch(p.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });
        if (!put.ok) {
          alert(`${file.name} 업로드 실패 (S3 ${put.status})`);
          continue;
        }
        const reg = await fetch(`/api/bannerlab/campaigns/${detail.id}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: p.key }),
        });
        const r = await reg.json().catch(() => ({}));
        if (!reg.ok) alert(r.detail ?? `${file.name} 등록 실패`);
      } catch (e) {
        alert(`${file.name}: ${(e as Error).message}`);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    if (fileInput.current) fileInput.current.value = "";
    await loadDetail(detail.id);
  }

  async function removePhoto(photoId: number) {
    if (!detail) return;
    if (!confirm("이 사진을 삭제할까요?")) return;
    await fetch(`/api/bannerlab/photos/${photoId}`, { method: "DELETE" });
    await loadDetail(detail.id);
  }

  async function saveAiPrompt() {
    if (!detail) return;
    setSavingAiPrompt(true);
    try {
      const res = await fetch(`/api/bannerlab/campaigns/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_prompt: aiPrompt.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "AI 지시문 저장에 실패했습니다.");
        return;
      }
      await loadDetail(detail.id);
    } finally {
      setSavingAiPrompt(false);
    }
  }

  async function uploadMoodPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file || !detail) return;
    setUploadingMood(true);
    try {
      const pres = await fetch(`/api/bannerlab/campaigns/${detail.id}/mood-photo/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content_type: file.type || "image/jpeg" }),
      });
      const p = await pres.json().catch(() => ({}));
      if (!pres.ok) {
        alert(p.detail ?? "업로드 URL 발급에 실패했습니다.");
        return;
      }
      const put = await fetch(p.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) {
        alert(`업로드 실패 (S3 ${put.status})`);
        return;
      }
      const reg = await fetch(`/api/bannerlab/campaigns/${detail.id}/mood-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: p.key }),
      });
      const r = await reg.json().catch(() => ({}));
      if (!reg.ok) alert(r.detail ?? "무드 참고사진 등록 실패");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploadingMood(false);
      if (moodFileInput.current) moodFileInput.current.value = "";
      await loadDetail(detail.id);
    }
  }

  async function removeMoodPhoto() {
    if (!detail) return;
    setRemovingMood(true);
    try {
      await fetch(`/api/bannerlab/campaigns/${detail.id}/mood-photo`, { method: "DELETE" });
      await loadDetail(detail.id);
    } finally {
      setRemovingMood(false);
    }
  }

  async function retouchPhoto(photoId: number) {
    if (!detail) return;
    if (!aiPrompt.trim() && !detail.mood_photo_url) {
      alert("먼저 AI 지시문을 입력하거나 무드 참고사진을 등록해주세요.");
      return;
    }
    if (aiPrompt.trim() !== detail.ai_prompt) {
      alert("AI 지시문을 수정하셨네요. 먼저 저장 버튼을 눌러주세요.");
      return;
    }
    setRetouchingId(photoId);
    try {
      const res = await fetch(`/api/bannerlab/photos/${photoId}/retouch`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "AI 다듬기에 실패했습니다.");
        return;
      }
      await loadDetail(detail.id);
    } finally {
      setRetouchingId(null);
    }
  }

  async function addCopy() {
    if (!detail || !copyText.trim()) return;
    setAddingCopy(true);
    try {
      const res = await fetch(`/api/bannerlab/campaigns/${detail.id}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: copyText.trim(), placement: copyPlacement, text_color: copyColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "문구 추가에 실패했습니다.");
        return;
      }
      setCopyText("");
      await loadDetail(detail.id);
    } finally {
      setAddingCopy(false);
    }
  }

  async function removeCopy(copyId: number) {
    if (!detail) return;
    await fetch(`/api/bannerlab/copies/${copyId}`, { method: "DELETE" });
    await loadDetail(detail.id);
  }

  async function deleteCampaign() {
    if (!detail) return;
    if (!confirm(`"${detail.title}" 캠페인을 삭제할까요? 목록에서 사라지고 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bannerlab/campaigns/${detail.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail ?? "삭제에 실패했습니다.");
        return;
      }
      setSelectedId(null);
      await loadCampaigns();
    } finally {
      setDeleting(false);
    }
  }

  async function generate() {
    if (!detail) return;
    if (!detail.photos.length) {
      alert("사진을 먼저 1장 이상 올려주세요.");
      return;
    }
    setGenerating(true);
    setErr("");
    try {
      const res = await fetch(`/api/bannerlab/campaigns/${detail.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_to_slack: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.detail ?? "생성에 실패했습니다.");
        return;
      }
      if (!data.slack_enabled) {
        alert("합성은 완료됐지만, 슬랙 봇 토큰(SLACK_BOT_TOKEN)이 설정되어 있지 않아 슬랙 발송은 건너뛰었습니다.");
      } else if (!data.slack_channel_id) {
        alert("합성은 완료됐지만, 슬랙 채널이 지정되어 있지 않아 발송을 건너뛰었습니다. 캠페인에 채널 ID를 지정해주세요.");
      }
      if (data.skipped_combinations) {
        alert(`조합이 많아 이번엔 ${data.skipped_combinations}개 조합을 생성하지 않았습니다. (최대 6장)`);
      }
      await loadDetail(detail.id);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-[11px] text-red-600">{err}</p>
        </div>
      )}

      {/* 캠페인 선택 / 생성 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle min-w-[220px]"
        >
          <option value="">캠페인 선택{loadingList ? " (불러오는 중...)" : ""}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.ratio} · {c.status_label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1.5 hover:bg-periwinkle/5"
        >
          {showNew ? "닫기" : "+ 새 캠페인"}
        </button>
        {detail && (
          <button
            onClick={deleteCampaign}
            disabled={deleting}
            className="text-[11px] font-semibold text-red-500 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 disabled:opacity-40 ml-auto"
          >
            {deleting ? "삭제 중..." : "캠페인 삭제"}
          </button>
        )}
      </div>

      {showNew && (
        <div className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="캠페인 제목 (예: 8월 신규 오픈 프로모션)"
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
          />
          <div className="flex items-center gap-2">
            <select
              value={newRatio}
              onChange={(e) => setNewRatio(e.target.value as BannerRatio)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
            >
              {RATIO_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              value={newTone}
              onChange={(e) => setNewTone(e.target.value)}
              placeholder="톤 (예: 밝고 화사하게 / 미니멀 / 다크)"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
            />
          </div>
          <button
            onClick={createCampaign}
            disabled={creating || !newTitle.trim()}
            className="self-start text-[11px] font-semibold text-white bg-navy rounded-lg px-3 py-1.5 hover:bg-periwinkle disabled:opacity-40"
          >
            {creating ? "생성 중..." : "캠페인 만들기"}
          </button>
        </div>
      )}

      {loadingDetail && <p className="text-xs text-gray-300 py-4 text-center">불러오는 중...</p>}

      {detail && !loadingDetail && (
        <div className="flex flex-col gap-4">
          {!detail.slack_enabled && (
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              슬랙 봇 토큰이 아직 설정되어 있지 않습니다 — 지금은 합성 결과가 대시보드에만 남고 슬랙으로는 발송되지 않습니다.
            </p>
          )}
          {!detail.ai_retouch_enabled && (
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              OpenAI API 키가 아직 설정되어 있지 않습니다 — "AI로 다듬기"는 지금 사용할 수 없고, 사진 원본으로만 합성됩니다.
            </p>
          )}

          {/* AI 지시문 */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">AI 사진 다듬기 지시문</p>
            <div className="flex items-start gap-1.5">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="예: 따뜻한 조명, 음식이 부각되게, 자연스러운 매장 분위기 (문구는 여기 안 넣어도 됩니다 — 별도로 얹습니다)"
                rows={2}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle resize-none"
              />
              <button
                onClick={saveAiPrompt}
                disabled={savingAiPrompt || aiPrompt.trim() === detail.ai_prompt}
                className="shrink-0 text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle disabled:opacity-40"
              >
                {savingAiPrompt ? "저장 중..." : "저장"}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              AI는 사진(배경·톤)만 다듬고, 문구는 지금처럼 Pillow가 정확하게 얹습니다.
            </p>
          </div>

          {/* 무드 참고사진 */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">무드 참고사진 (선택)</p>
            <div className="flex items-center gap-2.5">
              {detail.mood_photo_url ? (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 group shrink-0">
                  <PreviewableImg src={detail.mood_photo_url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={removeMoodPhoto}
                    disabled={removingMood}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 text-white text-[9px] opacity-0 group-hover:opacity-100 disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="w-16 h-16 shrink-0 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-periwinkle cursor-pointer text-center px-1">
                  {uploadingMood ? "업로드 중..." : "+ 사진"}
                  <input
                    ref={moodFileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => uploadMoodPhoto(e.target.files)}
                  />
                </label>
              )}
              <p className="text-[10px] text-gray-400 flex-1">
                이 사진을 올리면 AI 다듬기가 이 사진의 색감·조명·분위기를 기준으로 삼고, 위 지시문은 그 위에
                디테일만 덧붙입니다. 사진 없이 지시문만으로도 계속 사용할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 사진 풀 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-600">소재 사진 ({detail.photos.length}장)</p>
              <label className="text-[11px] text-periwinkle cursor-pointer">
                {uploading > 0 ? `업로드 중... (${uploading})` : "+ 사진 추가"}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadPhotos(e.target.files)}
                />
              </label>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              {detail.photos.map((p) => (
                <div key={p.id} className="w-20">
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 group">
                    <PreviewableImg src={p.retouched_url || p.url} alt="" className="w-full h-full object-cover" />
                    {p.retouched_url && (
                      <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold text-white bg-periwinkle/90 rounded px-1">
                        AI
                      </span>
                    )}
                    <button
                      onClick={() => removePhoto(p.id)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 text-white text-[9px] opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                  <button
                    onClick={() => retouchPhoto(p.id)}
                    disabled={retouchingId === p.id || !detail.ai_retouch_enabled}
                    className="mt-1 w-full text-[9.5px] font-semibold text-periwinkle border border-periwinkle/30 rounded-md py-1 hover:bg-periwinkle/5 disabled:opacity-30"
                    title={p.retouch_error || undefined}
                  >
                    {retouchingId === p.id ? "다듬는 중..." : p.retouched_url ? "다시 다듬기" : "AI로 다듬기"}
                  </button>
                  {p.retouch_error && (
                    <p className="text-[9px] text-red-500 mt-0.5 truncate" title={p.retouch_error}>
                      {p.retouch_error}
                    </p>
                  )}
                </div>
              ))}
              {!detail.photos.length && <p className="text-[11px] text-gray-300">아직 올린 사진이 없습니다.</p>}
            </div>
          </div>

          {/* 문구 풀 */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">문구 ({detail.copies.length}개)</p>
            <div className="flex flex-col gap-1.5 mb-2">
              {detail.copies.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[11px] border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <span className="flex-1 truncate">{c.text}</span>
                  <span className="text-gray-400 bg-gray-50 rounded-full px-1.5">{c.placement_label}</span>
                  <span className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: c.text_color }} />
                  <button onClick={() => removeCopy(c.id)} className="text-gray-300 hover:text-red-500">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={copyText}
                onChange={(e) => setCopyText(e.target.value)}
                placeholder="배너 문구 입력"
                maxLength={80}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
              />
              <select
                value={copyPlacement}
                onChange={(e) => setCopyPlacement(e.target.value as BannerPlacement)}
                className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5"
              >
                {PLACEMENT_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={copyColor}
                onChange={(e) => setCopyColor(e.target.value)}
                className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer"
              />
              <button
                onClick={addCopy}
                disabled={addingCopy || !copyText.trim()}
                className="text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </div>

          {/* 생성 */}
          <button
            onClick={generate}
            disabled={generating || !detail.photos.length}
            className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-40"
          >
            {generating ? "합성 + 발송 중..." : "예시 생성해서 슬랙으로 보내기"}
          </button>
          <p className="text-[10px] text-gray-400 -mt-2.5">
            사진×문구 조합 중 최대 6장까지 한 번에 만듭니다. 사진만 올리고 문구를 안 넣으면 사진별 1장씩 만듭니다.
          </p>

          {/* 결과 */}
          {detail.variants.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">생성 결과 ({detail.variants.length}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detail.variants.map((v) => (
                  <div key={v.id} className="rounded-lg overflow-hidden border border-gray-100 relative">
                    {v.source_photo_ai && (
                      <span className="absolute top-1 left-1 z-10 text-[8px] font-bold text-white bg-periwinkle/90 rounded px-1">
                        AI 사진
                      </span>
                    )}
                    {v.url ? (
                      <PreviewableImg src={v.url} alt="" className="w-full aspect-[4/5] object-cover bg-gray-50" />
                    ) : (
                      <div className="w-full aspect-[4/5] bg-gray-50 flex items-center justify-center text-[10px] text-red-400 p-2 text-center">
                        {v.render_error || "합성 실패"}
                      </div>
                    )}
                    <div className="px-1.5 py-1 text-[10px] text-gray-400 flex items-center justify-between">
                      <span className="truncate">{v.copy_text || "(문구 없음)"}</span>
                      {v.slack_posted ? (
                        <span className="text-emerald-600">슬랙 발송됨</span>
                      ) : v.slack_error ? (
                        <span className="text-red-500" title={v.slack_error}>
                          발송 실패
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!detail && !loadingDetail && (
        <p className="text-xs text-gray-300 text-center py-6">캠페인을 선택하거나 새로 만들어주세요.</p>
      )}
    </div>
  );
}
