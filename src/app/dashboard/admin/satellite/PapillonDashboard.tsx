"use client";

import { useCallback, useEffect, useState } from "react";

import ContentKanban from "./ContentKanban";
import LockApprovalQueue from "./LockApprovalQueue";
import PlanCalendar from "./PlanCalendar";
import PlanEditor from "./PlanEditor";
import { DeleteConfirmModal } from "./PlanTable";
import SponsorshipList from "./SponsorshipList";
import { ContentPlan, PlansResponse, SatelliteMember, fmtMD } from "./types";

/**
 * 메인 화면 구획(콘텐츠 칸반·캘린더)의 표시 순서 — RD 요청(2026-08-21)으로
 * "콘텐츠 칸반" 사이드바 메뉴를 없애고 메인 화면 안으로 옮기면서, 순서 자체를
 * 사용자가 바꿀 수 있게 했다. 팀 전체가 공유하는 설정이 아니라 "내 화면을 어떻게
 * 보고 싶은지"에 가까운 개인 취향이라 서버가 아니라 브라우저 localStorage에
 * 저장한다 — 기기·브라우저별로 따로 기억된다.
 */
// "list"(매거진 주제 리스트 표)는 2026-08-26 제거 — 콘텐츠 칸반과 완전히 같은
// 데이터를 표로만 다시 보여주는 중복 화면이었다(마케팅팀 피드백). 기존에 저장된
// localStorage 순서 값은 길이가 안 맞아 아래 loadMainSectionOrder()가 자동으로
// 기본값으로 되돌린다 — 별도 마이그레이션 불필요.
type MainSectionKey = "kanban" | "calendar";
const MAIN_SECTION_ORDER_KEY = "papillon:main-section-order";
const DEFAULT_MAIN_SECTION_ORDER: MainSectionKey[] = ["kanban", "calendar"];
const MAIN_SECTION_LABEL: Record<MainSectionKey, string> = {
  kanban: "콘텐츠 칸반",
  calendar: "캘린더",
};

function loadMainSectionOrder(): MainSectionKey[] {
  if (typeof window === "undefined") return DEFAULT_MAIN_SECTION_ORDER;
  try {
    const raw = window.localStorage.getItem(MAIN_SECTION_ORDER_KEY);
    if (!raw) return DEFAULT_MAIN_SECTION_ORDER;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_MAIN_SECTION_ORDER.length &&
      DEFAULT_MAIN_SECTION_ORDER.every((k) => parsed.includes(k))
    ) {
      return parsed as MainSectionKey[];
    }
  } catch {
    /* 손상된 값은 기본값으로 되돌린다 */
  }
  return DEFAULT_MAIN_SECTION_ORDER;
}

/** 구획 하나를 감싸서 위/아래 이동 버튼을 얹는다. */
function MainSection({
  sectionKey,
  order,
  onMove,
  children,
}: {
  sectionKey: MainSectionKey;
  order: MainSectionKey[];
  onMove: (key: MainSectionKey, dir: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const idx = order.indexOf(sectionKey);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold text-gray-400">{MAIN_SECTION_LABEL[sectionKey]}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(sectionKey, -1)}
            disabled={idx === 0}
            title="위로 이동"
            className="w-5 h-5 rounded-md text-[10px] leading-none text-gray-400 border border-gray-200 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(sectionKey, 1)}
            disabled={idx === order.length - 1}
            title="아래로 이동"
            className="w-5 h-5 rounded-md text-[10px] leading-none text-gray-400 border border-gray-200 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
          >
            ▼
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

interface PublishStatus {
  configured: boolean;
  publish_enabled: boolean;
  account: { username: string; followers: number | null; media_count: number | null } | null;
  quota: { quota_usage: number; quota_total: number } | null;
  quota_error: string;
  pending: number;
  unresolved_failures: {
    plan_id: number;
    topic: string;
    owner_name: string;
    scheduled_date: string;
    error_code: string;
    error_message: string;
    attempt_no: number;
  }[];
  is_lead: boolean;
}

/* ─── 에러 표현 ───────────────────────────────────── */

interface LoadError {
  status: number | null;   // null = 요청 자체가 실패
  detail: string;
  hint?: string;
  source: string;          // 어느 호출에서 났는지
}

/** 상태 코드별로 사람이 읽을 수 있는 안내를 붙인다. */
function describe(status: number, detail: string): { detail: string; hint?: string } {
  if (status === 401) return { detail, hint: "세션이 만료됐습니다. 다시 로그인해주세요." };
  if (status === 403) return { detail, hint: "이 계정에는 세틀라이트 접근 권한이 없습니다. 슈퍼관리자에게 역할 확인을 요청하세요." };
  if (status === 404) return { detail, hint: "API 경로를 찾을 수 없습니다. 백엔드에 satellite 앱이 등록됐는지 확인하세요." };
  if (status === 502) return { detail, hint: "백엔드에 연결하지 못했습니다. 서버 상태를 확인하세요." };
  if (status >= 500) {
    const schema = /does not exist|no such table|ProgrammingError|UndefinedTable|UndefinedColumn/i.test(detail);
    return {
      detail,
      hint: schema
        ? "DB 스키마가 코드보다 뒤처져 있습니다. `python manage.py migrate` 를 실행해주세요."
        : "서버 내부 오류입니다. 백엔드 로그를 확인해주세요.",
    };
  }
  return { detail };
}

/** fetch 결과를 LoadError 로 정규화. 성공이면 null. */
async function toError(res: Response, source: string): Promise<LoadError | null> {
  if (res.ok) return null;
  let detail = `HTTP ${res.status}`;
  try {
    const d = await res.json();
    if (d?.detail) detail = String(d.detail);
  } catch {
    /* 프록시가 항상 JSON 을 주지만 방어적으로 */
  }
  return { status: res.status, ...describe(res.status, detail), source };
}

/**
 * Papillon — 마케팅 툴 (구 세틀라이트 1차: 매거진 주제 리스트 표 + 캘린더)
 *
 * 협찬 촬영 등록부터 주제 등록·현황 확인까지 표 하나에서 처리하고,
 * 바로 아래 캘린더가 같은 ContentPlan 데이터를 분포로 보여준다. (설계서 §07-1)
 * 예전에 별도였던 칸반 보드는 이 표의 "협찬 촬영" 열로 흡수됐다.
 */
export default function PapillonDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [data, setData] = useState<PlansResponse | null>(null);
  const [members, setMembers] = useState<SatelliteMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editorPlanId, setEditorPlanId] = useState<number | null>(null);
  const [editorInitialTab, setEditorInitialTab] = useState<"detail" | "content">("detail");
  const [pubStatus, setPubStatus] = useState<PublishStatus | null>(null);
  const [sectionOrder, setSectionOrder] = useState<MainSectionKey[]>(DEFAULT_MAIN_SECTION_ORDER);
  const [dismissTarget, setDismissTarget] = useState<PublishStatus["unresolved_failures"][number] | null>(null);

  useEffect(() => {
    setSectionOrder(loadMainSectionOrder());
  }, []);

  const moveSection = useCallback((key: MainSectionKey, dir: -1 | 1) => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(key);
      const swapWith = idx + dir;
      if (idx === -1 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      try {
        window.localStorage.setItem(MAIN_SECTION_ORDER_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패해도 이번 화면 세션 동안은 순서가 유지된다 */
      }
      return next;
    });
  }, []);

  /**
   * 슬랙 알림의 "대시보드에서 보기" 딥링크(?plan=<id>) 진입점 — 마운트 시 한 번만
   * 확인해서 바로 그 콘텐츠의 에디터를 연다. URL 파라미터는 열고 나면 지운다
   * (뒤로가기 시 같은 모달이 다시 뜨지 않도록).
   */
  useEffect(() => {
    const planParam = new URL(window.location.href).searchParams.get("plan");
    const planId = planParam ? Number(planParam) : NaN;
    if (Number.isFinite(planId) && planId > 0) {
      setEditorPlanId(planId);
      const url = new URL(window.location.href);
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPlans = useCallback(async (opts?: { soft?: boolean }) => {
    // soft: 에디터 저장·업로드 후 — 기존 캘린더/표를 스피너로 덮지 않는다.
    if (!opts?.soft) setLoading(true);
    try {
      const res = await fetch(`/api/satellite/plans?year=${year}&month=${month}`);
      const e = await toError(res, "콘텐츠 목록");
      if (e) {
        setErrors((prev) => [...prev.filter((x) => x.source !== e.source), e]);
        if (!opts?.soft) setData(null);
      } else {
        setErrors((prev) => prev.filter((x) => x.source !== "콘텐츠 목록"));
        setData(await res.json());
      }
    } catch (ex) {
      setErrors((prev) => [
        ...prev.filter((x) => x.source !== "콘텐츠 목록"),
        { status: null, detail: (ex as Error).message, hint: "네트워크 연결을 확인해주세요.", source: "콘텐츠 목록" },
      ]);
      if (!opts?.soft) setData(null);
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, [year, month]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/satellite/members");
      const e = await toError(res, "담당자 목록");
      if (e) {
        setErrors((prev) => [...prev.filter((x) => x.source !== e.source), e]);
        setMembers([]);
      } else {
        setErrors((prev) => prev.filter((x) => x.source !== "담당자 목록"));
        const d = await res.json();
        setMembers(Array.isArray(d) ? d : []);
      }
    } catch {
      setMembers([]);
    }
  }, []);

  const loadPubStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/satellite/publish-status");
      if (res.ok) setPubStatus(await res.json());
    } catch {
      /* 상태 배너는 부가 정보 */
    }
  }, []);

  useEffect(() => {
    loadMembers();
    loadPubStatus();
  }, [loadMembers, loadPubStatus]);

  function retryAll() {
    setErrors([]);
    loadPlans();
    loadMembers();
    loadPubStatus();
  }

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  /* ─── 변경 핸들러 ───────────────────────────────── */

  async function patch(id: number, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/satellite/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { detail, hint } = describe(res.status, d.detail ?? `HTTP ${res.status}`);
        alert(`수정 실패 (${res.status})\n\n${detail}${hint ? `\n\n→ ${hint}` : ""}`);
        return false;
      }
      // 응답으로 해당 행만 갱신 — 전체 리로드보다 깜빡임이 적다
      setData((prev) =>
        prev ? { ...prev, plans: prev.plans.map((p) => (p.id === id ? { ...p, ...d } : p)) } : prev
      );
      return true;
    } catch {
      alert("네트워크 오류");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function create(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/satellite/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { detail, hint } = describe(res.status, d.detail ?? `HTTP ${res.status}`);
        alert(`등록 실패 (${res.status})\n\n${detail}${hint ? `\n\n→ ${hint}` : ""}`);
        return false;
      }
      await loadPlans();
      return true;
    } catch {
      alert("네트워크 오류");
      return false;
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/satellite/plans/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setData((prev) => (prev ? { ...prev, plans: prev.plans.filter((p) => p.id !== id) } : prev));
        // 소프트 삭제된 건은 발행 실패 배너에서도 같이 사라져야 한다 — 안 지우면
        // 다음 새로고침 전까지 지운 콘텐츠가 그대로 남아 보인다.
        setPubStatus((prev) =>
          prev ? { ...prev, unresolved_failures: prev.unresolved_failures.filter((f) => f.plan_id !== id) } : prev
        );
      } else {
        const d = await res.json().catch(() => ({}));
        const { detail, hint } = describe(res.status, d.detail ?? `HTTP ${res.status}`);
        alert(`삭제 실패 (${res.status})\n\n${detail}${hint ? `\n\n→ ${hint}` : ""}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  function goToday() {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  /* 캘린더에서 드래그로 날짜 이동 — 표와 같은 PATCH 를 탄다 */
  async function moveToDate(planId: number, dateStr: string) {
    const plan = data?.plans.find((p) => p.id === planId);
    if (!plan || plan.scheduled_date === dateStr) return;
    await patch(planId, { scheduled_date: dateStr });
  }

  /**
   * 콘텐츠 클릭 시 라우팅 (설계서 §07-2 · Papillon §1.2)
   *   내 것(편집/촬영 담당)  → 에디터 (바로 "에디터" 탭으로, RD 요청 2026-08-23)
   *   남의 것(draft)         → 진입 불가
   *   남의 것(ready↑)        → 상세 (지금은 에디터가 읽기 전용으로 뜬다 = 콘텐츠 피드백)
   *   리드                   → 항상 진입 가능, 본인 담당이 아니면 "콘텐츠 피드백"부터
   *
   * isMine 판정이 실제 서버 권한(plan.can_edit)과 어긋나는 극단적인 경우에도, PlanEditor
   * 자체가 !can_edit 이면 "에디터" 탭에서 "콘텐츠 피드백"으로 되돌리는 안전장치를 갖고
   * 있어(§0-9 근처 useEffect) 여기서는 낙관적으로 판단해도 된다.
   */
  function openPlan(plan: ContentPlan) {
    const isMine =
      viewerAccountId !== null && (plan.owner_id === viewerAccountId || plan.shoot_owner_id === viewerAccountId);
    if (!isMine && !isLead && plan.status === "draft") {
      alert("아직 작업 중입니다.\n\n담당자가 준비완료로 바꾸면 열람하고 피드백할 수 있습니다.");
      return;
    }
    setEditorInitialTab(isMine ? "content" : "detail");
    setEditorPlanId(plan.id);
  }

  async function afterEditorChange() {
    await loadPlans({ soft: true });
    loadPubStatus();
  }

  const viewerAccountId = data?.viewer.account_id ?? null;
  const isLead = data?.viewer.is_lead ?? false;
  const today = data?.today ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {/* 협찬 목록 — 콘텐츠 칸반과 완전히 분리된 모델이라(통합 업무 관리 기획안 §2·§4)
          리스트·칸반·캘린더 순서조정 대상에 안 넣고 메인 화면 맨 위에 항상 고정한다. */}
      <SponsorshipList />

      {/* 업로드 예정 시간을 넘겨 잠긴 콘텐츠 — 리드 전용 (설계서 §16-6, §10 건별 실시간) */}
      {isLead && <LockApprovalQueue onOpenPlan={(id) => setEditorPlanId(id)} />}

      {/* 미처리 발행 실패 — 조용히 묻히지 않도록 상단에 계속 띄운다 (설계서 §07-6) */}
      {pubStatus && pubStatus.unresolved_failures.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-xs font-bold text-orange-700 mb-2">
            발행에 실패한 콘텐츠 {pubStatus.unresolved_failures.length}건
            {pubStatus.is_lead && <span className="ml-1.5 font-normal">— 수동 발행으로 수습해주세요</span>}
          </p>
          <div className="flex flex-col gap-1.5">
            {pubStatus.unresolved_failures.map((f) => (
              <div
                key={f.plan_id}
                className="group flex items-start gap-2 hover:bg-orange-100/60 rounded-lg px-1.5 py-1 transition-colors"
              >
                <button onClick={() => setEditorPlanId(f.plan_id)} className="text-left flex items-start gap-2 flex-1 min-w-0">
                  <span className="text-[10px] font-semibold text-orange-600 shrink-0 mt-0.5">
                    {fmtMD(f.scheduled_date)}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[11px] text-orange-700 font-medium">
                      {f.topic || "(주제 미정)"}
                    </span>
                    <span className="text-[10px] text-orange-500 ml-1.5">· {f.owner_name}</span>
                    <span className="block text-[10px] text-orange-500 leading-relaxed">
                      [{f.error_code}] {f.error_message.slice(0, 90)}
                    </span>
                  </span>
                </button>
                {pubStatus.is_lead && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissTarget(f);
                    }}
                    aria-label="이 알림 지우기"
                    title="이 알림 지우기"
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-orange-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 발행 대상 계정 + 설정 상태 — 어느 계정에 올라가는지 항상 보이게 한다 */}
      {pubStatus && (pubStatus.account || !pubStatus.publish_enabled) && (
        <div
          className={`rounded-2xl border px-4 py-2.5 flex items-center gap-2.5 ${
            pubStatus.publish_enabled
              ? "border-green-200 bg-green-50"
              : "border-gray-200 bg-white"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              pubStatus.publish_enabled ? "bg-green-500" : "bg-gray-300"
            }`}
          />
          <div className="min-w-0 flex-1">
            {pubStatus.account ? (
              <p
                className={`text-[11px] leading-relaxed ${
                  pubStatus.publish_enabled ? "text-green-700" : "text-gray-500"
                }`}
              >
                발행 대상{" "}
                <span className="font-bold">@{pubStatus.account.username}</span>
                {pubStatus.account.followers != null && (
                  <span className="opacity-70">
                    {" "}
                    · 팔로워 {pubStatus.account.followers.toLocaleString()}
                  </span>
                )}
                {!pubStatus.publish_enabled && (
                  <span className="block mt-0.5 text-gray-500">
                    자동 발행이 꺼져 있어 실제로는 올라가지 않습니다.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                자동 발행이 꺼져 있습니다 — 콘텐츠는 저장되지만 인스타에 올라가지 않습니다.
                {!pubStatus.configured && " 인스타 연동 환경변수도 아직 설정되지 않았습니다."}
              </p>
            )}
          </div>
          {pubStatus.quota && (
            <span
              className={`text-[10px] shrink-0 ${
                pubStatus.publish_enabled ? "text-green-600" : "text-gray-400"
              }`}
            >
              쿼터 {pubStatus.quota.quota_usage}/{pubStatus.quota.quota_total}
            </span>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 overflow-hidden">
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="w-7 h-7 rounded-lg bg-red-100 text-red-500 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v5M12 16v.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              {errors.map((e) => (
                <div key={e.source}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-red-700">{e.source}</span>
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                      {e.status ?? "연결 실패"}
                    </span>
                  </div>
                  <p className="text-[11px] text-red-600 mt-0.5 break-words leading-relaxed">{e.detail}</p>
                  {e.hint && (
                    <p className="text-[11px] text-red-500 mt-1 leading-relaxed">
                      <span className="font-semibold">→ </span>
                      {e.hint}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={retryAll}
              className="shrink-0 text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-100 active:scale-95 transition-all"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <p className="text-xs text-gray-300">불러오는 중...</p>
        </div>
      ) : (
        data &&
        sectionOrder.map((key) => {
          if (key === "kanban") {
            return (
              <MainSection key="kanban" sectionKey="kanban" order={sectionOrder} onMove={moveSection}>
                <ContentKanban
                  members={members}
                  viewerAccountId={viewerAccountId}
                  isLead={isLead}
                  today={today}
                  onCreate={create}
                  onDelete={remove}
                />
              </MainSection>
            );
          }
          return (
            <MainSection key="calendar" sectionKey="calendar" order={sectionOrder} onMove={moveSection}>
              <PlanCalendar
                year={year}
                month={month}
                today={today}
                plans={data.plans}
                sponsorships={data.sponsorships ?? []}
                members={members}
                viewerAccountId={viewerAccountId}
                isLead={isLead}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                onToday={goToday}
                onSelect={openPlan}
                onDropOnDate={moveToDate}
              />
            </MainSection>
          );
        })
      )}

      {editorPlanId !== null && (
        <PlanEditor
          planId={editorPlanId}
          initialTab={editorInitialTab}
          onClose={() => setEditorPlanId(null)}
          onChanged={afterEditorChange}
        />
      )}

      {dismissTarget && (
        <DeleteConfirmModal
          plan={{ scheduled_date: dismissTarget.scheduled_date, topic: dismissTarget.topic, status: "failed" }}
          onCancel={() => setDismissTarget(null)}
          onConfirmed={async () => {
            await remove(dismissTarget.plan_id);
            setDismissTarget(null);
          }}
        />
      )}
    </div>
  );
}
