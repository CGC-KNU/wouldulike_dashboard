"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BannerRatio } from "./types";
import { MonthFolder, PaidRestaurant, Semester, SemesterDetail, WeekFolder } from "./typesWeekly";

/**
 * 주간 배너 자동화 — Phase A (2026-08-18 착수).
 *
 * 학기를 만들면 월×주차 폴더가 자동 생성된다. 여기서는 폴더별 설정(공통 프롬프트,
 * 사진, 4주차 학생회명, 1·2·4주차 제외 식당)까지만 한다 — 크론/AI생성/슬랙 발송은
 * 다음 단계(Phase B)에서 붙는다.
 */

const RATIO_OPTIONS: { value: BannerRatio; label: string }[] = [
  { value: "4:5", label: "4:5 세로" },
  { value: "1:1", label: "1:1 정사각" },
  { value: "9:16", label: "9:16 스토리" },
  { value: "16:9", label: "16:9 가로" },
];

export default function WeeklyAutomationComposer() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SemesterDetail | null>(null);
  const [paidRestaurants, setPaidRestaurants] = useState<PaidRestaurant[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [err, setErr] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newStartMonth, setNewStartMonth] = useState(9);
  const [newEndMonth, setNewEndMonth] = useState(12);
  const [creating, setCreating] = useState(false);

  const loadSemesters = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/bannerlab/weekly/semesters");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSemesters(data.semesters ?? []);
      else setErr(data.detail ?? "학기 목록을 불러오지 못했습니다.");
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
      const res = await fetch(`/api/bannerlab/weekly/semesters/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDetail(data);
      else setErr(data.detail ?? "학기를 불러오지 못했습니다.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadPaidRestaurants = useCallback(async () => {
    try {
      const res = await fetch("/api/bannerlab/weekly/paid-restaurants");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPaidRestaurants(data.restaurants ?? []);
    } catch {
      // 조용히 무시 — 식당 목록 없이도 나머지 설정은 가능해야 한다
    }
  }, []);

  useEffect(() => {
    loadSemesters();
    loadPaidRestaurants();
  }, [loadSemesters, loadPaidRestaurants]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function createSemester() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setErr("");
    try {
      const res = await fetch("/api/bannerlab/weekly/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          year: newYear,
          start_month: newStartMonth,
          end_month: newEndMonth,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.detail ?? "학기 생성에 실패했습니다.");
        return;
      }
      setNewTitle("");
      setShowNew(false);
      await loadSemesters();
      setSelectedId(data.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteSemester() {
    if (!detail) return;
    if (!confirm(`"${detail.title}" 학기와 그 안의 모든 월/주차 폴더를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await fetch(`/api/bannerlab/weekly/semesters/${detail.id}`, { method: "DELETE" });
    setSelectedId(null);
    await loadSemesters();
  }

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-[11px] text-red-600">{err}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle min-w-[220px]"
        >
          <option value="">학기 선택{loadingList ? " (불러오는 중...)" : ""}</option>
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.start_month}~{s.end_month}월)
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1.5 hover:bg-periwinkle/5"
        >
          {showNew ? "닫기" : "+ 새 학기"}
        </button>
        {detail && (
          <button
            onClick={deleteSemester}
            className="text-[11px] font-semibold text-red-500 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 ml-auto"
          >
            학기 삭제
          </button>
        )}
      </div>

      {showNew && (
        <div className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="학기 이름 (예: 2026-2학기)"
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(Number(e.target.value))}
              className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              placeholder="연도"
            />
            <select
              value={newStartMonth}
              onChange={(e) => setNewStartMonth(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월 시작
                </option>
              ))}
            </select>
            <span className="text-gray-300 text-xs">~</span>
            <select
              value={newEndMonth}
              onChange={(e) => setNewEndMonth(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월 종료
                </option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-gray-400">
            학기를 만들면 {Math.max(0, newEndMonth - newStartMonth + 1)}개월 × 4주차 폴더가 자동으로 생성돼요.
          </p>
          <button
            onClick={createSemester}
            disabled={creating || !newTitle.trim()}
            className="self-start text-[11px] font-semibold text-white bg-navy rounded-lg px-3 py-1.5 hover:bg-periwinkle disabled:opacity-40"
          >
            {creating ? "생성 중..." : "학기 만들기"}
          </button>
        </div>
      )}

      {loadingDetail && <p className="text-xs text-gray-300 py-4 text-center">불러오는 중...</p>}

      {detail && !loadingDetail && (
        <div className="flex flex-col gap-5">
          {detail.months.map((m) => (
            <MonthSection key={m.id} month={m} paidRestaurants={paidRestaurants} onChanged={() => loadDetail(detail.id)} />
          ))}
        </div>
      )}

      {!detail && !loadingDetail && (
        <p className="text-xs text-gray-300 text-center py-6">학기를 선택하거나 새로 만들어주세요.</p>
      )}
    </div>
  );
}

function MonthSection({
  month,
  paidRestaurants,
  onChanged,
}: {
  month: MonthFolder;
  paidRestaurants: PaidRestaurant[];
  onChanged: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-navy mb-2">{month.month}월</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {month.weeks.map((w) => (
          <WeekFolderCard key={w.id} week={w} paidRestaurants={paidRestaurants} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function WeekFolderCard({
  week,
  paidRestaurants,
  onChanged,
}: {
  week: WeekFolder;
  paidRestaurants: PaidRestaurant[];
  onChanged: () => void;
}) {
  const [promptText, setPromptText] = useState(week.prompt_text);
  const [tone, setTone] = useState(week.tone);
  const [fontLabel, setFontLabel] = useState(week.font_label);
  const [ratio, setRatio] = useState<BannerRatio>(week.ratio);
  const [effect, setEffect] = useState(week.effect);
  const [councilName, setCouncilName] = useState(week.student_council_name);
  const [excluded, setExcluded] = useState<Set<number>>(new Set(week.excluded_restaurant_ids));
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showRestaurants, setShowRestaurants] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty =
    promptText !== week.prompt_text ||
    tone !== week.tone ||
    fontLabel !== week.font_label ||
    ratio !== week.ratio ||
    effect !== week.effect ||
    councilName !== week.student_council_name ||
    excluded.size !== week.excluded_restaurant_ids.length ||
    [...excluded].some((id) => !week.excluded_restaurant_ids.includes(id));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/weeks/${week.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_text: promptText,
          tone,
          font_label: fontLabel,
          ratio,
          effect,
          student_council_name: councilName,
          excluded_restaurant_ids: [...excluded],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "저장에 실패했습니다.");
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(kind: "popup" | "banner", files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const pres = await fetch(`/api/bannerlab/weekly/weeks/${week.id}/${kind}-photo/presign`, {
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
      const reg = await fetch(`/api/bannerlab/weekly/weeks/${week.id}/${kind}-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: p.key }),
      });
      const r = await reg.json().catch(() => ({}));
      if (!reg.ok) alert(r.detail ?? "사진 등록 실패");
      else onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploadingPhoto(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto(kind: "popup" | "banner") {
    await fetch(`/api/bannerlab/weekly/weeks/${week.id}/${kind}-photo`, { method: "DELETE" });
    onChanged();
  }

  async function generateNow(forceNew: boolean) {
    const msg = forceNew
      ? "이미 생성된 후보가 있어도 다시 만들까요? 슬랙에 새 메시지가 또 발송됩니다."
      : "지금 이 주차 배너(+팝업)를 생성해서 슬랙으로 보낼까요? (AI/슬랙 호출 비용이 듭니다)";
    if (!confirm(msg)) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/weeks/${week.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_new: forceNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "생성에 실패했습니다.");
        return;
      }
      if (data.status === "skipped") {
        alert(`건너뜀: ${data.reason ?? "이미 생성됨"}`);
      } else {
        const errCount = (data.errors ?? []).length;
        alert(
          `완료 — 총 ${data.total}건 중 신규 ${data.created}건, 재사용 ${data.reused}건${errCount ? `, 실패 ${errCount}건` : ""}. 슬랙 채널을 확인해주세요.`
        );
      }
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function toggleExcluded(id: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isMileage = week.type === "mileage";
  const isCouncil = week.type === "council";
  const usesPaidRestaurants = !isMileage; // 1·2·4주차 — 유료 식당 전체 기반

  return (
    <div className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-700">
          {week.week_number}주차 · {week.type_label.split("· ")[1] ?? week.type_label}
        </p>
        {dirty && <span className="text-[9px] text-amber-500">저장 안 됨</span>}
      </div>

      <div className="flex flex-col gap-1 text-[10px] text-gray-400 bg-gray-50 rounded-lg px-2 py-1.5">
        <div className="flex items-center justify-between">
          <span>노출 시작(예정): {week.week_start}</span>
          {!week.targets_summary.generated && <span>아직 생성 안 됨</span>}
        </div>
        {week.targets_summary.generated && (
          <>
            <div className="flex items-center justify-between">
              <span>배너</span>
              <span className="text-periwinkle font-semibold">
                {week.targets_summary.banner.selected}/{week.targets_summary.banner.total}개 선택
                {week.targets_summary.banner.reused > 0 ? ` · 재사용 ${week.targets_summary.banner.reused}` : ""}
                {week.targets_summary.banner.applied > 0 ? ` · 앱 반영 ${week.targets_summary.banner.applied}` : ""}
              </span>
            </div>
            {week.targets_summary.popup.total > 0 && (
              <div className="flex items-center justify-between">
                <span>팝업</span>
                <span className="text-periwinkle font-semibold">
                  {week.targets_summary.popup.selected}/{week.targets_summary.popup.total}개 선택
                  {week.targets_summary.popup.applied > 0 ? ` · 앱 반영 ${week.targets_summary.popup.applied}` : ""}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <textarea
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        placeholder="공통 프롬프트 — 문구 톤/스타일 지시문 (모든 배너에 동일 적용)"
        rows={2}
        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle resize-none"
      />
      <div className="flex items-center gap-1.5">
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="톤 (예: 밝고 화사하게)"
          className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
        />
        <select
          value={ratio}
          onChange={(e) => setRatio(e.target.value as BannerRatio)}
          className="text-[11px] border border-gray-200 rounded-lg px-1 py-1.5"
        >
          {RATIO_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={fontLabel}
          onChange={(e) => setFontLabel(e.target.value)}
          placeholder="폰트"
          className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
        />
        <input
          value={effect}
          onChange={(e) => setEffect(e.target.value)}
          placeholder="효과 메모 (선택)"
          className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
        />
      </div>

      {isCouncil && (
        <input
          value={councilName}
          onChange={(e) => setCouncilName(e.target.value)}
          placeholder="학생회명 (예: OO대학 학생회) — 배너에 '~학생회에 적용' 문구로 들어감"
          className="text-[11px] border border-periwinkle/30 bg-periwinkle/5 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
        />
      )}

      {/* 3주차: 배너용 사진 1장 */}
      {isMileage && (
        <PhotoSlot
          label="배너용 사진 (앱 전체 공통 1개 — 팝업도 이 결과물을 비율만 바꿔 재사용)"
          url={week.banner_photo_url}
          uploading={uploadingPhoto}
          onUpload={(f) => uploadPhoto("banner", f)}
          onRemove={() => removePhoto("banner")}
        />
      )}

      {/* 1·2·4주차: 팝업용 대표 사진 1장 + 유료 식당 목록 */}
      {usesPaidRestaurants && (
        <>
          <PhotoSlot
            label="팝업용 대표 사진 1장 (식당별 아님 — 이 주차를 대표하는 사진 1장)"
            url={week.popup_photo_url}
            uploading={uploadingPhoto}
            onUpload={(f) => uploadPhoto("popup", f)}
            onRemove={() => removePhoto("popup")}
          />
          <button
            onClick={() => setShowRestaurants((v) => !v)}
            className="self-start text-[10px] text-periwinkle font-semibold"
          >
            {showRestaurants ? "식당 목록 접기" : `유료 식당 목록 보기 (${paidRestaurants.length - excluded.size}/${paidRestaurants.length}개 포함)`}
          </button>
          {showRestaurants && (
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1 border border-gray-100 rounded-lg p-1.5">
              {paidRestaurants.length === 0 && (
                <p className="text-[10px] text-gray-300 px-1 py-1">유료 식당이 없습니다.</p>
              )}
              {paidRestaurants.map((r) => (
                <label key={r.restaurant_id} className="flex items-center gap-1.5 text-[10px] px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={!excluded.has(r.restaurant_id)}
                    onChange={() => toggleExcluded(r.restaurant_id)}
                    className="accent-periwinkle"
                  />
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded bg-gray-100 shrink-0" />
                  )}
                  <span className="truncate">{r.name}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
      />

      <div className="flex items-center justify-between">
        <button
          onClick={() => generateNow(week.targets_summary.generated)}
          disabled={generating}
          className="text-[10px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1 hover:bg-periwinkle/5 disabled:opacity-30"
        >
          {generating ? "생성 중..." : week.targets_summary.generated ? "다시 생성해서 발송" : "지금 생성해서 슬랙 발송"}
        </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-[10px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1 hover:bg-periwinkle disabled:opacity-30"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  url,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  url: string;
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {url ? (
        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 group shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            className="absolute top-0 right-0 w-4 h-4 rounded-full bg-black/50 text-white text-[9px] opacity-0 group-hover:opacity-100"
          >
            ×
          </button>
        </div>
      ) : (
        <label className="w-12 h-12 shrink-0 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-[9px] text-periwinkle cursor-pointer">
          {uploading ? "..." : "+ 사진"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
        </label>
      )}
      <p className="text-[10px] text-gray-400 flex-1">{label}</p>
    </div>
  );
}
