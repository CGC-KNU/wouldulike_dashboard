"use client";

import { useCallback, useEffect, useState } from "react";

import AssigneePicker from "./AssigneePicker";
import { SPONSORSHIP_STATUS_META, ShootOwner, Sponsorship, SatelliteMember } from "./types";

/**
 * 촬영 담당자 복수 선택 + 직접입력 (마케팅팀 피드백 2026-08-26: "촬영 담당자를
 * 복수로 선택할 수 있게", 목록 인원과 직접입력 혼용 가능). 칩으로 이미 고른 사람을
 * 보여주고, AssigneePicker로 하나씩 추가한다.
 */
function ShootOwnersEditor({
  members,
  value,
  onChange,
}: {
  members: SatelliteMember[];
  value: ShootOwner[];
  onChange: (next: ShootOwner[]) => void;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingName, setPendingName] = useState("");

  function add() {
    if (pendingId != null) {
      if (value.some((o) => o.account_id === pendingId)) return;
      const m = members.find((mm) => mm.id === pendingId);
      onChange([...value, { account_id: pendingId, name: m ? m.display_name || m.username : "" }]);
    } else if (pendingName.trim()) {
      onChange([...value, { account_id: null, name: pendingName.trim() }]);
    } else {
      return;
    }
    setPendingId(null);
    setPendingName("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((o, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-periwinkle bg-periwinkle/10 border border-periwinkle/20 rounded-full pl-2.5 pr-1.5 py-1"
            >
              {o.name}
              <button
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-periwinkle/20"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <AssigneePicker
            members={members}
            accountId={pendingId}
            nameOverride={pendingName}
            onChange={(id, name) => {
              setPendingId(id);
              setPendingName(name);
            }}
            unassignedLabel="촬영 담당자 추가"
          />
        </div>
        <button
          onClick={add}
          className="shrink-0 text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1.5 hover:bg-periwinkle/5"
        >
          추가
        </button>
      </div>
    </div>
  );
}

/**
 * 협찬 목록 (통합 업무 관리 기획안 §2·§4, 마케팅팀 피드백 2026-08-20) — 콘텐츠 칸반과
 * 완전히 분리된 새 모델(Sponsorship). §3 "협찬은 누구나 등록할 수 있으며" 그대로
 * 리드/멤버 구분 없이 전원이 전체 목록을 보고 등록·수정한다(에디터·피드백·업로드
 * 관리 대상이 아니다 — 오직 촬영 일정만).
 *
 * 필터 기본값은 "촬영예정"(§4) — 평소에는 앞으로 찍어야 할 협찬만 보이고, 지난
 * 촬영 건은 필터를 눌러야 보인다.
 */

type Filter = "scheduled" | "completed" | "all";

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: "scheduled", label: "촬영예정" },
  { key: "completed", label: "촬영완료" },
  { key: "all", label: "전체" },
];

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const DAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}(${DAY_KR[d.getDay()]}) ${hh}:${mi}`;
}

/** <input type="datetime-local"> 은 로컬시각 문자열(초 없음)을 쓴다. */
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SponsorshipList() {
  const [filter, setFilter] = useState<Filter>("scheduled");
  const [rows, setRows] = useState<Sponsorship[]>([]);
  const [members, setMembers] = useState<SatelliteMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [shootOwners, setShootOwners] = useState<ShootOwner[]>([]);
  const [shootAt, setShootAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/sponsorships?status=${filter}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows(d.sponsorships ?? []);
      } else {
        setErr(d.detail || "불러오지 못했습니다.");
      }
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/satellite/members")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMembers(Array.isArray(d) ? d : []))
      .catch(() => setMembers([]));
  }, []);

  async function submitNew() {
    if (!storeName.trim()) {
      alert("가게명/업무명을 입력해주세요.");
      return;
    }
    if (!shootAt) {
      alert("촬영 날짜 및 시간을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/satellite/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: storeName.trim(),
          shoot_owners: shootOwners.map((o) => (o.account_id ? { account_id: o.account_id } : { name: o.name })),
          shoot_datetime: shootAt,
          notes: notes.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`등록 실패\n\n${d.detail || `HTTP ${res.status}`}`);
        return;
      }
      setStoreName("");
      setShootOwners([]);
      setShootAt("");
      setNotes("");
      setShowForm(false);
      await load();
    } catch {
      alert("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function patchRow(id: number, body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/satellite/sponsorships/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`수정 실패\n\n${d.detail || `HTTP ${res.status}`}`);
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? d : r)));
    } catch {
      alert("네트워크 오류");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">협찬 목록</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              협찬 촬영 일정만 관리합니다 — 피드백·에디터·업로드 관리 대상이 아닙니다.
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-[11px] font-bold text-white bg-periwinkle rounded-lg px-3 py-2 hover:opacity-90 active:scale-95 transition-all shrink-0"
          >
            + 새 협찬 등록
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-gray-50 flex items-center gap-1.5">
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`text-[11px] font-semibold rounded-full px-3 py-1.5 transition-colors ${
                filter === t.key ? "bg-periwinkle text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {showForm && (
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/60 flex flex-col gap-2">
            <div className="flex flex-col md:flex-row gap-2">
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="가게명 / 업무명"
                className="flex-1 min-w-0 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle"
              />
              <input
                type="datetime-local"
                value={shootAt}
                onChange={(e) => setShootAt(e.target.value)}
                className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle md:w-52"
              />
            </div>
            <ShootOwnersEditor members={members} value={shootOwners} onChange={setShootOwners} />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="참고사항 (선택)"
              className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="text-[11px] font-semibold text-gray-500 rounded-lg px-3 py-2 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={submitNew}
                disabled={saving}
                className="text-[11px] font-bold text-white bg-periwinkle rounded-lg px-3 py-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? "등록 중..." : "등록"}
              </button>
            </div>
          </div>
        )}

        {loading && <p className="text-[11px] text-gray-300 text-center py-8">불러오는 중...</p>}
        {!loading && err && <p className="text-[11px] text-red-500 text-center py-8">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="text-[11px] text-gray-300 text-center py-8">
            {filter === "scheduled" ? "예정된 협찬 촬영이 없습니다." : "표시할 협찬 건이 없습니다."}
          </p>
        )}

        {!loading && !err && rows.length > 0 && (
          <div className="divide-y divide-gray-50">
            {rows.map((s) => {
              const st = SPONSORSHIP_STATUS_META[s.status];
              const editing = editingId === s.id;
              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-400 w-32 shrink-0">{fmtDateTime(s.shoot_datetime)}</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">{s.store_name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{s.shoot_owner_name || "담당 미정"}</span>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-1 border shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                    <button
                      onClick={() => setEditingId(editing ? null : s.id)}
                      className="text-[10px] font-semibold text-gray-400 hover:text-periwinkle shrink-0"
                    >
                      {editing ? "닫기" : "수정"}
                    </button>
                  </div>
                  {s.notes && !editing && (
                    <p className="text-[10px] text-gray-400 mt-1 pl-[8.5rem] truncate">{s.notes}</p>
                  )}

                  {editing && (
                    <div className="mt-2.5 pl-[8.5rem] flex flex-col gap-2">
                      <div className="flex flex-col md:flex-row gap-2">
                        <input
                          defaultValue={s.store_name}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== s.store_name) {
                              patchRow(s.id, { store_name: e.target.value.trim() });
                            }
                          }}
                          className="flex-1 min-w-0 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle"
                        />
                        <input
                          type="datetime-local"
                          defaultValue={toLocalInputValue(s.shoot_datetime)}
                          onChange={(e) => e.target.value && patchRow(s.id, { shoot_datetime: e.target.value })}
                          className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle md:w-52"
                        />
                      </div>
                      <ShootOwnersEditor
                        members={members}
                        value={s.shoot_owners}
                        onChange={(next) =>
                          patchRow(s.id, {
                            shoot_owners: next.map((o) => (o.account_id ? { account_id: o.account_id } : { name: o.name })),
                          })
                        }
                      />
                      <input
                        defaultValue={s.notes}
                        onBlur={(e) => {
                          if (e.target.value !== s.notes) patchRow(s.id, { notes: e.target.value });
                        }}
                        placeholder="참고사항"
                        className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
