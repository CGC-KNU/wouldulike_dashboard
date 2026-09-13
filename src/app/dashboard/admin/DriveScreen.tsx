"use client";

/**
 * 드라이브 — 팀원들이 콘텐츠 관리(트렌드·팝업·기획전) 화면에서 등록한 이미지 파일들을
 * 한곳에 모아 누구나(직무·권한 무관) 다운로드할 수 있게 하는 화면. TABS 권한 시스템과
 * 무관하게 노출되는 제품(PRODUCTS의 drive 항목, tabs: [])이라 RestaurantsTab처럼
 * can_* 권한 체크 없이 바로 렌더링된다.
 */

import { useEffect, useState } from "react";
import { PreviewableImg } from "@/components/ImagePreview";

interface TrendItem {
  id: number;
  title: string;
  image_url: string | null;
  created_at: string;
}
interface PopupItem {
  id: number;
  title: string;
  image_url: string;
  created_at: string;
}
interface FeaturedCampaign {
  id: number;
  title: string;
  image_url: string;
  starts_at: string;
}

type Category = "trend" | "popup" | "featured";

interface DriveFile {
  key: string;
  category: Category;
  title: string;
  imageUrl: string;
  date: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  trend: "트렌드",
  popup: "팝업",
  featured: "기획전",
};
const CATEGORY_STYLE: Record<Category, string> = {
  trend: "bg-indigo-50 text-indigo-600",
  popup: "bg-amber-50 text-amber-700",
  featured: "bg-periwinkle/10 text-periwinkle",
};

function filenameFromUrl(url: string) {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const base = path.split("/").pop();
    return base && base.trim() ? base : "download";
  } catch {
    return "download";
  }
}

// /api/download-proxy는 같은 오리진에서 Content-Disposition: attachment로
// 다시 내려주기 때문에, S3 URL을 새 탭으로 직접 열 때 생기는 한글 파일명
// 인코딩 문제(다운로드 대신 미리보기로 열리는 문제 포함) 없이 항상 다운로드된다.
function downloadHref(imageUrl: string, title: string) {
  const ext = filenameFromUrl(imageUrl).match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const params = new URLSearchParams({ url: imageUrl, filename: `${title}${ext}` });
  return `/api/download-proxy?${params.toString()}`;
}

export default function DriveScreen() {
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/admin/trends").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/dashboard/admin/popup-campaigns").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/dashboard/admin/featured-campaigns").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([trends, popups, featured]: [TrendItem[], PopupItem[], FeaturedCampaign[]]) => {
        const list: DriveFile[] = [
          ...(Array.isArray(trends) ? trends : [])
            .filter((t) => t.image_url)
            .map((t) => ({
              key: `trend-${t.id}`,
              category: "trend" as const,
              title: t.title,
              imageUrl: t.image_url!,
              date: t.created_at,
            })),
          ...(Array.isArray(popups) ? popups : [])
            .filter((p) => p.image_url)
            .map((p) => ({
              key: `popup-${p.id}`,
              category: "popup" as const,
              title: p.title,
              imageUrl: p.image_url,
              date: p.created_at,
            })),
          ...(Array.isArray(featured) ? featured : [])
            .filter((f) => f.image_url)
            .map((f) => ({
              key: `featured-${f.id}`,
              category: "featured" as const,
              title: f.title,
              imageUrl: f.image_url,
              date: f.starts_at,
            })),
        ].sort((a, b) => (a.date < b.date ? 1 : -1));
        setFiles(list);
      })
      .catch(() => setErr("파일 목록을 불러오지 못했습니다."));
  }, []);

  const shown = files?.filter((f) => filter === "all" || f.category === filter) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          트렌드 · 팝업 · 기획전에 등록된 이미지를 모아 볼 수 있습니다. 카드를 눌러 크게 보거나 다운로드하세요.
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5 w-fit">
        {([
          { key: "all", label: "전체" },
          { key: "trend", label: "트렌드" },
          { key: "popup", label: "팝업" },
          { key: "featured", label: "기획전" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === key ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      {files === null ? (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <p className="text-sm text-gray-400">등록된 파일이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {shown.map((f) => (
            <div key={f.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <PreviewableImg
                src={f.imageUrl}
                alt={f.title}
                className="w-full aspect-square object-cover bg-gray-100"
              />
              <div className="p-3">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_STYLE[f.category]}`}>
                  {CATEGORY_LABEL[f.category]}
                </span>
                <p className="text-xs font-semibold text-gray-700 mt-1.5 truncate" title={f.title}>
                  {f.title}
                </p>
                <a
                  href={downloadHref(f.imageUrl, f.title)}
                  className="mt-2 block w-full py-1.5 rounded-lg bg-periwinkle/10 text-periwinkle text-xs font-bold text-center hover:bg-periwinkle hover:text-white transition-colors"
                >
                  다운로드
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
