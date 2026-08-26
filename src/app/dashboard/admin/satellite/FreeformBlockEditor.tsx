"use client";

import { useRef, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import { ContentBlockItem } from "./types";

/**
 * "기타" 유형 전용 자유 콘텐츠 편집기 (마케팅팀 피드백 2026-08-26) — 사진과 텍스트를
 * 순서 상관없이 섞어 넣는다. 카드뉴스/릴스의 발행용 자산(PlanAsset)과는 완전히 별개
 * (백엔드 ContentBlock). 용례: 카드뉴스 주제 정하기, 학생회 단톡에 뿌릴 글 등
 * 인스타에 올리지 않는 자료. 장수 제한·발행 전 점검·위치·협업자·발행시간은 없다.
 */
export default function FreeformBlockEditor({
  planId,
  topic,
  blocks,
  editable,
  onChanged,
}: {
  planId: number;
  topic: string;
  blocks: ContentBlockItem[];
  editable: boolean;
  onChanged: (blocks: ContentBlockItem[]) => void;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order);

  function exportMarkdown() {
    const lines: string[] = [];
    const title = topic.trim();
    if (title) {
      lines.push(`# ${title}`, "");
    }
    for (const b of sorted) {
      if (b.block_type === "image") {
        if (b.image_url) lines.push(`![](${b.image_url})`, "");
      } else if (b.text.trim()) {
        lines.push(b.text.trim(), "");
      }
    }
    const md = (lines.join("\n").trimEnd() || "# (제목 없음)") + "\n";
    const safe = (title || "기타").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addText() {
    if (!text.trim()) return;
    const res = await fetch(`/api/satellite/plans/${planId}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_type: "text", text: text.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d.detail ?? "추가에 실패했습니다.");
      return;
    }
    onChanged([...blocks, d]);
    setText("");
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const pres = await fetch(`/api/satellite/plans/${planId}/blocks/image/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content_type: file.type }),
      });
      const p = await pres.json().catch(() => ({}));
      if (!pres.ok) {
        alert(p.detail ?? "업로드 URL 발급에 실패했습니다.");
        return;
      }
      const put = await fetch(p.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) {
        alert(`업로드에 실패했습니다. (S3 ${put.status})`);
        return;
      }
      const reg = await fetch(`/api/satellite/plans/${planId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_type: "image", key: p.key, filename: file.name, content_type: file.type }),
      });
      const r = await reg.json().catch(() => ({}));
      if (!reg.ok) {
        alert(r.detail ?? "등록에 실패했습니다.");
        return;
      }
      onChanged([...blocks, r]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeBlock(id: number) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    const res = await fetch(`/api/satellite/blocks/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      onChanged(blocks.filter((b) => b.id !== id));
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.detail ?? "삭제에 실패했습니다.");
    }
  }

  async function editText(id: number, newText: string) {
    const res = await fetch(`/api/satellite/blocks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) onChanged(blocks.map((b) => (b.id === id ? d : b)));
  }

  async function dropOn(targetId: number) {
    if (dragId == null || dragId === targetId) return;
    const ids = sorted.map((b) => b.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setDragId(null);

    const reordered = ids.map((id, i) => ({ ...blocks.find((b) => b.id === id)!, sort_order: i }));
    onChanged(reordered);

    const res = await fetch(`/api/satellite/plans/${planId}/blocks/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ids }),
    });
    if (!res.ok) onChanged(blocks); // 실패하면 원래 순서로 되돌린다
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-gray-800">자유 콘텐츠</h3>
        <button
          type="button"
          onClick={exportMarkdown}
          className="shrink-0 text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1 hover:bg-periwinkle/5"
        >
          .md 내보내기
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
        카드뉴스 주제 정하기, 학생회 단톡에 뿌릴 글처럼 발행하지 않는 자료를 사진·텍스트로 자유롭게 모으세요.
      </p>

      {sorted.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {sorted.map((b) => (
            <div
              key={b.id}
              draggable={editable}
              onDragStart={() => setDragId(b.id)}
              onDragOver={(e) => editable && e.preventDefault()}
              onDrop={(e) => {
                if (!editable) return;
                e.preventDefault();
                dropOn(b.id);
              }}
              className={`relative rounded-xl border border-gray-100 p-2 group ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {b.block_type === "image" ? (
                <PreviewableImg src={b.image_url} alt="" className="w-full max-h-64 object-contain rounded-lg bg-gray-50" />
              ) : (
                <textarea
                  defaultValue={b.text}
                  disabled={!editable}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== b.text) editText(b.id, v);
                  }}
                  rows={3}
                  className="w-full text-sm text-gray-700 border-0 focus:outline-none resize-y disabled:bg-transparent disabled:text-gray-500"
                />
              )}
              {editable && (
                <button
                  onClick={() => removeBlock(b.id)}
                  aria-label="삭제"
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="텍스트 추가"
              rows={2}
              className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-periwinkle resize-y"
            />
            <button
              onClick={addText}
              disabled={!text.trim()}
              className="shrink-0 text-xs font-semibold text-periwinkle border border-periwinkle/30 rounded-xl px-3 py-2 hover:bg-periwinkle/5 disabled:opacity-40"
            >
              텍스트 추가
            </button>
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="text-xs font-semibold text-gray-500 border-2 border-dashed border-gray-200 rounded-xl py-2.5 hover:border-periwinkle hover:text-periwinkle transition-colors disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : "+ 사진 추가"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              if (fileInput.current) fileInput.current.value = "";
            }}
            className="hidden"
          />
        </div>
      )}
    </section>
  );
}
