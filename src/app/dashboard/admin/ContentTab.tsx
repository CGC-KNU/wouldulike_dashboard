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
  is_active: boolean;
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
interface FeaturedItem {
  id?: number;
  restaurant_id: number | null;
  badge: string;
  benefit_title: string;
  benefit_subtitle: string;
  image_url: string;
  link_url: string;
  sort_order: number;
}
interface FeaturedCampaign {
  id: number;
  code: string;
  title: string;
  subtitle: string;
  zone: string;
  image_url: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  sort_order: number;
  items: FeaturedItem[];
}

/* ═══════════════════════════════════════════════════
   인라인 이미지 업로드 필드 (폼 내부용)
═══════════════════════════════════════════════════ */
function ImagePickerField({
  value,
  onChange,
  uploadType,
  inputId,
}: {
  value: string;
  onChange: (url: string) => void;
  uploadType: "trend" | "popup" | "large_banner" | "featured_banner";
  inputId?: string;
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
          if (!value) document.getElementById(inputId ?? `img-pick-${uploadType}`)?.click();
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
              document.getElementById(inputId ?? `img-pick-${uploadType}`)?.click();
            }}
          >
            <span className="text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">변경</span>
          </button>
        )}
      </div>
      <input
        id={inputId ?? `img-pick-${uploadType}`}
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
   기획전 배너 — 앱 홈 캐러셀 (GET /api/promotions/featured/current/)
   기간은 화면에서 한국시간으로 넣고, 저장 시 UTC로 보냄.
═══════════════════════════════════════════════════ */
function nowKstInput() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function plusYearsKstInput(years: number) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCFullYear(kst.getUTCFullYear() + years);
  return kst.toISOString().slice(0, 16);
}
function isoToKstInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function kstInputToApi(local: string) {
  const [date, time = "00:00"] = local.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hh, mm) - 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function isFeaturedLive(c: FeaturedCampaign) {
  const now = Date.now();
  const start = new Date(c.starts_at).getTime();
  const end = new Date(c.ends_at).getTime();
  return c.active && !Number.isNaN(start) && !Number.isNaN(end) && start <= now && now <= end && (c.items?.length ?? 0) > 0;
}
function itemPayload(items: FeaturedItem[]) {
  return items.map((it, idx) => ({
    restaurant_id: it.restaurant_id,
    badge: it.badge ?? "",
    benefit_title: it.benefit_title ?? "",
    benefit_subtitle: it.benefit_subtitle ?? "",
    image_url: it.image_url ?? "",
    link_url: it.link_url ?? "",
    sort_order: idx,
  }));
}

const EMPTY_FEATURED_ITEM = {
  restaurant_id: null as number | null,
  badge: "",
  benefit_title: "",
  benefit_subtitle: "",
  image_url: "",
  link_url: "",
  sort_order: 0,
};

function FeaturedItemForm({
  inputId,
  onSave,
  onCancel,
}: {
  inputId: string;
  onSave: (data: typeof EMPTY_FEATURED_ITEM) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FEATURED_ITEM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!form.image_url) { setErr("이미지를 업로드해주세요."); return; }
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
    <div className="flex flex-col gap-3 p-4 bg-white rounded-xl border border-gray-100">
      <ImagePickerField
        value={form.image_url}
        onChange={(u) => setForm((f) => ({ ...f, image_url: u }))}
        uploadType="featured_banner"
        inputId={inputId}
      />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="제목 (앱 카드 문구, 선택)"
        value={form.benefit_title}
        onChange={(e) => setForm((f) => ({ ...f, benefit_title: e.target.value }))}
      />
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
        placeholder="연결 링크 (https://..., 선택)"
        value={form.link_url}
        onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
      />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
        <button type="button" onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function FeaturedCampaignSection() {
  const [campaigns, setCampaigns] = useState<FeaturedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [addingItemFor, setAddingItemFor] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({
    title: "",
    starts_at: nowKstInput(),
    ends_at: plusYearsKstInput(1),
    image_url: "",
    link_url: "",
  });

  useEffect(() => {
    fetch("/api/dashboard/admin/featured-campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(Array.isArray(d) ? d : []))
      .catch(() => setErr("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function replaceCampaign(next: FeaturedCampaign) {
    setCampaigns((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }

  async function patchCampaign(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/dashboard/admin/featured-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail ?? "저장 실패");
    replaceCampaign(d);
    return d as FeaturedCampaign;
  }

  async function toggleOpen(c: FeaturedCampaign) {
    setErr("");
    setSavingId(c.id);
    try {
      if (c.active) {
        await patchCampaign(c.id, { active: false });
        return;
      }
      const now = nowKstInput();
      const ends = isoToKstInput(c.ends_at);
      await patchCampaign(c.id, {
        active: true,
        starts_at: kstInputToApi(now),
        ends_at: kstInputToApi(!ends || ends <= now ? plusYearsKstInput(1) : ends),
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function savePeriod(c: FeaturedCampaign, starts: string, ends: string) {
    setErr("");
    try {
      await patchCampaign(c.id, {
        starts_at: kstInputToApi(starts),
        ends_at: kstInputToApi(ends),
      });
    } catch (e) {
      setErr(String(e));
    }
  }

  async function saveItems(c: FeaturedCampaign, items: FeaturedItem[]) {
    setErr("");
    try {
      await patchCampaign(c.id, { items: itemPayload(items) });
    } catch (e) {
      setErr(String(e));
    }
  }

  async function addItem(c: FeaturedCampaign, data: typeof EMPTY_FEATURED_ITEM) {
    await saveItems(c, [...(c.items ?? []), { ...data, sort_order: c.items?.length ?? 0 }]);
    setAddingItemFor(null);
  }

  async function removeItem(c: FeaturedCampaign, idx: number) {
    if (!confirm("이 배너를 삭제할까요?")) return;
    await saveItems(c, (c.items ?? []).filter((_, i) => i !== idx));
  }

  function moveItem(c: FeaturedCampaign, idx: number, dir: -1 | 1) {
    const next = idx + dir;
    const items = [...(c.items ?? [])];
    if (next < 0 || next >= items.length) return;
    [items[idx], items[next]] = [items[next], items[idx]];
    setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, items } : x)));
  }

  async function persistItemOrder(c: FeaturedCampaign) {
    await saveItems(c, c.items ?? []);
  }

  async function createCampaign() {
    if (!createForm.title.trim()) { setErr("제목을 입력해주세요."); return; }
    if (!createForm.image_url) { setErr("이미지를 업로드해주세요."); return; }
    setErr("");
    const res = await fetch("/api/dashboard/admin/featured-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `BANNER_${Date.now().toString(36).toUpperCase()}`.slice(0, 40),
        title: createForm.title.trim(),
        starts_at: kstInputToApi(createForm.starts_at),
        ends_at: kstInputToApi(createForm.ends_at),
        active: true,
        sort_order: campaigns.length,
        items: [{
          ...EMPTY_FEATURED_ITEM,
          benefit_title: createForm.title.trim(),
          image_url: createForm.image_url,
          link_url: createForm.link_url,
        }],
      }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.detail ?? "생성 실패"); return; }
    setCampaigns((prev) => [...prev, d]);
    setShowCreate(false);
    setCreateForm({ title: "", starts_at: nowKstInput(), ends_at: plusYearsKstInput(1), image_url: "", link_url: "" });
    setOpenId(d.id);
  }

  async function removeCampaign(id: number) {
    if (!confirm("기획전을 삭제할까요? 앱에서도 바로 내려갑니다.")) return;
    const res = await fetch(`/api/dashboard/admin/featured-campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) { setErr("삭제 실패"); return; }
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    if (openId === id) setOpenId(null);
  }

  if (loading) return <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      <div className="flex flex-col gap-2 mb-3">
        {campaigns.map((c) => {
          const live = isFeaturedLive(c);
          const expanded = openId === c.id;
          return (
            <div key={c.id} className="bg-gray-50 rounded-xl p-2.5">
              <div className="flex items-center gap-2">
                {c.items?.[0]?.image_url ? (
                  <PreviewableImg src={c.items[0].image_url} alt={c.title} className="w-16 h-20 object-cover rounded-lg shrink-0 bg-gray-200" />
                ) : (
                  <div className="w-16 h-20 rounded-lg bg-gray-200 shrink-0 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">없음</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.title || "(제목 없음)"}</p>
                    {live ? (
                      <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full shrink-0">앱 노출</span>
                    ) : c.active ? (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">기간 밖</span>
                    ) : (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">닫힘</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">
                    {c.items?.length ?? 0}개 배너 · {isoToKstInput(c.starts_at).replace("T", " ")} ~ {isoToKstInput(c.ends_at).replace("T", " ")} (한국시간)
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={savingId === c.id}
                    onClick={() => toggleOpen(c)}
                    className={`text-xs px-1.5 py-1 rounded transition-colors ${
                      c.active ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"
                    }`}
                  >
                    {c.active ? "닫기" : "열기"}
                  </button>
                  <button onClick={() => setOpenId(expanded ? null : c.id)} className="text-xs text-gray-400 hover:text-periwinkle px-1.5 py-1 rounded hover:bg-gray-100">
                    {expanded ? "접기" : "수정"}
                  </button>
                  <button onClick={() => removeCampaign(c.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 rounded hover:bg-red-50">
                    삭제
                  </button>
                </div>
              </div>
              {expanded && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-gray-500">
                      시작 (한국시간)
                      <input
                        type="datetime-local"
                        className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        defaultValue={isoToKstInput(c.starts_at)}
                        onBlur={(e) => savePeriod(c, e.target.value, isoToKstInput(c.ends_at))}
                      />
                    </label>
                    <label className="text-[10px] text-gray-500">
                      종료 (한국시간)
                      <input
                        type="datetime-local"
                        className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                        defaultValue={isoToKstInput(c.ends_at)}
                        onBlur={(e) => savePeriod(c, isoToKstInput(c.starts_at), e.target.value)}
                      />
                    </label>
                  </div>
                  {(c.items ?? []).map((it, idx) => (
                    <div key={`${it.id ?? "n"}-${idx}`} className="flex items-center gap-2 bg-white rounded-xl p-2">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button type="button" onClick={() => moveItem(c, idx, -1)} disabled={idx === 0} className="w-6 h-6 text-xs text-gray-400 disabled:opacity-20">▲</button>
                        <button type="button" onClick={() => moveItem(c, idx, 1)} disabled={idx === (c.items?.length ?? 0) - 1} className="w-6 h-6 text-xs text-gray-400 disabled:opacity-20">▼</button>
                      </div>
                      {it.image_url ? (
                        <PreviewableImg src={it.image_url} alt="" className="w-12 h-14 object-cover rounded-lg bg-gray-200 shrink-0" />
                      ) : (
                        <div className="w-12 h-14 rounded-lg bg-gray-200 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{it.benefit_title || (it.restaurant_id ? `식당 #${it.restaurant_id}` : "(제목 없음)")}</p>
                        {it.link_url && <p className="text-[10px] text-periwinkle truncate">{it.link_url}</p>}
                      </div>
                      <button type="button" onClick={() => removeItem(c, idx)} className="text-[10px] text-gray-300 hover:text-red-400 px-1.5 py-1">삭제</button>
                    </div>
                  ))}
                  {(c.items?.length ?? 0) > 1 && (
                    <button type="button" onClick={() => persistItemOrder(c)} className="w-full py-2 rounded-xl bg-navy text-white text-xs font-bold">
                      순서 저장
                    </button>
                  )}
                  {addingItemFor === c.id ? (
                    <FeaturedItemForm
                      inputId={`featured-item-${c.id}`}
                      onSave={(d) => addItem(c, d)}
                      onCancel={() => setAddingItemFor(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingItemFor(c.id)}
                      className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle"
                    >
                      + 배너 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {campaigns.length === 0 && !showCreate && (
          <div className="text-center py-6 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400">등록된 기획전 배너가 없습니다.</p>
          </div>
        )}
      </div>
      {showCreate ? (
        <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl">
          <ImagePickerField
            value={createForm.image_url}
            onChange={(u) => setCreateForm((f) => ({ ...f, image_url: u }))}
            uploadType="featured_banner"
            inputId="featured-create"
          />
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            placeholder="제목"
            value={createForm.title}
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            placeholder="연결 링크 (https://..., 선택)"
            value={createForm.link_url}
            onChange={(e) => setCreateForm((f) => ({ ...f, link_url: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-500">
              시작 (한국시간)
              <input type="datetime-local" className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={createForm.starts_at} onChange={(e) => setCreateForm((f) => ({ ...f, starts_at: e.target.value }))} />
            </label>
            <label className="text-[10px] text-gray-500">
              종료 (한국시간)
              <input type="datetime-local" className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={createForm.ends_at} onChange={(e) => setCreateForm((f) => ({ ...f, ends_at: e.target.value }))} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
            <button type="button" onClick={createCampaign} className="flex-1 py-2 rounded-xl bg-periwinkle text-white text-sm font-bold">열고 저장</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 기획전 배너 추가
        </button>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   배너(Trend) 섹션
═══════════════════════════════════════════════════ */
const EMPTY_TREND = { title: "", description: "", image_url: "", blog_link: "", is_active: true, display_order: 0 };

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (k: keyof typeof EMPTY_TREND, v: any) => setForm((f) => ({ ...f, [k]: v }));

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
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4 accent-periwinkle" />
          <span className="text-xs text-gray-600">활성화</span>
        </label>
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

  async function toggleActive(t: TrendItem) {
    const res = await fetch(`/api/dashboard/admin/trends/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    const d = await res.json();
    if (res.ok) setItems((prev) => prev.map((x) => (x.id === t.id ? d : x)));
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
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  {t.is_active ? (
                    <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full shrink-0">활성</span>
                  ) : (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">비활성</span>
                  )}
                </div>
                {t.description && <p className="text-xs text-gray-400 truncate mt-0.5">{t.description}</p>}
                {t.blog_link && (
                  <a href={t.blog_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-periwinkle hover:underline">
                    블로그 →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(t)}
                  className={`text-xs px-1.5 py-1 rounded transition-colors ${
                    t.is_active ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"
                  }`}
                >
                  {t.is_active ? "중단" : "활성"}
                </button>
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
      {/* 기획전 배너 — 앱 홈 캐러셀. 큰 배너(LargeBanner)가 아니라 FeaturedCampaign */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">기획전 배너</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              앱 홈 캐러셀 · GET /api/promotions/featured/current/ · 열기/닫기로 노출 제어 (한국시간 기간)
            </p>
          </div>
        </div>
        <div className="p-4">
          <FeaturedCampaignSection />
        </div>
      </div>
      {/* 배너 (기존 수동 URL 등록) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">배너 (기존)</h2>
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
