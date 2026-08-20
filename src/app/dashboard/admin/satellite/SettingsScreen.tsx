"use client";

import { useCallback, useEffect, useState } from "react";

import EmailNotificationToggle from "./EmailNotificationToggle";
import { SatelliteMember } from "./types";

interface PublishStatus {
  configured: boolean;
  publish_enabled: boolean;
  account: { username: string; followers: number | null; media_count: number | null } | null;
}

/** 설정 (목업 §s-set) — 수집 상태 · 연동 상태 · 멤버. 리드 전용. */
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
            멤버 추가/비활성화는 관리자 설정 → 계정 관리에서 처리합니다
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {members.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className={`text-xs font-medium ${m.is_active ? "text-gray-700" : "text-gray-300"}`}>
                  {m.display_name}
                </span>
                {m.satellite_role === "LEAD" && (
                  <span className="ml-1.5 text-[9px] font-bold text-periwinkle bg-periwinkle/10 rounded-full px-1.5 py-0.5">
                    리드
                  </span>
                )}
                {!m.is_active && (
                  <span className="ml-1.5 text-[9px] font-bold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                    비활성
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">주 {m.weekly_quota}건</span>
            </div>
          ))}
          {members.length === 0 && !loading && (
            <p className="text-[11px] text-gray-300 text-center py-6">멤버가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
