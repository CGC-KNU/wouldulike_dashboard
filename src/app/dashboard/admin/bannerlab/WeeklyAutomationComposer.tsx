"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BannerRatio } from "./types";
import {
  AiDiagnostics,
  FigmaTemplate,
  MonthFolder,
  PaidRestaurant,
  Semester,
  SemesterDetail,
  WeekFolder,
  WeekType,
  WeeklyTarget,
} from "./typesWeekly";

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

const TYPE_OPTIONS: { value: WeekType; label: string }[] = [
  { value: "general", label: "일반 배너 홍보" },
  { value: "coupon", label: "한정 쿠폰 발급" },
  { value: "mileage", label: "마일리지 2배 이벤트" },
  { value: "council", label: "학생회 배너 홍보" },
];

const TIER_BADGE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-500",
  BOOST: "bg-amber-50 text-amber-600",
  CONTENT: "bg-periwinkle/10 text-periwinkle",
};

export default function WeeklyAutomationComposer() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SemesterDetail | null>(null);
  const [selectedMonthId, setSelectedMonthId] = useState<number | null>(null);
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

  // silent=true — 사진 업로드/삭제 등 부분 변경 후 갱신할 때 쓴다. loadingDetail을
  // 켜지 않아서 화면이 통째로 언마운트-리마운트되지 않고(펼쳐둔 패널·입력 중이던 값이
  // 안 날아가고) 데이터만 조용히 교체된다. 최초 진입/학기 전환 시에는 silent=false로
  // 로딩 표시를 보여준다.
  const loadDetail = useCallback(async (id: number, silent = false) => {
    if (!silent) setLoadingDetail(true);
    setErr("");
    try {
      const res = await fetch(`/api/bannerlab/weekly/semesters/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDetail(data);
      else setErr(data.detail ?? "학기를 불러오지 못했습니다.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      if (!silent) setLoadingDetail(false);
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
    setSelectedMonthId(null); // 학기를 바꾸면 월 선택도 초기화
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
        <div className="flex flex-col gap-3">
          <select
            value={selectedMonthId ?? ""}
            onChange={(e) => setSelectedMonthId(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle self-start min-w-[140px]"
          >
            <option value="">월 선택</option>
            {detail.months.map((m) => (
              <option key={m.id} value={m.id}>
                {m.month}월
              </option>
            ))}
          </select>

          {selectedMonthId == null && (
            <p className="text-xs text-gray-300 text-center py-6">월을 선택하면 그 달의 주차를 확인할 수 있어요.</p>
          )}

          {detail.months
            .filter((m) => m.id === selectedMonthId)
            .map((m) => (
              <MonthSection key={m.id} month={m} paidRestaurants={paidRestaurants} onChanged={() => loadDetail(detail.id, true)} />
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
      <div className="flex flex-col gap-3">
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
  const [type, setType] = useState<WeekType>(week.type);
  const [captionText, setCaptionText] = useState(week.caption_text);
  const [promptText, setPromptText] = useState(week.prompt_text);
  const [tone, setTone] = useState(week.tone);
  const [fontLabel, setFontLabel] = useState(week.font_label);
  const [ratio, setRatio] = useState<BannerRatio>(week.ratio);
  const [effect, setEffect] = useState(week.effect);
  const [councilName, setCouncilName] = useState(week.student_council_name);
  const [figmaTemplateId, setFigmaTemplateId] = useState<number | null>(week.figma_template_id);
  const [excluded, setExcluded] = useState<Set<number>>(new Set(week.excluded_restaurant_ids));
  const [included, setIncluded] = useState<Set<number>>(new Set(week.included_restaurant_ids));
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showRestaurants, setShowRestaurants] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiDiag, setAiDiag] = useState<AiDiagnostics | null>(null);
  const [checkingAiDiag, setCheckingAiDiag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty =
    type !== week.type ||
    captionText !== week.caption_text ||
    promptText !== week.prompt_text ||
    tone !== week.tone ||
    fontLabel !== week.font_label ||
    ratio !== week.ratio ||
    effect !== week.effect ||
    councilName !== week.student_council_name ||
    figmaTemplateId !== week.figma_template_id ||
    excluded.size !== week.excluded_restaurant_ids.length ||
    [...excluded].some((id) => !week.excluded_restaurant_ids.includes(id)) ||
    included.size !== week.included_restaurant_ids.length ||
    [...included].some((id) => !week.included_restaurant_ids.includes(id));

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/weeks/${week.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          caption_text: captionText,
          prompt_text: promptText,
          tone,
          font_label: fontLabel,
          ratio,
          effect,
          student_council_name: councilName,
          figma_template_id: figmaTemplateId,
          excluded_restaurant_ids: [...excluded],
          included_restaurant_ids: [...included],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "저장에 실패했습니다.");
        return false;
      }
      onChanged();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(kind: "popup" | "banner" | "template", files: FileList | null) {
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

  async function removePhoto(kind: "popup" | "banner" | "template") {
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
        // 실제 생성은 백엔드가 백그라운드로 돌린다(대상마다 AI 호출이 직렬로 이어져
        // 몇 분씩 걸릴 수 있어서, 2026-08-24부터 요청을 붙잡지 않고 바로 응답한다).
        alert("생성을 시작했습니다 — 대상별로 준비되는 대로 슬랙 채널에 순서대로 올라옵니다.");
      }
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  /**
   * "지금 생성"은 실제 OpenAI/슬랙 호출이라 비용이 든다 — 그 전에 AI 후보가 애초에
   * 시도라도 될 조건인지(OPENAI_API_KEY·prompt_text) 공짜로 미리 확인하는 버튼.
   * 백엔드 WeekAIDiagnosticsView는 이미 있었는데 이 버튼이 없어서 아무도 못 쓰고
   * 있었다 (2026-08-23 마무리).
   *
   * 진단은 서버(DB)에 저장된 값을 본다 — 화면에 프롬프트를 막 입력만 하고 "저장"을
   * 안 누른 채 이 버튼을 누르면 아직 반영 안 된 옛 값(예: 빈 prompt_text)을 보고
   * "비어있음"이라고 잘못 알려주는 문제가 있었다(2026-08-24, RD 보고). 그래서 dirty
   * 상태면 진단 전에 먼저 조용히 저장부터 한다.
   */
  async function checkAiDiagnostics() {
    if (dirty) {
      const ok = await save();
      if (!ok) return; // 저장 실패했으면 옛 값으로 진단해봐야 의미 없다
    }
    setCheckingAiDiag(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/weeks/${week.id}/ai-diagnostics`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "진단에 실패했습니다.");
        return;
      }
      setAiDiag(d);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCheckingAiDiag(false);
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

  function toggleIncluded(id: number) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 유료(플랜 설정된) 식당은 기본으로 체크되어 있고(체크 해제 시 excluded에 기록),
  // 무료/플랜 미설정 식당은 기본으로 비어 있고(체크 시 included에 기록) 둘 다 표시해서
  // 유료·무료를 한눈에 볼 수 있게 한다.
  function isChecked(r: PaidRestaurant) {
    return r.is_paid ? !excluded.has(r.restaurant_id) : included.has(r.restaurant_id);
  }

  function toggleRestaurant(r: PaidRestaurant) {
    if (r.is_paid) toggleExcluded(r.restaurant_id);
    else toggleIncluded(r.restaurant_id);
  }

  const isMileage = type === "mileage";
  const isCouncil = type === "council";
  const usesPaidRestaurants = !isMileage; // 1·2·4주차 — 유료 식당 전체 기반

  return (
    <div className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-gray-700 shrink-0">{week.week_number}주차</p>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as WeekType)}
          className="flex-1 text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-periwinkle"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {dirty && <span className="text-[9px] text-amber-500 shrink-0">저장 안 됨</span>}
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

      {/* 배너에 실제로 찍히는 문구 — AI 지시문(prompt_text)과 분리(2026-08-24, RD 요청).
          예전엔 한 칸이 캡션과 AI 지시문을 겸해서, AI 리터치 호출에 캡션 문구가 그대로
          섞여 들어가 gpt-image-1이 그 문구를 사진에 실제로 그려 넣는 사고가 있었다. */}
      <input
        value={captionText}
        onChange={(e) => setCaptionText(e.target.value)}
        placeholder="배너 문구 — 배너에 실제로 찍히는 짧은 문구 (예: 비오는 날 뜨끈한 해물크림짬뽕 어떠세요?)"
        maxLength={200}
        className="text-[11px] border border-periwinkle/30 bg-periwinkle/5 rounded-lg px-2 py-1.5 mt-1.5 focus:outline-none focus:border-periwinkle"
      />
      <textarea
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        placeholder="AI 사진 보정 지시문 — 톤/분위기/효과 (여기는 문구가 아니라 사진에만 적용됩니다)"
        rows={2}
        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 my-1.5 focus:outline-none focus:border-periwinkle resize-none"
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

      {/* 디자인 템플릿(프레임/로고 등) — 이 주차의 모든 배너/팝업 맨 위에 공통으로 얹힘 */}
      <PhotoSlot
        label="템플릿 사진 (선택 — 프레임/로고 등, 투명 배경 PNG 권장. 문구까지 얹은 결과 맨 위에 합성됨)"
        url={week.template_photo_url}
        uploading={uploadingPhoto}
        onUpload={(f) => uploadPhoto("template", f)}
        onRemove={() => removePhoto("template")}
      />

      {/* 피그마 템플릿(선택) — AI 다듬기 시 이 프레임의 색감·구도를 무드 참고사진으로 삼는다 */}
      <FigmaTemplatePicker value={figmaTemplateId} onChange={setFigmaTemplateId} />

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
            {showRestaurants
              ? "식당 목록 접기"
              : `식당 목록 보기 (${paidRestaurants.filter((r) => isChecked(r)).length}/${paidRestaurants.length}개 포함)`}
          </button>
          {showRestaurants && (
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1 border border-gray-100 rounded-lg p-1.5">
              {paidRestaurants.length === 0 && (
                <p className="text-[10px] text-gray-300 px-1 py-1">
                  플랜이 지정된 식당이 없습니다. 식당 관리 탭에서 먼저 플랜을 설정해주세요.
                </p>
              )}
              {paidRestaurants.map((r) => (
                <div key={r.restaurant_id} className="flex flex-col gap-1 px-1 py-1.5 border-b border-gray-50 last:border-0">
                  <label className="flex items-center gap-1.5 text-[10px]">
                    <input
                      type="checkbox"
                      checked={isChecked(r)}
                      onChange={() => toggleRestaurant(r)}
                      className="accent-periwinkle shrink-0"
                    />
                    <span
                      className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                        r.is_paid ? TIER_BADGE[r.tier ?? ""] ?? "bg-periwinkle/10 text-periwinkle" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {r.is_paid ? r.tier ?? "유료" : "무료"}
                    </span>
                    <span className="truncate flex-1">{r.name}</span>
                    {r.photos.length === 0 && <span className="text-[9px] text-red-400 shrink-0">사진 없음</span>}
                  </label>
                  {/* 소재 사진 리스트 — "첫 번째 등록 사진이 안 불러와진다"는 문제를 눈으로 바로 확인할 수 있게
                      전부 보여준다. 가로 폭에 안 들어가면 잘라서 숨기지 않고 옆으로 슬라이드해서 본다. */}
                  {r.photos.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto pl-5 pb-0.5">
                      {r.photos.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt=""
                          title={i === 0 ? "소재 사진(자동 사용됨)" : "등록된 사진"}
                          className={`w-20 h-20 rounded-lg object-cover shrink-0 ${i === 0 ? "ring-2 ring-periwinkle" : "opacity-60"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
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
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => generateNow(week.targets_summary.generated)}
            disabled={generating}
            className="text-[10px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1 hover:bg-periwinkle/5 disabled:opacity-30"
          >
            {generating ? "생성 중..." : week.targets_summary.generated ? "다시 생성해서 발송" : "지금 생성해서 슬랙 발송"}
          </button>
          <button
            onClick={checkAiDiagnostics}
            disabled={checkingAiDiag || saving}
            title={
              dirty
                ? "OpenAI 호출 없이 무료로 확인합니다 — 저장 안 된 변경사항이 있어 먼저 저장한 뒤 진단합니다"
                : "OpenAI를 실제로 호출하지 않고, AI 후보가 시도될 조건인지만 무료로 확인합니다"
            }
            className="text-[10px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-30"
          >
            {checkingAiDiag || (saving && dirty) ? "확인 중..." : "AI 진단 (무료)"}
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-[10px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1 hover:bg-periwinkle disabled:opacity-30"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {aiDiag && <AiDiagnosticsPanel diag={aiDiag} onClose={() => setAiDiag(null)} />}

      {week.targets_summary.generated && (
        <>
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="self-start text-[10px] text-navy font-semibold underline underline-offset-2"
          >
            {showDetail ? "자세히 보기 닫기" : "자세히 보기 (승인/피드백 · 다운로드 · 재생성)"}
          </button>
          {showDetail && <WeeklyTargetsPanel weekId={week.id} />}
        </>
      )}
    </div>
  );
}

/** "AI 진단" 결과 카드 — WeekAIDiagnosticsView 응답을 그대로 사람이 읽을 수 있게 보여준다. */
function AiDiagnosticsPanel({ diag, onClose }: { diag: AiDiagnostics; onClose: () => void }) {
  const rows: { label: string; ok: boolean; value: string }[] = [
    {
      label: "OPENAI_API_KEY",
      ok: diag.openai_key_configured,
      value: diag.openai_key_configured ? "설정됨" : "미설정",
    },
    {
      label: "AI 사진 보정 지시문(prompt_text)",
      ok: !!diag.prompt_text.trim(),
      value: diag.prompt_text.trim() ? diag.prompt_text : "비어있음",
    },
    {
      label: "배너 문구(caption_text)",
      ok: !!diag.caption_text.trim(),
      value: diag.caption_text.trim() || "비어있음 — 배너에 문구가 안 찍힘",
    },
    { label: "톤", ok: !!diag.tone.trim(), value: diag.tone.trim() || "미입력" },
    {
      label: "템플릿 사진",
      ok: diag.has_template_photo,
      value: diag.has_template_photo ? "있음" : "없음",
    },
    {
      label: "Figma 연동",
      ok: diag.figma_enabled,
      value: diag.figma_enabled ? (diag.figma_template_id ? "연동됨 · 템플릿 선택됨" : "연동됨 · 템플릿 미선택") : "미연동",
    },
  ];

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 flex flex-col gap-2 ${
        diag.would_attempt_ai ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] font-bold ${diag.would_attempt_ai ? "text-green-700" : "text-amber-700"}`}
        >
          {diag.would_attempt_ai
            ? "✅ 지금 생성하면 AI 후보를 시도합니다"
            : "⚠️ 지금 생성해도 AI 후보 없이 기본안만 나갑니다"}
        </span>
        <button onClick={onClose} className="text-[10px] text-gray-400 hover:text-gray-600">
          닫기
        </button>
      </div>

      {!diag.would_attempt_ai && diag.reasons_ai_would_be_skipped.length > 0 && (
        <p className="text-[10px] text-amber-700">
          이유: {diag.reasons_ai_would_be_skipped.join(" · ")}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-1.5 text-[10px]">
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${r.ok ? "bg-green-500" : "bg-gray-300"}`} />
            <span className="text-gray-500 shrink-0 w-32">{r.label}</span>
            <span className="text-gray-700 break-all">{r.value}</span>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-gray-400">
        실제 OpenAI 호출 없이 조건만 미리 확인한 결과입니다 — 비용 발생 없음.
      </p>
    </div>
  );
}

function WeeklyTargetsPanel({ weekId }: { weekId: number }) {
  const [targets, setTargets] = useState<WeeklyTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/weeks/${weekId}/targets`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTargets(data.targets ?? []);
    } finally {
      setLoading(false);
    }
  }, [weekId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-2 border border-gray-100 rounded-lg p-2 bg-gray-50/50">
      {loading && <p className="text-[10px] text-gray-300 text-center py-2">불러오는 중...</p>}
      {!loading && targets.length === 0 && (
        <p className="text-[10px] text-gray-300 text-center py-2">아직 생성된 대상이 없습니다.</p>
      )}
      {targets.map((t) => (
        <TargetCard key={t.id} target={t} onChanged={load} />
      ))}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  selected: "bg-emerald-50 text-emerald-600",
  skipped: "bg-gray-100 text-gray-400",
  feedback: "bg-amber-50 text-amber-600",
};

function TargetCard({ target, onChanged }: { target: WeeklyTarget; onChanged: () => void }) {
  const [promptOverride, setPromptOverride] = useState(target.prompt_override);
  const [regenerating, setRegenerating] = useState(false);

  async function regenerate() {
    if (!confirm("이 대상만 골라서 새로 생성할까요? 슬랙에 새 메시지가 발송됩니다.")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/targets/${target.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_override: promptOverride }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "재생성에 실패했습니다.");
        return;
      }
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-700 truncate">
          [{target.kind_label}] {target.restaurant_name}
        </p>
        <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[target.status] ?? "bg-gray-100"}`}>
          {target.status_label}
        </span>
      </div>

      {target.feedback_text && (
        <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1">🗣 {target.feedback_text}</p>
      )}
      {target.click_url && <p className="text-[9px] text-gray-400 truncate">이동 URL: {target.click_url}</p>}

      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
        {target.candidates.length === 0 && <p className="text-[10px] text-gray-300">후보 없음</p>}
        {target.candidates.map((c) => (
          <div key={c.id} className="relative shrink-0">
            {c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image_url}
                alt=""
                className={`w-16 h-16 rounded-lg object-cover ${c.selected ? "ring-2 ring-periwinkle" : ""}`}
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-[9px] text-gray-300">실패</div>
            )}
            <div className="flex items-center gap-1 mt-0.5">
              {c.is_ai_retouched && <span className="text-[8px] text-periwinkle font-semibold">AI</span>}
              {c.download_url && (
                <a href={c.download_url} download className="text-[8px] text-gray-400 underline">
                  다운로드
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={promptOverride}
          onChange={(e) => setPromptOverride(e.target.value)}
          placeholder="이 대상만 다른 프롬프트로 다시 만들기 (비우면 주차 공통 프롬프트 사용)"
          className="flex-1 text-[10px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-periwinkle"
        />
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="shrink-0 text-[10px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2 py-1 hover:bg-periwinkle/5 disabled:opacity-30"
        >
          {regenerating ? "생성 중..." : "다시 생성"}
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
        <div className="relative w-36 h-36 rounded-lg overflow-hidden bg-gray-100 group shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100"
          >
            ×
          </button>
        </div>
      ) : (
        <label className="w-36 h-36 shrink-0 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-periwinkle cursor-pointer">
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

/**
 * 피그마 템플릿 선택/등록 — 등록된 템플릿(파일 key + node id) 중 이 주차가 참고할
 * 것 하나를 고른다. AI 다듬기 시 이 템플릿 프레임의 렌더링 PNG를 무드 참고사진으로
 * 쓴다(services/weekly_generate.py). 등록 자체는 여기서 바로 할 수 있게 인라인
 * 미니폼을 둔다 — 별도 화면을 새로 만들 정도로 자주 쓰는 기능은 아니라서.
 */
function FigmaTemplatePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [templates, setTemplates] = useState<FigmaTemplate[]>([]);
  const [figmaEnabled, setFigmaEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [fileKey, setFileKey] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bannerlab/figma-templates");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTemplates(data.templates ?? []);
        setFigmaEnabled(data.figma_enabled ?? false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createTemplate() {
    setErr("");
    if (!name.trim() || !fileKey.trim() || !nodeId.trim()) {
      setErr("이름 · file key · node id 를 모두 입력해주세요.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/bannerlab/figma-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, file_key: fileKey, node_id: nodeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.detail ?? "등록에 실패했습니다.");
        return;
      }
      setTemplates((prev) => [data, ...prev]);
      onChange(data.id);
      setShowNew(false);
      setName("");
      setFileKey("");
      setNodeId("");
    } finally {
      setCreating(false);
    }
  }

  if (!loading && !figmaEnabled) {
    return (
      <p className="text-[10px] text-gray-300">
        피그마 템플릿 참고 기능은 아직 꺼져 있어요 (FIGMA_ACCESS_TOKEN 미설정).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
        >
          <option value="">피그마 템플릿 참고 안 함</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-[10px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2 py-1.5 shrink-0"
        >
          + 템플릿 등록
        </button>
      </div>

      {showNew && (
        <div className="flex flex-col gap-1.5 border border-gray-100 rounded-lg p-2 bg-gray-50">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="템플릿 이름 (예: 2026 가을 배너 프레임)"
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
          />
          <input
            value={fileKey}
            onChange={(e) => setFileKey(e.target.value)}
            placeholder="file key (피그마 URL의 /file/<이 부분>/...)"
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
          />
          <input
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            placeholder="node id (프레임 우클릭 → Copy link, 예: 12-34)"
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
          />
          {err && <p className="text-[10px] text-red-500">{err}</p>}
          <div className="flex justify-end">
            <button
              onClick={createTemplate}
              disabled={creating}
              className="text-[10px] font-semibold text-white bg-periwinkle rounded-lg px-2.5 py-1 disabled:opacity-40"
            >
              {creating ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
