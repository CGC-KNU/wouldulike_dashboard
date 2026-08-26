"use client";

import { useCallback, useEffect, useState } from "react";

import EmailNotificationToggle from "./EmailNotificationToggle";
import { DeletedPlan, MEDIA_META, SatelliteMember, fmtMD } from "./types";

interface PublishStatus {
  configured: boolean;
  publish_enabled: boolean;
  account: { username: string; followers: number | null; media_count: number | null } | null;
}

/**
 * 설정 (목업 §s-set) — 수집 상태 · 연동 상태 · 멤버. 리드 전용.
 *
 * 멤버별 발행 할당량(weekly_quota)·리드 여부·활동 기간은 계정 생성 때부터
 * DB 컬럼은 있었지만 편집 UI가 없었다 — 여기서 리드가 직접 바꿀 수 있게 연다
 * (개발계획 §10 "인당 다르게 설정 가능 ... UI만 추가"). 계정 자체의 생성/삭제·
 * 아이디·직무는 여전히 대시보드 계정 관리 쪽 소관이라 여기서 다루지 않는다.
 */
export default function SettingsScreen() {
  const [members, setMembers] = useState<SatelliteMember[]>([]);
  const [pubStatus, setPubStatus] = useState<PublishStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, pubRes] = await Promise.all([
        fetch("/api/satellite/members"),
        fetch("/api/satellite/publish-status"),
      ]);
      if (membersRes.ok) setMembers(await membersRes.json());
      if (pubRes.ok) setPubStatus(await pubRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patchMember(id: number, updated: SatelliteMember) {
    setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
  }

  return (
    <div className="flex flex-col gap-4">
      <EmailNotificationToggle />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <h3 className="text-xs font-bold text-gray-800 mb-2">연동 상태</h3>
        {loading ? (
          <p className="text-[11px] text-gray-300">불러오는 중...</p>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${pubStatus?.publish_enabled ? "bg-green-500" : "bg-gray-300"}`} />
            <p className="text-[11px] text-gray-500">
              {pubStatus?.account ? (
                <>
                  발행 대상 <span className="font-semibold text-gray-700">@{pubStatus.account.username}</span>
                  {!pubStatus.publish_enabled && " — 자동 발행 꺼짐"}
                </>
              ) : (
                "자동 발행이 꺼져 있습니다"
              )}
            </p>
          </div>
        )}
      </div>

      <BackfillSection />

      <DeletedPlansSection />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-bold text-gray-800">멤버</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">
            발행 할당량 · 역할 · 활동 기간을 여기서 바로 설정합니다. 계정 추가/아이디 변경은
            관리자 설정 → 계정 관리에서 처리합니다.
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} onUpdated={(updated) => patchMember(m.id, updated)} />
          ))}
          {members.length === 0 && !loading && (
            <p className="text-[11px] text-gray-300 text-center py-6">멤버가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface BackfillResult {
  ok: boolean;
  error?: string;
  dry_run?: boolean;
  created: number;
  skipped: number;
  insight_errors?: string[];
  needs_tagging?: boolean;
}

/**
 * 과거 게시물 백필 — 테스트 계정에서 실제 운영 계정으로 전환한 직후 1회 실행용.
 * 먼저 미리보기(dry-run)로 몇 건이 새로 잡히는지 확인하고, 그 다음에만 실제 실행
 * 버튼이 활성화된다 — 계정 전환은 되돌리기 어려운 일이라 실수로 바로 실행되지 않게.
 */
function BackfillSection() {
  const [preview, setPreview] = useState<BackfillResult | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runBackfill(dryRun: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/satellite/settings/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const data: BackfillResult = await res.json();
      if (dryRun) setPreview(data);
      else {
        setResult(data);
        setPreview(null);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <h3 className="text-xs font-bold text-gray-800 mb-1">과거 게시물 백필</h3>
      <p className="text-[10px] text-gray-400 leading-relaxed mb-2.5">
        계정을 실제 운영 계정으로 전환한 직후 한 번 실행하면, 이전에 그 계정에 올라가 있던
        게시물을 전부 끌어와 성과 집계 대상에 넣습니다. 담당자는 전부 미지정 상태로 들어오며,
        태깅 콘솔(리드 전용)에서 나중에 지정하면 됩니다.
      </p>

      {!preview && !result && (
        <button
          onClick={() => runBackfill(true)}
          disabled={loading}
          className="text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-3 py-1.5 disabled:opacity-40"
        >
          {loading ? "확인 중..." : "미리보기 (실행 안 함)"}
        </button>
      )}

      {preview && (
        <div className="rounded-xl bg-periwinkle/5 border border-periwinkle/15 px-3 py-2.5">
          {preview.ok ? (
            <>
              <p className="text-[11px] text-periwinkle">
                새로 {preview.created}건이 백필됩니다 (이미 있는 것 {preview.skipped}건 제외).
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => runBackfill(false)}
                  disabled={loading || preview.created === 0}
                  className="text-[11px] font-semibold text-white bg-periwinkle rounded-lg px-3 py-1.5 disabled:opacity-40"
                >
                  {loading ? "실행 중..." : `실제로 ${preview.created}건 백필 실행`}
                </button>
                <button onClick={() => setPreview(null)} disabled={loading} className="text-[11px] text-gray-400">
                  취소
                </button>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-red-500">{preview.error}</p>
          )}
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl px-3 py-2.5 ${
            result.ok ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"
          }`}
        >
          {result.ok ? (
            <>
              <p className="text-[11px] text-green-700 font-semibold">
                백필 완료 — 신규 {result.created}건 · 스킵 {result.skipped}건
              </p>
              {result.needs_tagging && (
                <p className="text-[11px] text-green-600 mt-1">
                  담당자가 전부 미지정입니다 — 사이드바의 &ldquo;태깅 콘솔&rdquo;에서 지정해주세요.
                </p>
              )}
              {(result.insight_errors?.length ?? 0) > 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  일부 게시물은 지표 조회에 실패했습니다 ({result.insight_errors!.length}건) — 다음 일일 수집에서 재시도됩니다.
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-red-600">{result.error}</p>
          )}
          <button onClick={() => setResult(null)} className="text-[10px] text-gray-400 mt-2">
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 삭제된 매거진 주제 — RD 요청 (2차 확인 후 삭제 + 설정에서 복구).
 * 리드 전용 (백엔드 DeletedPlansView/RestorePlanView 도 리드로 제한).
 * 최근 90일 안에 지운 것만 백엔드가 내려준다.
 */
function DeletedPlansSection() {
  const [plans, setPlans] = useState<DeletedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/satellite/plans/deleted");
      if (res.status === 403) {
        // 멤버 계정 — 이 섹션 자체를 숨긴다
        setPlans([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPlans(data.plans ?? []);
      else setError(data.detail || "불러오지 못했습니다.");
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function restore(id: number) {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/satellite/plans/${id}/restore`, { method: "POST" });
      if (res.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || "복구에 실패했습니다.");
      }
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="text-left">
          <h3 className="text-xs font-bold text-gray-800">삭제된 매거진 주제</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">
            주제표에서 삭제한 행을 여기서 복구할 수 있습니다 (최근 90일)
          </p>
        </div>
        <span className="text-[10px] text-gray-400 shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {loading && <p className="text-[11px] text-gray-300 text-center py-5">불러오는 중...</p>}
          {!loading && error && <p className="text-[11px] text-red-500 text-center py-5">{error}</p>}
          {!loading && !error && plans.length === 0 && (
            <p className="text-[11px] text-gray-300 text-center py-5">삭제된 항목이 없습니다.</p>
          )}
          {!loading &&
            !error &&
            plans.map((p) => (
              <div
                key={p.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-xs text-gray-700 truncate">{p.topic || "(미정)"}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {fmtMD(p.scheduled_date)} · {p.owner_name} · {MEDIA_META[p.media_type].label}
                    {p.deleted_by_name && <> · {p.deleted_by_name}님이 삭제</>}
                  </p>
                </div>
                <button
                  onClick={() => restore(p.id)}
                  disabled={restoringId === p.id}
                  className="text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1.5 shrink-0 disabled:opacity-40"
                >
                  {restoringId === p.id ? "복구 중..." : "복구"}
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  onUpdated,
}: {
  member: SatelliteMember;
  onUpdated: (updated: SatelliteMember) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quota, setQuota] = useState(member.weekly_quota);
  const [role, setRole] = useState(member.satellite_role);
  const [activeFrom, setActiveFrom] = useState(member.active_from ?? "");
  const [activeUntil, setActiveUntil] = useState(member.active_until ?? "");
  const [isActive, setIsActive] = useState(member.is_active);
  const [assignable, setAssignable] = useState(member.satellite_assignable);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    quota !== member.weekly_quota ||
    role !== member.satellite_role ||
    activeFrom !== (member.active_from ?? "") ||
    activeUntil !== (member.active_until ?? "") ||
    isActive !== member.is_active ||
    assignable !== member.satellite_assignable;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch(`/api/satellite/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekly_quota: quota,
          satellite_role: role,
          active_from: activeFrom || null,
          active_until: activeUntil || null,
          is_active: isActive,
          satellite_assignable: assignable,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onUpdated(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else {
        setError(data.detail || "저장에 실패했습니다.");
      }
    } catch {
      setError("저장 요청에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-2.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <span className={`text-xs font-medium ${member.is_active ? "text-gray-700" : "text-gray-300"}`}>
            {member.display_name}
          </span>
          {member.satellite_role === "LEAD" && (
            <span className="ml-1.5 text-[9px] font-bold text-periwinkle bg-periwinkle/10 rounded-full px-1.5 py-0.5">
              리드
            </span>
          )}
          {!member.is_active && (
            <span className="ml-1.5 text-[9px] font-bold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
              비활성
            </span>
          )}
          {!member.satellite_assignable && (
            <span className="ml-1.5 text-[9px] font-bold text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5">
              열람 전용
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 shrink-0">
          주 {member.weekly_quota}건 {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-50 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400 font-semibold">주간 발행 할당량</span>
              <input
                type="number"
                min={0}
                value={quota}
                onChange={(e) => setQuota(Math.max(0, Number(e.target.value) || 0))}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400 font-semibold">역할</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SatelliteMember["satellite_role"])}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
              >
                <option value="MEMBER">멤버</option>
                <option value="LEAD">리드</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400 font-semibold">활동 시작일</span>
              <input
                type="date"
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400 font-semibold">활동 종료일(퇴사일)</span>
              <input
                type="date"
                value={activeUntil}
                onChange={(e) => setActiveUntil(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle"
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="text-[11px] text-gray-500">활성 계정 (끄면 로그인 불가, 과거 콘텐츠엔 이름 유지)</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={assignable} onChange={(e) => setAssignable(e.target.checked)} />
            <span className="text-[11px] text-gray-500">
              담당자로 배정 가능 (끄면 "담당자" 목록에서 빠지고 열람만 가능 — 리드 권한은 그대로 유지됨)
            </span>
          </label>

          {error && <p className="text-[10px] text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            {saved && <span className="text-[10px] text-green-600">저장됨</span>}
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="text-[10px] font-semibold text-white bg-periwinkle rounded-lg px-2.5 py-1 disabled:opacity-40"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
