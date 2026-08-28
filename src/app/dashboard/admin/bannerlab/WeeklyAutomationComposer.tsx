"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import BannerStudioComposer from "./BannerStudioComposer";
import { BannerRatio } from "./types";
import {
  AiDiagnostics,
  FigmaTemplate,
  MonthFolder,
  PaidRestaurant,
  Semester,
  SemesterDetail,
  WeekFolder,
  WeeklyCandidate,
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
  const [ratio, setRatio] = useState<BannerRatio>(week.ratio);
  const [councilName, setCouncilName] = useState(week.student_council_name);
  const [figmaTemplateId, setFigmaTemplateId] = useState<number | null>(week.figma_template_id);
  const [excluded, setExcluded] = useState<Set<number>>(new Set(week.excluded_restaurant_ids));
  const [included, setIncluded] = useState<Set<number>>(new Set(week.included_restaurant_ids));
  const [couponTexts, setCouponTexts] = useState<Record<number, string>>(() =>
    Object.fromEntries(Object.entries(week.restaurant_coupon_texts || {}).map(([k, v]) => [Number(k), v]))
  );
  // 1·2주차(배너 스튜디오) — 배너 클릭 시 이동할 URL. 식당별로 다르지 않고 그 주는
  // 전부 같은 URL을 쓰는 게 보통이라 식당마다 입력받지 않고 주차 하나에만 둔다.
  const [clickUrl, setClickUrl] = useState(week.click_url ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showRestaurants, setShowRestaurants] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiDiag, setAiDiag] = useState<AiDiagnostics | null>(null);
  const [checkingAiDiag, setCheckingAiDiag] = useState(false);
  // 슬랙 메시징 세팅 화면이 배너 스튜디오까지 품게 되면서 카드 하나가 세로로 매우
  // 길어졌다 — 학기>월을 고른 뒤엔 주차 목록을 접어두고 클릭해야 펼쳐지게 한다
  // (마케팅팀 피드백 2026-08-26: "자리를 꽤 차지하기 때문에 ... 펼쳐지지 않은
  // 상태로 보여지고, 클릭하면 편집할 수 있는 공간이 열리는 방식으로").
  const [expanded, setExpanded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // 3주차 — 완성된 사진 1장을 그대로 올리면 슬랙 없이 바로 적용된다.
  const [directFile, setDirectFile] = useState<File | null>(null);
  const [directClickUrl, setDirectClickUrl] = useState("");
  const [applyingDirect, setApplyingDirect] = useState(false);

  const dirty =
    type !== week.type ||
    captionText !== week.caption_text ||
    promptText !== week.prompt_text ||
    ratio !== week.ratio ||
    councilName !== week.student_council_name ||
    figmaTemplateId !== week.figma_template_id ||
    excluded.size !== week.excluded_restaurant_ids.length ||
    [...excluded].some((id) => !week.excluded_restaurant_ids.includes(id)) ||
    included.size !== week.included_restaurant_ids.length ||
    [...included].some((id) => !week.included_restaurant_ids.includes(id)) ||
    JSON.stringify(couponTexts) !== JSON.stringify(week.restaurant_coupon_texts || {}) ||
    clickUrl !== (week.click_url ?? "");

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
          ratio,
          student_council_name: councilName,
          figma_template_id: figmaTemplateId,
          excluded_restaurant_ids: [...excluded],
          included_restaurant_ids: [...included],
          restaurant_coupon_texts: couponTexts,
          click_url: clickUrl.trim(),
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
      : "지금 이 주차 배너(+팝업)를 생성해서 슬랙으로 보낼까요? 식당 사진은 원본을 유지하고, 템플릿을 한 번 분석한 뒤 효과·문구를 합성합니다.";
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
        // 실제 생성은 백엔드가 백그라운드로 돌린다. 식당 사진은 새로 그리지 않고
        // 원본에 효과만 입히며, 템플릿 분석은 주차당 한 번이라 예전보다 훨씬 빨리
        // 슬랙에 올라온다.
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

  /**
   * 3주차(마일리지) — 완성된 사진 1장을 올리면 슬랙 승인 절차 없이 곧바로 그 주
   * 기간 동안 앱에 반영된다(마케팅팀 피드백 2026-08-26).
   */
  async function applyDirect() {
    if (!directFile || !directClickUrl.trim()) return;
    setApplyingDirect(true);
    try {
      const presign = await fetch(`/api/bannerlab/weekly/weeks/${week.id}/studio-targets/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: directFile.name, content_type: directFile.type || "image/jpeg" }),
      });
      const p = await presign.json().catch(() => ({}));
      if (!presign.ok) {
        alert(p.detail ?? "업로드 URL 발급에 실패했습니다.");
        return;
      }
      const put = await fetch(p.upload_url, {
        method: "PUT",
        headers: { "Content-Type": directFile.type || "image/jpeg" },
        body: directFile,
      });
      if (!put.ok) {
        alert(`업로드 실패 (S3 ${put.status})`);
        return;
      }
      const res = await fetch(`/api/bannerlab/weekly/weeks/${week.id}/apply-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: p.key, click_url: directClickUrl.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail ?? "적용에 실패했습니다.");
        return;
      }
      alert("적용됐습니다 — 이번 주 기간 동안 앱에 바로 반영됩니다.");
      setDirectFile(null);
      setDirectClickUrl("");
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setApplyingDirect(false);
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

  // 1·2주차 — 배너 스튜디오 일괄 생성으로 완전히 전환(마케팅팀 피드백 2026-08-26).
  // 3주차 — 완성된 사진 1장 직접 업로드(슬랙 없이 즉시 적용). 4주차는 아직 손대지
  // 않은 예전 방식 그대로 둔다(RD: "로직은 남겨두자") — week_number로 가른다(type은
  // 관리자가 자유롭게 바꿀 수 있는 값이라 이 갈래에는 안 맞는다).
  const isStudioFlow = week.week_number === 1 || week.week_number === 2;
  const isDirectApplyFlow = week.week_number === 3;
  const isLegacyFlow = !isStudioFlow && !isDirectApplyFlow;

  return (
    <div className="rounded-xl border border-gray-100 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between gap-2 text-left p-3 pb-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold text-gray-700 shrink-0">{week.week_number}주차</span>
          <span className="text-[11px] text-gray-500 truncate">{week.type_label}</span>
          {dirty && <span className="text-[9px] text-amber-500 shrink-0">저장 안 됨</span>}
        </div>
        <span className="text-gray-300 text-[10px] shrink-0">{expanded ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      <div className="flex flex-col gap-1 text-[10px] text-gray-400 bg-gray-50 mx-3 rounded-lg px-2 py-1.5">
        <div className="flex items-center justify-between">
          <span>노출 시작(예정): {week.week_start}</span>
          {!week.targets_summary.generated && <span>아직 생성 안 됨</span>}
        </div>
        {week.targets_summary.generated && (
          <>
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setShowDetail(true);
              }}
              className="flex items-center justify-between hover:bg-periwinkle/5 rounded px-1 -mx-1 py-0.5 transition-colors"
            >
              <span>배너</span>
              <span className="text-periwinkle font-semibold">
                {week.targets_summary.banner.selected}/{week.targets_summary.banner.total}개 선택
                {week.targets_summary.banner.reused > 0 ? ` · 재사용 ${week.targets_summary.banner.reused}` : ""}
                {week.targets_summary.banner.applied > 0 ? ` · 앱 반영 ${week.targets_summary.banner.applied}` : ""}
              </span>
            </button>
            {week.targets_summary.popup.total > 0 && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(true);
                  setShowDetail(true);
                }}
                className="flex items-center justify-between hover:bg-periwinkle/5 rounded px-1 -mx-1 py-0.5 transition-colors"
              >
                <span>팝업</span>
                <span className="text-periwinkle font-semibold">
                  {week.targets_summary.popup.selected}/{week.targets_summary.popup.total}개 선택
                  {week.targets_summary.popup.applied > 0 ? ` · 앱 반영 ${week.targets_summary.popup.applied}` : ""}
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2.5 p-3 pt-0">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WeekType)}
            className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-periwinkle self-start"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {isLegacyFlow && (
            <>
              {/* 배너에 실제로 찍히는 문구 — AI 지시문(prompt_text)과 분리(2026-08-24, RD 요청).
                  예전엔 한 칸이 캡션과 AI 지시문을 겸해서, AI 리터치 호출에 캡션 문구가 그대로
                  섞여 들어가 gpt-image-1이 그 문구를 사진에 실제로 그려 넣는 사고가 있었다. */}
              <input
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="배너 문구 — 배너에 실제로 찍히는 짧은 문구 (예: 비오는 날 뜨끈한 해물크림짬뽕 어떠세요?)"
                maxLength={200}
                className="text-[11px] border border-periwinkle/30 bg-periwinkle/5 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
              />
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="원본 사진에 입힐 톤/분위기 (예: 밝고 화사하게, 가장자리를 살짝 어둡게) — 사진을 새로 만들지 않고 효과만 적용됩니다"
                rows={3}
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle resize-none"
              />
              <div className="flex items-center gap-1.5">
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

              {isCouncil && (
                <input
                  value={councilName}
                  onChange={(e) => setCouncilName(e.target.value)}
                  placeholder="학생회명 (예: OO대학 학생회) — 배너에 '~학생회에 적용' 문구로 들어감"
                  className="text-[11px] border border-periwinkle/30 bg-periwinkle/5 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
                />
              )}

              <PhotoSlot
                label="템플릿 사진 (선택 — 프레임/로고 등, 투명 배경 PNG 권장. 문구까지 얹은 결과 맨 위에 합성됨)"
                url={week.template_photo_url}
                uploading={uploadingPhoto}
                onUpload={(f) => uploadPhoto("template", f)}
                onRemove={() => removePhoto("template")}
              />
              <FigmaTemplatePicker value={figmaTemplateId} onChange={setFigmaTemplateId} />

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
                  {showRestaurants && <RestaurantChecklist paidRestaurants={paidRestaurants} isChecked={isChecked} toggleRestaurant={toggleRestaurant} />}
                </>
              )}

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
              </div>
              {aiDiag && <AiDiagnosticsPanel diag={aiDiag} onClose={() => setAiDiag(null)} />}
            </>
          )}

          {isStudioFlow && (
            <>
              <input
                value={clickUrl}
                onChange={(e) => setClickUrl(e.target.value)}
                placeholder="배너 클릭 시 이동할 URL (식당과 상관없이 이번 주는 전부 이 URL로 통일)"
                className="text-[11px] border border-periwinkle/30 bg-periwinkle/5 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
              />

              <button
                onClick={() => setShowRestaurants((v) => !v)}
                className="self-start text-[10px] text-periwinkle font-semibold"
              >
                {showRestaurants
                  ? "식당 목록 접기"
                  : `식당 목록 보기 (${paidRestaurants.filter((r) => isChecked(r)).length}/${paidRestaurants.length}개 포함)`}
              </button>
              {showRestaurants && <RestaurantChecklist paidRestaurants={paidRestaurants} isChecked={isChecked} toggleRestaurant={toggleRestaurant} />}

              <BannerStudioComposer
                weeklyBatch={{
                  weekId: week.id,
                  weekType: type === "coupon" ? "coupon" : "general",
                  restaurants: paidRestaurants.filter((r) => isChecked(r)),
                  couponTexts,
                  onCouponTextsChange: setCouponTexts,
                  clickUrl: clickUrl.trim(),
                }}
              />
            </>
          )}

          {isDirectApplyFlow && (
            <div className="border border-gray-100 rounded-lg p-2.5 flex flex-col gap-2">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                완성된 사진 1장을 올리면 슬랙 승인 없이 곧바로 이번 주 기간 동안 앱에 반영됩니다.
              </p>
              {week.banner_photo_url && (
                <img src={week.banner_photo_url} alt="현재 적용된 배너" className="w-24 h-24 rounded-lg object-cover" />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setDirectFile(e.target.files?.[0] ?? null)}
                className="text-[11px]"
              />
              <input
                type="text"
                value={directClickUrl}
                onChange={(e) => setDirectClickUrl(e.target.value)}
                placeholder="탭했을 때 이동할 URL"
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle"
              />
              <button
                onClick={applyDirect}
                disabled={!directFile || !directClickUrl.trim() || applyingDirect}
                className="text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle disabled:opacity-40"
              >
                {applyingDirect ? "적용 중..." : "적용"}
              </button>
            </div>
          )}

          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" />

          <div className="flex items-center justify-end">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="text-[10px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1 hover:bg-periwinkle disabled:opacity-30"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>

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
      )}
    </div>
  );
}

function RestaurantChecklist({
  paidRestaurants,
  isChecked,
  toggleRestaurant,
}: {
  paidRestaurants: PaidRestaurant[];
  isChecked: (r: PaidRestaurant) => boolean;
  toggleRestaurant: (r: PaidRestaurant) => void;
}) {
  return (
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
          {r.photos.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pl-5 pb-0.5">
              {r.photos.map((url, i) => (
                <PreviewableImg
                  key={i}
                  src={url}
                  alt=""
                  title={i === 0 ? "소재 사진(자동 사용됨) — 클릭하면 크게 봅니다" : "등록된 사진 — 클릭하면 크게 봅니다"}
                  className={`w-20 h-20 rounded-lg object-cover shrink-0 ${i === 0 ? "ring-2 ring-periwinkle" : "opacity-60"}`}
                />
              ))}
            </div>
          )}
        </div>
      ))}
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
      label: "AI 사진 효과 지시문(prompt_text)",
      ok: !!diag.prompt_text.trim(),
      value: diag.prompt_text.trim() ? diag.prompt_text : "비어있음",
    },
    {
      label: "배너 문구(caption_text)",
      ok: !!diag.caption_text.trim(),
      value: diag.caption_text.trim() || "비어있음 — 배너에 문구가 안 찍힘",
    },
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
    {
      label: "사진 재생성",
      ok: diag.uses_image_generation !== true,
      value: diag.uses_image_generation ? "이미지 생성 API 사용" : "하지 않음 · 원본 유지",
    },
    {
      label: "템플릿 분석 캐시",
      ok: !!diag.has_cached_spec,
      value: diag.has_cached_spec ? "있음 (같은 템플릿·문구면 재분석 안 함)" : "없음 · 이번 생성 때 1회 분석",
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
            ? "✅ 지금 생성하면 템플릿을 분석한 뒤 원본 사진에 효과만 입힙니다 (새 사진 생성 없음)"
            : "⚠️ 지금 생성해도 템플릿 분석 없이 원본 사진+문구로만 나갑니다"}
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
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  // 목록이 새로 로드되면(삭제 등으로) 이제 없는 id는 선택 목록에서도 지운다.
  useEffect(() => {
    setCheckedIds((prev) => {
      const ids = new Set(targets.map((t) => t.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [targets]);

  function toggleChecked(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setCheckedIds((prev) => (prev.size === targets.length ? new Set() : new Set(targets.map((t) => t.id))));
  }

  async function bulkDelete() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}건을 삭제할까요? 생성된 후보 이미지도 같이 지워지고, 이미 앱에 반영된 상태였다면 노출도 꺼집니다.`)) {
      return;
    }
    setBulkDeleting(true);
    try {
      const ids = [...checkedIds];
      const results = await Promise.all(
        ids.map((id) => fetch(`/api/bannerlab/weekly/targets/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok && r.status !== 204).length;
      if (failed > 0) alert(`${failed}건 삭제에 실패했습니다.`);
      setCheckedIds(new Set());
      await load();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-gray-100 rounded-lg p-2 bg-gray-50/50">
      {loading && <p className="text-[10px] text-gray-300 text-center py-2">불러오는 중...</p>}
      {!loading && targets.length === 0 && (
        <p className="text-[10px] text-gray-300 text-center py-2">아직 생성된 대상이 없습니다.</p>
      )}
      {!loading && targets.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <input
              type="checkbox"
              checked={checkedIds.size === targets.length}
              onChange={toggleAll}
              className="accent-periwinkle"
            />
            전체 선택
          </label>
          {checkedIds.size > 0 && (
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="text-[10px] font-semibold text-red-500 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40"
            >
              {bulkDeleting ? "삭제 중..." : `선택 삭제 (${checkedIds.size})`}
            </button>
          )}
        </div>
      )}
      {targets.map((t) => (
        <TargetCard
          key={t.id}
          target={t}
          onChanged={load}
          checked={checkedIds.has(t.id)}
          onToggleChecked={() => toggleChecked(t.id)}
        />
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

function TargetCard({
  target,
  onChanged,
  checked,
  onToggleChecked,
}: {
  target: WeeklyTarget;
  onChanged: () => void;
  checked: boolean;
  onToggleChecked: () => void;
}) {
  const [promptOverride, setPromptOverride] = useState(target.prompt_override);
  const [photoUrl, setPhotoUrl] = useState(target.photo_url_override || target.restaurant_photos?.[0] || "");
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [selecting, setSelecting] = useState(false);

  async function regenerate() {
    if (!confirm("이 대상만 골라서 새로 생성할까요? 슬랙에 새 메시지가 발송됩니다.")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/targets/${target.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_override: promptOverride, photo_url: photoUrl || undefined }),
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

  async function remove() {
    if (!confirm(`[${target.kind_label}] ${target.restaurant_name}을(를) 삭제할까요? 생성된 후보 이미지도 같이 지워지고, 이미 앱에 반영된 상태였다면 노출도 꺼집니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/targets/${target.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail ?? "삭제에 실패했습니다.");
        return;
      }
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  function startSelect(c: WeeklyCandidate) {
    setSelectingId((prev) => (prev === c.id ? null : c.id));
    setUrlDraft(target.click_url || "");
  }

  async function submitSelect(candidateId: number) {
    const url = urlDraft.trim();
    if (!url) {
      alert("이동 URL을 입력해주세요.");
      return;
    }
    setSelecting(true);
    try {
      const res = await fetch(`/api/bannerlab/weekly/candidates/${candidateId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ click_url: url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        alert(data.detail ?? "선택에 실패했습니다.");
        return;
      }
      if (res.status === 207) alert(data.detail);
      setSelectingId(null);
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSelecting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 min-w-0">
          <input type="checkbox" checked={checked} onChange={onToggleChecked} className="accent-periwinkle shrink-0" />
          <p className="text-[11px] font-semibold text-gray-700 truncate">
            [{target.kind_label}] {target.restaurant_name}
          </p>
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[target.status] ?? "bg-gray-100"}`}>
            {target.status_label}
          </span>
          <button
            onClick={remove}
            disabled={deleting}
            title="이 대상 삭제"
            className="text-gray-300 hover:text-red-500 disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {target.feedback_text && (
        <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1">🗣 {target.feedback_text}</p>
      )}
      {target.click_url && <p className="text-[9px] text-gray-400 truncate">이동 URL: {target.click_url}</p>}

      {(target.restaurant_photos?.length ?? 0) > 0 && (
        <div>
          <p className="text-[9px] text-gray-400 mb-1">식당 사진 — 템플릿에 맞는 컷을 고르고 다시 생성</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {target.restaurant_photos!.map((url) => {
              const selected = photoUrl === url;
              return (
                <PreviewableImg
                  key={url}
                  src={url}
                  alt=""
                  title={selected ? "이 컷으로 생성" : "이 사진 선택 · 클릭하면 크게 봅니다"}
                  onClick={() => setPhotoUrl(url)}
                  className={`w-14 h-14 object-cover rounded-lg shrink-0 ${selected ? "ring-2 ring-periwinkle" : "opacity-70 hover:opacity-100"}`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
        {target.candidates.length === 0 && <p className="text-[10px] text-gray-300">후보 없음</p>}
        {target.candidates.map((c) => (
          <div key={c.id} className="relative shrink-0">
            {c.image_url ? (
              <PreviewableImg
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
              {c.image_url && (
                <button
                  onClick={() => startSelect(c)}
                  className={`text-[8px] font-semibold ${c.selected ? "text-periwinkle" : "text-gray-400 hover:text-periwinkle"}`}
                >
                  {c.selected ? "선택됨" : "선택"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectingId != null && (
        <div className="flex items-center gap-1.5">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="이 후보로 선택 — 클릭 시 이동할 URL"
            autoFocus
            className="flex-1 text-[10px] border border-periwinkle/40 rounded-lg px-2 py-1 focus:outline-none"
          />
          <button
            onClick={() => submitSelect(selectingId)}
            disabled={selecting}
            className="shrink-0 text-[10px] font-semibold text-white bg-periwinkle rounded-lg px-2 py-1 hover:bg-navy disabled:opacity-40"
          >
            {selecting ? "저장 중..." : "확정"}
          </button>
        </div>
      )}

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
          <PreviewableImg src={url} alt="" className="w-full h-full object-cover" />
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

/** GET .../figma-templates/<pk>/inspect/ 가 돌려주는 노드 트리 — 진단용 구조 확인. */
interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  characters?: string;
  font_size?: number;
  align?: string;
  color?: string;
  has_image_fill?: boolean;
  children?: FigmaNode[];
}

function FigmaNodeView({
  node,
  depth,
  onSetBadge,
}: {
  node: FigmaNode;
  depth: number;
  onSetBadge?: (node: FigmaNode) => void;
}) {
  const hasBox = node.width != null && node.height != null;
  const box = hasBox
    ? `${Math.round(node.x ?? 0)},${Math.round(node.y ?? 0)} ${Math.round(node.width!)}×${Math.round(node.height!)}`
    : "";
  return (
    <div style={{ marginLeft: depth * 12 }} className="text-[10px] leading-relaxed">
      <span className="font-semibold text-gray-700">{node.name || "(이름없음)"}</span>{" "}
      <span className="text-gray-400">[{node.type}]</span>{" "}
      {box && <span className="text-gray-400">{box}</span>}
      {node.has_image_fill && <span className="ml-1 text-periwinkle">🖼 이미지 채우기</span>}
      {node.type === "TEXT" && (
        <span className="ml-1 text-emerald-600">
          "{node.characters}" · {node.font_size}px · {node.align} · {node.color}
        </span>
      )}
      {hasBox && onSetBadge && (
        <button
          onClick={() => onSetBadge(node)}
          className="ml-1 text-[9px] font-semibold text-amber-600 underline"
        >
          배지로 등록
        </button>
      )}
      {node.children?.map((c, i) => (
        <FigmaNodeView key={c.id ?? i} node={c} depth={depth + 1} onSetBadge={onSetBadge} />
      ))}
    </div>
  );
}

/**
 * 피그마 템플릿 선택/등록 — 등록된 템플릿(파일 key + node id) 중 이 주차가 참고할
 * 것 하나를 고른다. 생성 시 이 프레임 PNG를 비전 분석에 넣어 레이아웃·색감 스펙을
 * 뽑는다. 식당 사진을 다시 그리는 무드 입력으로는 쓰지 않는다. 등록은 여기
 * 인라인 미니폼으로 한다.
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
  const [inspecting, setInspecting] = useState(false);
  const [inspectTree, setInspectTree] = useState<FigmaNode | null>(null);
  const [inspectErr, setInspectErr] = useState("");

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

  async function inspect() {
    if (!value) return;
    setInspecting(true);
    setInspectErr("");
    setInspectTree(null);
    try {
      const res = await fetch(`/api/bannerlab/figma-templates/${value}/inspect`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInspectErr(data.detail ?? "구조를 불러오지 못했습니다.");
        return;
      }
      setInspectTree(data.tree ?? null);
    } finally {
      setInspecting(false);
    }
  }

  async function setBadge(node: FigmaNode) {
    if (!value || node.width == null || node.height == null) return;
    setInspectErr("");
    try {
      const res = await fetch(`/api/bannerlab/figma-templates/${value}/badge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: node.id,
          x: node.x ?? 0,
          y: node.y ?? 0,
          width: node.width,
          height: node.height,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInspectErr(data.detail ?? "배지 등록에 실패했습니다.");
        return;
      }
      setTemplates((prev) => prev.map((t) => (t.id === value ? data : t)));
    } catch (e) {
      setInspectErr("배지 등록에 실패했습니다: " + (e as Error).message);
    }
  }

  async function clearBadge() {
    if (!value) return;
    const res = await fetch(`/api/bannerlab/figma-templates/${value}/badge`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTemplates((prev) => prev.map((t) => (t.id === value ? data : t)));
    }
  }

  const selectedTemplate = templates.find((t) => t.id === value) ?? null;

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
        {value && (
          <button
            onClick={inspect}
            disabled={inspecting}
            className="text-[10px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-2 py-1.5 shrink-0 disabled:opacity-40"
          >
            {inspecting ? "확인 중..." : "구조 확인"}
          </button>
        )}
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-[10px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2 py-1.5 shrink-0"
        >
          + 템플릿 등록
        </button>
      </div>

      {selectedTemplate?.frame_width && selectedTemplate?.frame_height && (
        <p className="text-[10px] text-gray-400">
          프레임 크기 {selectedTemplate.frame_width}×{selectedTemplate.frame_height}
          {selectedTemplate.badge_node_id && (
            <>
              {" · 배지 등록됨"}
              <button onClick={clearBadge} className="ml-1 text-red-500 underline">
                해제
              </button>
            </>
          )}
        </p>
      )}
      {inspectErr && <p className="text-[10px] text-red-500">{inspectErr}</p>}
      {inspectTree && (
        <div className="border border-gray-100 rounded-lg p-2 bg-gray-50 max-h-64 overflow-auto">
          <FigmaNodeView node={inspectTree} depth={0} onSetBadge={setBadge} />
        </div>
      )}

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
