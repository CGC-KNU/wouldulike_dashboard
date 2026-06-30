"use client";

import { useEffect, useState, useCallback } from "react";
import ImageUploader from "@/components/ImageUploader";

/* ─── 타입 ─── */
interface Restaurant {
  restaurant_id: number;
  name: string;
  tier: string | null;
  is_affiliate?: boolean;
}
interface Stats {
  revisit_this_month: number;
  loyal_total: number;
  coupon_redeemed_this_month: number;
  stamp_earned_this_month: number;
}
type SortKey = "name" | "tier" | "id";
type SortDir = "asc" | "desc";
type Tab = "restaurants" | "content" | "settings";

/* ─── 상수 ─── */
const TIER_ORDER: Record<string, number> = { CONTENT: 3, BOOST: 2, FREE: 1 };
const TIER_STYLE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600",
  BOOST: "bg-amber-100 text-amber-700",
  CONTENT: "bg-indigo-100 text-indigo-700",
};
const DUMMY_CAMPAIGNS = [
  { id: 1, restaurant: "정든밤", title: "여름 특가 10% 쿠폰", submitted: "2026-06-24", status: "검수중" },
  { id: 2, restaurant: "봄봄김밥", title: "단골 무료 음료 이벤트", submitted: "2026-06-23", status: "검수중" },
  { id: 3, restaurant: "오마카세 숲", title: "주말 한정 세트 할인", submitted: "2026-06-22", status: "반영됨" },
];
const CAMPAIGN_STATUS_STYLE: Record<string, string> = {
  검수중: "bg-amber-100 text-amber-700",
  반영됨: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-500",
};

/* ─── 유틸 ─── */
function parseS3Info(url: string): { name: string; uploadedAt: string | null } {
  try {
    const filename = decodeURIComponent(url.split("/").pop() ?? "");
    const match = filename.match(/^(\d{8})_(\d{6})_(.+)_[a-f0-9]{6}\.\w+$/);
    if (match) {
      const [, date, time, rawName] = match;
      const d = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
      const t = `${time.slice(0, 2)}:${time.slice(2, 4)}`;
      return { name: rawName.replace(/_/g, " ") || filename, uploadedAt: `${d} ${t}` };
    }
    return { name: filename, uploadedAt: null };
  } catch {
    return { name: url, uploadedAt: null };
  }
}

function sortRestaurants(list: Restaurant[], key: SortKey, dir: SortDir) {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "name") cmp = a.name.localeCompare(b.name, "ko");
    else if (key === "tier") cmp = (TIER_ORDER[b.tier ?? ""] ?? 0) - (TIER_ORDER[a.tier ?? ""] ?? 0);
    else cmp = a.restaurant_id - b.restaurant_id;
    return dir === "asc" ? cmp : -cmp;
  });
}

/* ═══════════════════════════════════════════════════
   식당 드로어
═══════════════════════════════════════════════════ */
function RestaurantDrawer({
  r,
  onClose,
  onUpdated,
  onDeleted,
}: {
  r: Restaurant;
  onClose: () => void;
  onUpdated: (updated: Partial<Restaurant>) => void;
  onDeleted: (id: number) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [deleteStep, setDeleteStep] = useState<null | "confirm1" | "confirm2">(null);
  const [secondaryPw, setSecondaryPw] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    fetch(`/api/dashboard/stats?rid=${r.restaurant_id}`)
      .then((res) => res.json())
      .then((data) => setStats(data.stats ?? null))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [r.restaurant_id]);

  async function toggleAffiliate() {
    setActionPending(true);
    const res = await fetch(`/api/dashboard/admin/restaurants/${r.restaurant_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_affiliate: !r.is_affiliate }),
    });
    if (res.ok) onUpdated({ is_affiliate: !r.is_affiliate });
    setActionPending(false);
  }

  async function confirmDelete() {
    if (!secondaryPw) { setDeleteError("2차 비밀번호를 입력해주세요."); return; }
    setActionPending(true);
    setDeleteError("");
    const res = await fetch(`/api/dashboard/admin/restaurants/${r.restaurant_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondary_password: secondaryPw }),
    });
    const data = await res.json();
    if (res.ok) { onDeleted(r.restaurant_id); onClose(); }
    else setDeleteError(data.detail ?? "삭제에 실패했습니다.");
    setActionPending(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 pb-8 pt-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-navy">{r.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">ID {r.restaurant_id}</span>
                {r.tier ? (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_STYLE[r.tier] ?? "bg-gray-100 text-gray-500"}`}>
                    {r.tier}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">미등록</span>
                )}
                {r.is_affiliate === false && (
                  <span className="text-xs font-semibold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">비활성</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1">✕</button>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">이번 달 통계</p>
            {statsLoading ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "재방문 단골", value: stats.revisit_this_month, unit: "명" },
                  { label: "누적 단골", value: stats.loyal_total, unit: "명" },
                  { label: "쿠폰 사용", value: stats.coupon_redeemed_this_month, unit: "건" },
                  { label: "스탬프 적립", value: stats.stamp_earned_this_month, unit: "건" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="bg-white rounded-lg p-3">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xl font-bold text-navy mt-0.5">
                      {value}<span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-1">통계를 불러오지 못했습니다.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <a
                href={`/dashboard/owner?rid=${r.restaurant_id}`}
                className="flex-1 py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold text-center hover:bg-navy transition-colors"
              >
                사장님 모드
              </a>
              <a
                href={`/dashboard/admin/restaurants/${r.restaurant_id}`}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold text-center hover:bg-gray-200 transition-colors"
              >
                자세히 보기 →
              </a>
            </div>
            <button
              onClick={toggleAffiliate}
              disabled={actionPending}
              className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                r.is_affiliate === false
                  ? "bg-green-50 text-green-600 hover:bg-green-100"
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}
            >
              {actionPending ? "처리 중..." : r.is_affiliate === false ? "활성화" : "비활성화"}
            </button>
            {deleteStep === null && (
              <button
                onClick={() => setDeleteStep("confirm1")}
                className="text-xs text-gray-300 hover:text-red-400 transition-colors py-1 text-center"
              >
                식당 삭제
              </button>
            )}
            {deleteStep === "confirm1" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-600 mb-1">정말 삭제하시겠습니까?</p>
                <p className="text-xs text-red-400 mb-3">
                  <strong>{r.name}</strong> 식당이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteStep(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
                  <button onClick={() => { setDeleteStep("confirm2"); setDeleteError(""); }} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold">계속</button>
                </div>
              </div>
            )}
            {deleteStep === "confirm2" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-600 mb-3">2차 비밀번호를 입력하세요</p>
                <input
                  type="password"
                  value={secondaryPw}
                  onChange={(e) => setSecondaryPw(e.target.value)}
                  placeholder="2차 비밀번호"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg mb-2 focus:outline-none focus:border-red-400 bg-white"
                />
                {deleteError && <p className="text-xs text-red-500 mb-2">{deleteError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setDeleteStep(null); setSecondaryPw(""); setDeleteError(""); }} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white">취소</button>
                  <button onClick={confirmDelete} disabled={actionPending} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold disabled:opacity-60">
                    {actionPending ? "삭제 중..." : "삭제 확인"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════
   미디어 매니저 (배너 / 팝업 공용)
═══════════════════════════════════════════════════ */
function MediaManager({
  title,
  initialUrls,
  uploadType,
  maxItems = 10,
  onSave,
}: {
  title: string;
  initialUrls: string[];
  uploadType: "banner" | "popup";
  maxItems?: number;
  onSave: (urls: string[]) => Promise<void>;
}) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [showUploader, setShowUploader] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // parent initialUrls 변경 시 내부 state 동기화
  useEffect(() => {
    setUrls(initialUrls);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialUrls)]);

  const isDirty = JSON.stringify(urls) !== JSON.stringify(initialUrls);

  async function save(nextUrls = urls) {
    setSaving(true);
    setError("");
    try {
      await onSave(nextUrls);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function remove(idx: number) {
    setUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {/* 등록된 이미지 목록 */}
      {urls.length > 0 ? (
        <div className="flex flex-col gap-2 mb-4">
          {urls.map((url, i) => {
            const info = parseS3Info(url);
            return (
              <div key={url} className="flex items-center gap-3 bg-gray-50 rounded-xl p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={info.name}
                  className="w-20 h-12 object-cover rounded-lg shrink-0 bg-gray-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{info.name}</p>
                  {info.uploadedAt && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{info.uploadedAt} 업로드</p>
                  )}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-periwinkle hover:underline"
                  >
                    원본 보기 →
                  </a>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-gray-300">#{i + 1}</span>
                  <button
                    onClick={() => remove(i)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-xl mb-4">
          <p className="text-xs text-gray-400">등록된 {title}이 없습니다.</p>
        </div>
      )}

      {/* 추가 업로더 토글 */}
      {urls.length < maxItems && (
        <div className="mb-3">
          <button
            onClick={() => setShowUploader((s) => !s)}
            className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
          >
            {showUploader ? "▲ 닫기" : `+ ${title} 추가`}
          </button>
          {showUploader && (
            <div className="mt-2 p-3 bg-gray-50 rounded-xl">
              <ImageUploader
                initialUrls={[]}
                onSave={async (newUrls) => {
                  const merged = [...urls, ...newUrls];
                  setUrls(merged);
                  setShowUploader(false);
                  await save(merged);
                }}
                maxImages={maxItems - urls.length}
                uploadType={uploadType}
                label={title}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {/* 삭제 후 변경사항 저장 버튼 */}
      {isDirty && !showUploader && (
        <button
          onClick={() => save()}
          disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-periwinkle text-white hover:bg-navy transition-colors disabled:opacity-60"
        >
          {saving ? "저장 중..." : "변경사항 저장"}
        </button>
      )}
      {saved && !isDirty && (
        <p className="text-xs text-green-600 text-center py-1">✓ 저장되었습니다</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 배너 & 팝업
═══════════════════════════════════════════════════ */
function ContentTab() {
  const [bannerUrls, setBannerUrls] = useState<string[]>([]);
  const [popupUrls, setPopupUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // S3 복구 관련
  const [s3Scanning, setS3Scanning] = useState(false);
  const [s3Data, setS3Data] = useState<{ banners: string[]; popups: string[] } | null>(null);
  const [s3Error, setS3Error] = useState("");
  const [s3Importing, setS3Importing] = useState(false);

  // 진단 (DB 키 확인)
  const [showDebug, setShowDebug] = useState(false);
  const [debugData, setDebugData] = useState<{ key: string; value_preview: string | null }[] | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/admin/banner-popup")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setBannerUrls(data.banner_urls ?? []);
        setPopupUrls(data.popup_urls ?? []);
      })
      .catch((e) => setFetchError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function saveBanner(urls: string[]) {
    const res = await fetch("/api/dashboard/admin/banner-popup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banner_urls: urls }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? `저장 실패 (HTTP ${res.status})`);
    }
    setBannerUrls(urls);
  }

  async function savePopup(urls: string[]) {
    const res = await fetch("/api/dashboard/admin/banner-popup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ popup_urls: urls }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? `저장 실패 (HTTP ${res.status})`);
    }
    setPopupUrls(urls);
  }

  async function scanS3() {
    setS3Scanning(true);
    setS3Error("");
    setS3Data(null);
    try {
      const res = await fetch("/api/dashboard/admin/banner-popup/s3-scan");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setS3Data({ banners: data.banners ?? [], popups: data.popups ?? [] });
    } catch (e) {
      setS3Error(String(e));
    } finally {
      setS3Scanning(false);
    }
  }

  async function importFromS3() {
    if (!s3Data) return;
    setS3Importing(true);
    try {
      if (s3Data.banners.length > 0) await saveBanner(s3Data.banners);
      if (s3Data.popups.length > 0) await savePopup(s3Data.popups);
      setS3Data(null);
    } catch (e) {
      setS3Error(String(e));
    } finally {
      setS3Importing(false);
    }
  }

  async function loadDebug() {
    setDebugLoading(true);
    try {
      const res = await fetch("/api/dashboard/admin/config-debug");
      const data = await res.json();
      setDebugData(data.records ?? []);
    } catch {
      setDebugData([]);
    } finally {
      setDebugLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isEmpty = bannerUrls.length === 0 && popupUrls.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* 오류 또는 데이터 없음 — S3 복구 패널 */}
      {(fetchError || isEmpty) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-700 mb-1">
            {fetchError ? "데이터 로드 오류" : "등록된 이미지가 없습니다"}
          </p>
          <p className="text-xs text-amber-600 mb-3">
            {fetchError
              ? `${fetchError} — DB 저장이 실패했을 수 있습니다.`
              : "이전에 업로드한 파일이 S3에 남아 있다면 아래에서 복구할 수 있습니다."}
          </p>

          {/* S3 스캔 */}
          {!s3Data && (
            <button
              onClick={scanS3}
              disabled={s3Scanning}
              className="w-full py-2 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {s3Scanning ? "S3 스캔 중..." : "S3에서 파일 찾기"}
            </button>
          )}
          {s3Error && <p className="text-xs text-red-500 mt-2">{s3Error}</p>}

          {s3Data && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-amber-700 mb-2">
                S3 발견: 배너 {s3Data.banners.length}개 · 팝업 {s3Data.popups.length}개
              </p>
              {s3Data.banners.length === 0 && s3Data.popups.length === 0 ? (
                <p className="text-xs text-amber-600">S3에도 파일이 없습니다. 새로 업로드해 주세요.</p>
              ) : (
                <>
                  {/* 배너 미리보기 */}
                  {s3Data.banners.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-amber-600 mb-1">배너</p>
                      <div className="flex gap-2 flex-wrap">
                        {s3Data.banners.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={url} src={url} alt="" className="w-24 h-14 object-cover rounded-lg bg-gray-200" />
                        ))}
                      </div>
                    </div>
                  )}
                  {s3Data.popups.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-amber-600 mb-1">팝업</p>
                      <div className="flex gap-2 flex-wrap">
                        {s3Data.popups.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={url} src={url} alt="" className="w-24 h-14 object-cover rounded-lg bg-gray-200" />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setS3Data(null)}
                      className="flex-1 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-semibold"
                    >
                      취소
                    </button>
                    <button
                      onClick={importFromS3}
                      disabled={s3Importing}
                      className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-60 transition-colors"
                    >
                      {s3Importing ? "저장 중..." : "DB에 저장하기"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 진단: AdminConfig 키 목록 */}
          <button
            onClick={() => {
              setShowDebug((s) => !s);
              if (!showDebug && !debugData) loadDebug();
            }}
            className="mt-3 text-xs text-amber-500 underline"
          >
            {showDebug ? "진단 숨기기" : "DB 키 목록 확인 (진단)"}
          </button>
          {showDebug && (
            <div className="mt-2 bg-white rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">AdminConfig 전체 레코드</p>
              {debugLoading ? (
                <p className="text-xs text-gray-400">로딩 중...</p>
              ) : debugData && debugData.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {debugData.map((rec) => (
                    <li key={rec.key} className="text-xs font-mono bg-gray-50 rounded px-2 py-1">
                      <span className="text-indigo-600">{rec.key}</span>
                      {rec.value_preview && (
                        <span className="text-gray-400 ml-2 break-all">{rec.value_preview.slice(0, 80)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">
                  {debugData === null ? "로드 전" : "레코드 없음 (테이블 비어 있음)"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 배너 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">배너</h2>
            <p className="text-xs text-gray-400 mt-0.5">앱 메인화면 슬라이드에 표시</p>
          </div>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {bannerUrls.length} / 10
          </span>
        </div>
        <div className="p-4">
          <MediaManager
            title="배너"
            initialUrls={bannerUrls}
            uploadType="banner"
            maxItems={10}
            onSave={saveBanner}
          />
        </div>
      </div>

      {/* 팝업 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">팝업</h2>
            <p className="text-xs text-gray-400 mt-0.5">앱 실행 시 표시되는 팝업 이미지</p>
          </div>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {popupUrls.length} / 5
          </span>
        </div>
        <div className="p-4">
          <MediaManager
            title="팝업"
            initialUrls={popupUrls}
            uploadType="popup"
            maxItems={5}
            onSave={savePopup}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 비밀번호 / 관리자 설정
═══════════════════════════════════════════════════ */
function SettingsTab() {
  const [activeForm, setActiveForm] = useState<null | "main" | "secondary">(null);
  const [form, setForm] = useState({ current: "", next: "", next2: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(type: "main" | "secondary") {
    if (form.next !== form.next2) { setMsg({ ok: false, text: "새 비밀번호가 일치하지 않습니다." }); return; }
    if (form.next.length < 4) { setMsg({ ok: false, text: "4자 이상 입력해주세요." }); return; }
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/dashboard/admin/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, current_password: form.current, new_password: form.next }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ ok: true, text: "변경되었습니다." });
      setForm({ current: "", next: "", next2: "" });
      setActiveForm(null);
    } else {
      setMsg({ ok: false, text: data.detail ?? "변경에 실패했습니다." });
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">관리자 비밀번호</h2>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {msg && (
          <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
            {msg.text}
          </p>
        )}
        <button
          onClick={() => { setActiveForm(activeForm === "main" ? null : "main"); setMsg(null); }}
          className="text-left text-sm font-medium text-gray-700 py-2 flex items-center justify-between"
        >
          일반 비밀번호 변경
          <span className="text-gray-400 text-xs">{activeForm === "main" ? "▲" : "▶"}</span>
        </button>
        {activeForm === "main" && (
          <div className="flex flex-col gap-2 pb-2">
            {(["현재 비밀번호", "새 비밀번호", "새 비밀번호 확인"] as const).map((label, i) => {
              const key = (["current", "next", "next2"] as const)[i];
              return (
                <input
                  key={key}
                  type="password"
                  placeholder={label}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
                />
              );
            })}
            <button onClick={() => submit("main")} disabled={saving} className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}

        <hr className="border-gray-100" />

        <button
          onClick={() => { setActiveForm(activeForm === "secondary" ? null : "secondary"); setMsg(null); }}
          className="text-left text-sm font-medium text-gray-700 py-2 flex items-center justify-between"
        >
          2차 비밀번호 설정 (삭제 확인용)
          <span className="text-gray-400 text-xs">{activeForm === "secondary" ? "▲" : "▶"}</span>
        </button>
        {activeForm === "secondary" && (
          <div className="flex flex-col gap-2 pb-2">
            <input type="password" placeholder="현재 2차 비밀번호 (최초 설정 시 빈칸)" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            <input type="password" placeholder="새 2차 비밀번호" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            <input type="password" placeholder="새 2차 비밀번호 확인" value={form.next2} onChange={(e) => setForm((f) => ({ ...f, next2: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle" />
            <button onClick={() => submit("secondary")} disabled={saving} className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold disabled:opacity-60">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   탭: 식당 관리
═══════════════════════════════════════════════════ */
function RestaurantsTab() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Restaurant | null>(null);

  const fetchRestaurants = useCallback((query: string) => {
    setLoading(true);
    const url = query
      ? `/api/dashboard/restaurants?search=${encodeURIComponent(query)}`
      : "/api/dashboard/restaurants";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setRestaurants(data.restaurants ?? []))
      .catch(() => setRestaurants([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRestaurants(""); }, [fetchRestaurants]);
  useEffect(() => {
    const timer = setTimeout(() => fetchRestaurants(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchRestaurants]);

  const sorted = sortRestaurants(restaurants, sortKey, sortDir);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-periwinkle ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleUpdated(updated: Partial<Restaurant>) {
    if (!selected) return;
    const next = { ...selected, ...updated };
    setSelected(next);
    setRestaurants((prev) => prev.map((r) => (r.restaurant_id === next.restaurant_id ? next : r)));
  }

  function handleDeleted(id: number) {
    setRestaurants((prev) => prev.filter((r) => r.restaurant_id !== id));
  }

  return (
    <>
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "전체 식당", value: loading ? "—" : restaurants.length },
          { label: "검수 대기", value: DUMMY_CAMPAIGNS.filter((c) => c.status === "검수중").length },
          { label: "이번 달 활성 유저", value: 317 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-navy mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* 캠페인 검수 */}
      <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">캠페인 검수</h2>
          <span className="text-xs text-amber-600 font-semibold">
            {DUMMY_CAMPAIGNS.filter((c) => c.status === "검수중").length}건 대기
          </span>
        </div>
        <ul className="divide-y divide-gray-50">
          {DUMMY_CAMPAIGNS.map((c) => (
            <li key={c.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.restaurant} · {c.submitted}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${CAMPAIGN_STATUS_STYLE[c.status]}`}>
                {c.status}
              </span>
              {c.status === "검수중" && (
                <div className="flex gap-1.5 shrink-0">
                  <button className="text-xs px-3 py-1 bg-green-100 text-green-700 font-semibold rounded-lg">승인</button>
                  <button className="text-xs px-3 py-1 bg-red-50 text-red-500 font-semibold rounded-lg">반려</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 식당 목록 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 shrink-0">제휴 식당</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="식당명 검색..."
            className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
          />
          <span className="text-xs text-gray-400 shrink-0">{loading ? "..." : `${sorted.length}개`}</span>
        </div>
        <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          <button onClick={() => toggleSort("id")} className="w-10 text-left font-medium hover:text-navy">
            ID <SortIcon k="id" />
          </button>
          <button onClick={() => toggleSort("name")} className="flex-1 text-left font-medium hover:text-navy">
            식당명 <SortIcon k="name" />
          </button>
          <button onClick={() => toggleSort("tier")} className="w-20 text-right font-medium hover:text-navy">
            플랜 <SortIcon k="tier" />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            {search ? "검색 결과가 없습니다." : "식당 목록을 불러오지 못했습니다."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map((r) => (
              <li
                key={r.restaurant_id}
                onClick={() => setSelected(r)}
                className={`flex items-center px-4 py-3 gap-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                  r.is_affiliate === false ? "opacity-50" : ""
                }`}
              >
                <span className="w-10 text-xs text-gray-400 shrink-0">{r.restaurant_id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                  {r.is_affiliate === false && (
                    <span className="text-[10px] text-red-400 font-medium">비활성</span>
                  )}
                </div>
                <div className="w-20 flex justify-end">
                  {r.tier ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_STYLE[r.tier] ?? "bg-gray-100 text-gray-500"}`}>
                      {r.tier}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">미등록</span>
                  )}
                </div>
                <span className="text-xs text-gray-300 shrink-0">›</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <RestaurantDrawer
          r={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════
   메인 페이지
═══════════════════════════════════════════════════ */
const TABS: { key: Tab; label: string }[] = [
  { key: "restaurants", label: "식당 관리" },
  { key: "content", label: "배너 & 팝업" },
  { key: "settings", label: "관리자 설정" },
];

export default function AdminHomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("restaurants");

  return (
    <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto">
      {/* 탭 헤더 */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === key
                ? "bg-white text-navy shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === "restaurants" && <RestaurantsTab />}
      {activeTab === "content" && <ContentTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}
