"use client";

import { useRef, useState } from "react";

/* ─── 압축 설정 타입 ─── */
export interface CompressConfig {
  maxPx: number;       // 긴 변 최대 픽셀 (0 = 원본)
  quality: number;     // JPEG 초기 품질 0~1
  targetKB?: number;   // 목표 파일 크기(KB) — 설정 시 quality를 낮춰가며 adaptive 압축
}

export const COMPRESS_PRESETS: { label: string; config: CompressConfig }[] = [
  { label: "소형 (~100KB)", config: { maxPx: 1000, quality: 0.85, targetKB: 100 } },
  { label: "중형 (~200KB)", config: { maxPx: 1400, quality: 0.85, targetKB: 200 } },
  { label: "고화질 (~400KB)", config: { maxPx: 1800, quality: 0.9, targetKB: 400 } },
  { label: "원본",            config: { maxPx: 0,    quality: 1.0 } },
];

/* ─── Canvas 압축 (adaptive) ─── */
async function compressImage(file: File, cfg: CompressConfig): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (cfg.maxPx > 0 && Math.max(width, height) > cfg.maxPx) {
        const ratio = cfg.maxPx / Math.max(width, height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      const encode = (q: number) =>
        new Promise<Blob>((res, rej) =>
          canvas.toBlob(
            (blob) => (blob ? res(blob) : rej(new Error("Canvas toBlob 실패"))),
            "image/jpeg",
            q,
          )
        );

      try {
        if (!cfg.targetKB) {
          resolve(await encode(cfg.quality));
          return;
        }
        // 목표 크기 이하가 될 때까지 quality 단계적으로 감소
        const targetBytes = cfg.targetKB * 1024;
        let quality = cfg.quality;
        while (quality >= 0.2) {
          const blob = await encode(quality);
          if (blob.size <= targetBytes) { resolve(blob); return; }
          quality = Math.round((quality - 0.1) * 10) / 10;
        }
        resolve(await encode(0.2));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지 로드 실패")); };
    img.src = url;
  });
}

/* ─── Props ─── */
interface Props {
  restaurantId?: number;
  initialUrls: string[];
  onSave: (urls: string[]) => Promise<void>;
  maxImages?: number;
  uploadType?: "restaurant" | "banner" | "popup";
  label?: string;
}

export default function ImageUploader({
  restaurantId,
  initialUrls,
  onSave,
  maxImages = 5,
  uploadType = "restaurant",
  label,
}: Props) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [compressCfg, setCompressCfg] = useState<CompressConfig>(COMPRESS_PRESETS[1].config);
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const remaining = maxImages - urls.length;
    if (remaining <= 0) { setError(`최대 ${maxImages}장까지 등록할 수 있습니다.`); return; }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError("");
    const newUrls: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      setProgress(`압축 중 (${i + 1}/${toUpload.length})...`);

      let blob: Blob;
      try {
        blob = await compressImage(file, compressCfg);
      } catch {
        setError(`${file.name} 압축 실패`);
        continue;
      }

      setProgress(`업로드 중 (${i + 1}/${toUpload.length})...`);

      const presignRes = await fetch("/api/dashboard/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          filename: file.name,
          content_type: "image/jpeg",
          upload_type: uploadType,
        }),
      });
      if (!presignRes.ok) { setError("업로드 URL 발급 실패"); continue; }
      const { upload_url, public_url } = await presignRes.json();

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!putRes.ok) { setError("S3 업로드 실패"); continue; }
      newUrls.push(public_url);
    }

    setUrls((prev) => [...prev, ...newUrls]);
    setProgress("");
    setUploading(false);
  }

  function remove(idx: number) {
    setUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveLeft(idx: number) {
    if (idx === 0) return;
    setUrls((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveRight(idx: number) {
    setUrls((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    setUploading(true);
    setError("");
    try {
      await onSave(urls);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  const isDirty = JSON.stringify(urls) !== JSON.stringify(initialUrls);
  const isSingle = maxImages === 1;

  return (
    <div>
      {/* 압축 설정 */}
      <div className="mb-3">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          ⚙ 업로드 품질 설정 {showSettings ? "▲" : "▼"}
        </button>
        {showSettings && (
          <div className="mt-2 flex flex-col gap-1.5 bg-gray-50 rounded-xl p-3">
            {COMPRESS_PRESETS.map(({ label: presetLabel, config }) => (
              <label key={presetLabel} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`compress-${uploadType}`}
                  checked={compressCfg.maxPx === config.maxPx && compressCfg.quality === config.quality}
                  onChange={() => setCompressCfg(config)}
                  className="accent-periwinkle"
                />
                <span className="text-xs text-gray-600">{presetLabel}</span>
              </label>
            ))}
            <p className="text-[10px] text-gray-400 mt-1">
              현재:{" "}
              {compressCfg.targetKB
                ? `목표 ${compressCfg.targetKB}KB 이하`
                : "원본"}{" "}
              / 최대 {compressCfg.maxPx > 0 ? `${compressCfg.maxPx}px` : "원본"}
            </p>
          </div>
        )}
      </div>

      {/* 이미지 그리드 */}
      <div className={`grid ${isSingle ? "grid-cols-1" : "grid-cols-3"} gap-2 mb-3`}>
        {urls.map((url, i) => (
          <div
            key={url}
            className={`relative ${isSingle ? "aspect-video" : "aspect-square"} rounded-xl overflow-hidden bg-gray-100 group`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${label ?? "이미지"} ${i + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
              {!isSingle && (
                <div className="flex justify-between">
                  <button
                    onClick={() => moveLeft(i)}
                    disabled={i === 0}
                    className="w-6 h-6 rounded-full bg-white/80 text-gray-700 text-xs disabled:opacity-30 flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => moveRight(i)}
                    disabled={i === urls.length - 1}
                    className="w-6 h-6 rounded-full bg-white/80 text-gray-700 text-xs disabled:opacity-30 flex items-center justify-center"
                  >
                    ›
                  </button>
                </div>
              )}
              <button
                onClick={() => remove(i)}
                className="self-center w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            {!isSingle && (
              <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] flex items-center justify-center">
                {i + 1}
              </span>
            )}
          </div>
        ))}

        {urls.length < maxImages && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`${isSingle ? "aspect-video" : "aspect-square"} rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 hover:border-periwinkle hover:bg-gray-50 transition-colors`}
          >
            <span className="text-2xl text-gray-300">+</span>
            {!isSingle && (
              <span className="text-[10px] text-gray-400">{urls.length}/{maxImages}</span>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={!isSingle}
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {progress && <p className="text-xs text-periwinkle mb-2">{progress}</p>}
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <button
        onClick={handleSave}
        disabled={!isDirty || uploading}
        className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
          saved
            ? "bg-green-500 text-white"
            : isDirty
            ? "bg-periwinkle text-white hover:bg-navy"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {saved ? "✓ 저장되었습니다" : uploading ? progress || "처리 중..." : "사진 저장"}
      </button>
      {!isSingle && (
        <p className="text-[10px] text-gray-400 text-center mt-2">
          ‹ › 버튼으로 순서 변경 · ✕로 삭제 · 최대 {maxImages}장
        </p>
      )}
    </div>
  );
}
