"use client";

import { useCallback, useEffect, useState } from "react";

import { SatelliteSettingsResponse } from "./types";

/**
 * 이메일 발송 온/오프 스위치 (설계서 §16-8).
 *
 * 슈퍼관리자·마케팅팀 누구나(세틀라이트 탭에 들어올 수 있으면 전부) 켜고 끌 수 있다 —
 * 리드 전용이 아니다. 기본값은 꺼짐 — 테스트 중 실제 메일이 나가지 않도록 막아둔 것.
 * SMTP(EMAIL_BACKEND)가 배포에 안 붙어 있어도 이 스위치는 항상 동작하지만, 실제
 * 발송까지 가려면 SMTP 설정도 같이 돼 있어야 한다 (백엔드 services/notifications.py).
 */
export default function EmailNotificationToggle() {
  const [data, setData] = useState<SatelliteSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/satellite/settings");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail ?? `불러오지 못했습니다 (${res.status})`);
      } else {
        setData(d);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle() {
    if (!data || saving) return;
    const next = !data.email_enabled;
    setSaving(true);
    try {
      const res = await fetch("/api/satellite/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_enabled: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "설정 변경에 실패했습니다.");
        return;
      }
      setData(d);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || err || !data) return null;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <div>
        <p className="text-xs font-bold text-gray-800">이메일 알림 발송</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {data.email_enabled
            ? "켜짐 — 마감 임박·잠금 등 알림이 이메일로도 발송됩니다."
            : "꺼짐 — 인앱 알림만 남고 이메일은 발송되지 않습니다."}
          {data.updated_by && (
            <span className="ml-1 text-gray-300">
              · {data.updated_by}
              {data.updated_at ? ` · ${fmtDateTime(data.updated_at)}` : ""}
            </span>
          )}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        aria-pressed={data.email_enabled}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
          data.email_enabled ? "bg-periwinkle" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            data.email_enabled ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
