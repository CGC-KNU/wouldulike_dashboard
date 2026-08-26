"use client";

/**
 * 배너 & 팝업 관리 — 원래 관리자 대시보드(page.tsx) 탭("배너 & 팝업")에만 있던 화면이다.
 * Papillon(세틀라이트) 쪽에서도 마케팅팀이 굳이 메인 탭으로 나가지 않고 바로 접근할 수
 * 있게 해달라는 요청(RD, 2026-08-20)으로 page.tsx 밖으로 뽑아 공용 컴포넌트로 만들었다.
 * page.tsx 의 "배너 & 팝업" 탭과 PapillonShell 의 "배너/팝업" 사이드바 항목이 이 파일
 * 하나를 그대로 재사용한다 — 로직을 복제하면 나중에 한쪽만 고쳐서 어긋나기 쉽다.
 */

import { useCallback, useEffect, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import BannerStudioComposer from "./bannerlab/BannerStudioComposer";
import WeeklyAutomationComposer from "./bannerlab/WeeklyAutomationComposer";

interface TrendItem {
  id: number;
  title: string;
  description: string;
  image_url: string | null;
  blog_link: string;
  display_order: number;
  created_at: string;
}
interface PopupItem {
  id: number;
  title: string;
  image_url: string;
  instagram_url: string;
  start_at: string;
  end_at: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

/* ═══════════════════════════════════════════════════
   인라인 이미지 업로드 필드 (폼 내부용)
═══════════════════════════════════════════════════ */
function ImagePickerField({
  value,
  onChange,
  uploadType,
}: {
  value: string;
  onChange: (url: string) => void;
  uploadType: "trend" | "popup";
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const ref = useCallback((input: HTMLInputElement | null) => { if (input) input.value = ""; }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setErr("");
    try {
      // 압축 (canvas)
      const compressed = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 1400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let q = 0.85;
          const step = () => {
            canvas.toBlob((blob) => {
              if (!blob) { reject(new Error("변환 실패")); return; }
              if (blob.size <= 200 * 1024 || q <= 0.3) { resolve(blob); return; }
              q -= 0.1;
              step();
            }, "image/jpeg", q);
          };
          step();
        };
        img.onerror = reject;
        img.src = url;
      });
      // presign
      const presRes = await fetch("/api/dashboard/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content_type: "image/jpeg", upload_type: uploadType }),
      });
      if (!presRes.ok) throw new Error("presign 실패");
      const { upload_url, public_url } = await presRes.json();
      // S3 PUT
      const putRes = await fetch(upload_url, { method: "PUT", body: compressed, headers: { "Content-Type": "image/jpeg" } });
      if (!putRes.ok) throw new Error("업로드 실패");
      onChange(public_url);
    } catch (e) {
      setErr(String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div
        className="relative w-full h-32 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden hover:border-periwinkle transition-colors"
        onClick={() => {
          if (!value) document.getElementById(`img-pick-${uploadType}`)?.click();
        }}
      >
        {value ? (
          <PreviewableImg src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1 cursor-pointer">
            <span className="text-2xl text-gray-300">📷</span>
            <span className="text-xs text-gray-400">클릭하여 이미지 선택</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {value && !uploading && (
          <button
            type="button"
            className="absolute bottom-1 right-1"
            onClick={(e) => {
              e.stopPropagation();
              document.getElementById(`img-pick-${uploadType}`)?.click();
            }}
          >
            <span className="text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">변경</span>
          </button>
        )}
      </div>
      <input
        id={`img-pick-${uploadType}`}
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   배너(Trend) 섹션
═══════════════════════════════════════════════════ */
const EMPTY_TREND = { title: "", description: "", image_url: "", blog_link: "", display_order: 0 };

function TrendForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<TrendItem>;
  onSave: (data: typeof EMPTY_TREND) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_TREND, ...initial, image_url: initial?.image_url ?? "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof EMPTY_TREND, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title.trim()) { setErr("제목을 입력해주세요."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl">
      <ImagePickerField value={form.image_url} onChange={(u) => set("image_url", u)} uploadType="trend" />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="제목 *"
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <textarea
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle resize-none"
        placeholder="설명"
        rows={2}
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="블로그 링크 (https://...)"
        value={form.blog_link}
        onChange={(e) => set("blog_link", e.target.value)}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 shrink-0">노출 순서</label>
        <input
          type="number"
          className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
          value={form.display_order}
          onChange={(e) => set("display_order", Number(e.target.value))}
        />
        <span className="text-xs text-gray-400">(작을수록 먼저 표시)</span>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white">
          취소
        </button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function BannerSection() {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const orderChanged = JSON.stringify(items.map((t) => t.id)) !== JSON.stringify(savedIds);

  useEffect(() => {
    fetch("/api/dashboard/admin/trends")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setItems(list);
        setSavedIds(list.map((t: TrendItem) => t.id));
      })
      .catch(() => setErr("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    setItems((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    setErr("");
    try {
      await Promise.all(
        items.map((t, idx) =>
          fetch(`/api/dashboard/admin/trends/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: idx }),
          })
        )
      );
      setItems((prev) => prev.map((t, idx) => ({ ...t, display_order: idx })));
      setSavedIds(items.map((t) => t.id));
    } catch {
      setErr("순서 저장에 실패했습니다.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function create(data: typeof EMPTY_TREND) {
    const res = await fetch("/api/dashboard/admin/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, display_order: items.length }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setItems((prev) => [...prev, d]);
    setSavedIds((prev) => [...prev, d.id]);
    setShowForm(false);
  }

  async function update(id: number, data: typeof EMPTY_TREND) {
    const res = await fetch(`/api/dashboard/admin/trends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "수정 실패");
    setItems((prev) => prev.map((t) => (t.id === id ? d : t)));
    setEditId(null);
  }

  async function remove(id: number) {
    if (!confirm("배너를 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/admin/trends/${id}`, { method: "DELETE" });
    if (!res.ok) { setErr("삭제 실패"); return; }
    setItems((prev) => prev.filter((t) => t.id !== id));
    setSavedIds((prev) => prev.filter((x) => x !== id));
  }

  if (loading) return <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      <div className="flex flex-col gap-2 mb-3">
        {items.map((t, idx) =>
          editId === t.id ? (
            <TrendForm
              key={t.id}
              initial={{ ...t }}
              onSave={(d) => update(t.id, d)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <div key={t.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
              {/* 순서 이동 버튼 */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▼
                </button>
              </div>
              {t.image_url ? (
                <PreviewableImg src={t.image_url} alt={t.title} className="w-20 h-12 object-cover rounded-lg shrink-0 bg-gray-200" />
              ) : (
                <div className="w-20 h-12 rounded-lg bg-gray-200 shrink-0 flex items-center justify-center">
                  <span className="text-gray-400 text-xs">없음</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                {t.description && <p className="text-xs text-gray-400 truncate mt-0.5">{t.description}</p>}
                {t.blog_link && (
                  <a href={t.blog_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-periwinkle hover:underline">
                    블로그 →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditId(t.id)} className="text-xs text-gray-400 hover:text-periwinkle px-1.5 py-1 rounded hover:bg-gray-100">
                  수정
                </button>
                <button onClick={() => remove(t.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 rounded hover:bg-red-50">
                  삭제
                </button>
              </div>
            </div>
          )
        )}
        {items.length === 0 && !showForm && (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400">등록된 배너가 없습니다.</p>
          </div>
        )}
      </div>
      {/* 순서 저장 버튼 */}
      {orderChanged && !showForm && (
        <button
          onClick={saveOrder}
          disabled={savingOrder}
          className="w-full py-2.5 mb-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-60 transition-colors"
        >
          {savingOrder ? "저장 중..." : "순서 저장"}
        </button>
      )}
      {showForm ? (
        <TrendForm onSave={create} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 배너 추가
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   팝업(PopupCampaign) 섹션
═══════════════════════════════════════════════════ */
const toLocalDT = (iso: string) => iso ? iso.slice(0, 16).replace(" ", "T") : "";
const EMPTY_POPUP = { title: "", image_url: "", instagram_url: "", start_at: "", end_at: "", is_active: true, display_order: 0 };

function PopupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<PopupItem>;
  onSave: (data: typeof EMPTY_POPUP) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    ...EMPTY_POPUP,
    ...initial,
    image_url: initial?.image_url ?? "",
    start_at: initial?.start_at ? toLocalDT(initial.start_at) : "",
    end_at: initial?.end_at ? toLocalDT(initial.end_at) : "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (k: keyof typeof EMPTY_POPUP, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title.trim()) { setErr("제목을 입력해주세요."); return; }
    if (!form.image_url) { setErr("이미지를 업로드해주세요."); return; }
    if (!form.start_at || !form.end_at) { setErr("기간을 입력해주세요."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl">
      <ImagePickerField value={form.image_url} onChange={(u) => set("image_url", u)} uploadType="popup" />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="제목 *"
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="인스타그램 링크 (https://...)"
        value={form.instagram_url}
        onChange={(e) => set("instagram_url", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">시작일시 *</label>
          <input
            type="datetime-local"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            value={form.start_at}
            onChange={(e) => set("start_at", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">종료일시 *</label>
          <input
            type="datetime-local"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            value={form.end_at}
            onChange={(e) => set("end_at", e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4 accent-periwinkle" />
          <span className="text-xs text-gray-600">활성화</span>
        </label>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">노출 순서</label>
          <input
            type="number"
            className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
            value={form.display_order}
            onChange={(e) => set("display_order", Number(e.target.value))}
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function PopupSection() {
  const [items, setItems] = useState<PopupItem[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const orderChanged = JSON.stringify(items.map((p) => p.id)) !== JSON.stringify(savedIds);

  useEffect(() => {
    fetch("/api/dashboard/admin/popup-campaigns")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setItems(list);
        setSavedIds(list.map((p: PopupItem) => p.id));
      })
      .catch(() => setErr("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    setItems((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    setErr("");
    try {
      await Promise.all(
        items.map((p, idx) =>
          fetch(`/api/dashboard/admin/popup-campaigns/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: idx }),
          })
        )
      );
      setItems((prev) => prev.map((p, idx) => ({ ...p, display_order: idx })));
      setSavedIds(items.map((p) => p.id));
    } catch {
      setErr("순서 저장에 실패했습니다.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function create(data: typeof EMPTY_POPUP) {
    const res = await fetch("/api/dashboard/admin/popup-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, display_order: items.length }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "생성 실패");
    setItems((prev) => [...prev, d]);
    setSavedIds((prev) => [...prev, d.id]);
    setShowForm(false);
  }

  async function update(id: number, data: typeof EMPTY_POPUP) {
    const res = await fetch(`/api/dashboard/admin/popup-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "수정 실패");
    setItems((prev) => prev.map((p) => (p.id === id ? d : p)));
    setEditId(null);
  }

  async function remove(id: number) {
    if (!confirm("팝업을 삭제할까요?")) return;
    const res = await fetch(`/api/dashboard/admin/popup-campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) { setErr("삭제 실패"); return; }
    setItems((prev) => prev.filter((p) => p.id !== id));
    setSavedIds((prev) => prev.filter((x) => x !== id));
  }

  async function toggleActive(p: PopupItem) {
    const res = await fetch(`/api/dashboard/admin/popup-campaigns/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    const d = await res.json();
    if (res.ok) setItems((prev) => prev.map((x) => (x.id === p.id ? d : x)));
  }

  const fmtDate = (iso: string) => iso ? iso.slice(0, 10) : "";
  const now = new Date().toISOString();

  if (loading) return <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      <div className="flex flex-col gap-2 mb-3">
        {items.map((p, idx) =>
          editId === p.id ? (
            <PopupForm
              key={p.id}
              initial={p}
              onSave={(d) => update(p.id, d)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
              {/* 순서 이동 버튼 */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-navy hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ▼
                </button>
              </div>
              {p.image_url ? (
                <PreviewableImg src={p.image_url} alt={p.title} className="w-20 h-12 object-cover rounded-lg shrink-0 bg-gray-200" />
              ) : (
                <div className="w-20 h-12 rounded-lg bg-gray-200 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                  {p.end_at < now ? (
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">종료</span>
                  ) : p.is_active ? (
                    <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full shrink-0">활성</span>
                  ) : (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">비활성</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400">{fmtDate(p.start_at)} ~ {fmtDate(p.end_at)}</p>
                {p.instagram_url && (
                  <a href={p.instagram_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-periwinkle hover:underline">
                    인스타그램 →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(p)}
                  className={`text-xs px-1.5 py-1 rounded transition-colors ${
                    p.is_active ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"
                  }`}
                >
                  {p.is_active ? "중단" : "활성"}
                </button>
                <button onClick={() => setEditId(p.id)} className="text-xs text-gray-400 hover:text-periwinkle px-1.5 py-1 rounded hover:bg-gray-100">
                  수정
                </button>
                <button onClick={() => remove(p.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 rounded hover:bg-red-50">
                  삭제
                </button>
              </div>
            </div>
          )
        )}
        {items.length === 0 && !showForm && (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400">등록된 팝업이 없습니다.</p>
          </div>
        )}
      </div>
      {/* 순서 저장 버튼 */}
      {orderChanged && !showForm && (
        <button
          onClick={saveOrder}
          disabled={savingOrder}
          className="w-full py-2.5 mb-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-60 transition-colors"
        >
          {savingOrder ? "저장 중..." : "순서 저장"}
        </button>
      )}
      {showForm ? (
        <PopupForm onSave={create} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 팝업 추가
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 배너 & 팝업
═══════════════════════════════════════════════════ */
export default function ContentTab() {
  return (
    <div className="flex flex-col gap-4">
      {/* 슬랙 메시징 세팅 (구 "주간 배너 자동화" — 학기/월/주차 폴더 세팅, 자동화) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">슬랙 메시징 세팅</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              학기 → 월 → 주차 폴더별로 타입/사진/식당을 세팅하면 슬랙으로 자동 발송되고,
              마케팅팀이 슬랙에서 승인하거나 피드백을 남길 수 있어요.
            </p>
          </div>
        </div>
        <div className="p-4">
          <WeeklyAutomationComposer />
        </div>
      </div>
      {/* 배너 스튜디오 — 사진 위 텍스트·그라디언트 직접 편집 (2026-08-26부터 위 슬랙
          메시징 세팅 1·2주차 안에도 같은 컴포넌트가 일괄 생성용으로 들어가 있다 —
          여기 이 사본은 주차와 무관하게 자유롭게 써보거나 PNG로만 내려받고 싶을 때용.
          "배너랩"(사진×문구 조합 자동화+AI 리터치)은 이 도구로 대체되어 제거됐다.) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">배너 스튜디오 — 직접 편집</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              배경 사진 위에 텍스트·그라디언트·이미지 에셋을 직접 배치해 PNG로 뽑는 수동 편집기 · 특정 주차와 무관하게 자유롭게 써보거나 다운로드만 하고 싶을 때 여기서
            </p>
          </div>
        </div>
        <div className="p-4">
          <BannerStudioComposer />
        </div>
      </div>
      {/* 배너 (기존 수동 URL 등록) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">배너</h2>
            <p className="text-xs text-gray-400 mt-0.5">앱 메인화면 슬라이드 · GET /trends/trend_list/</p>
          </div>
        </div>
        <div className="p-4">
          <BannerSection />
        </div>
      </div>
      {/* 팝업 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">팝업</h2>
            <p className="text-xs text-gray-400 mt-0.5">앱 실행 시 표시 · GET /trends/popup_campaigns/</p>
          </div>
        </div>
        <div className="p-4">
          <PopupSection />
        </div>
      </div>
    </div>
  );
}
