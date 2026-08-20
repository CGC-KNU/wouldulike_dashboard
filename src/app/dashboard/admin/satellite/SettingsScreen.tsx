"use client";

import { useCallback, useEffect, useState } from "react";

import EmailNotificationToggle from "./EmailNotificationToggle";
import { SatelliteMember } from "./types";

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    quota !== member.weekly_quota ||
    role !== member.satellite_role ||
    activeFrom !== (member.active_from ?? "") ||
    activeUntil !== (member.active_until ?? "") ||
    isActive !== member.is_active;

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
