"use client";

import { useState } from "react";

import AssigneePicker from "./AssigneePicker";
import { ShootOwner, SatelliteMember } from "./types";

/**
 * 담당자 **복수** 선택 + 직접입력.
 *
 * 촬영 담당자에서 먼저 쓰던 것을(마케팅팀 피드백 2026-08-26) 콘텐츠 칸반의 편집 담당자도
 * 쓰게 되면서 공용 부품으로 옮겼다 (아윤님 2026-09-14: "콘텐츠 칸반에서 담당자 복수로").
 * 같은 화면이 두 곳에 있으면 한쪽만 고쳐지고 반드시 어긋난다.
 *
 * 고른 사람은 칩으로 쌓이고, 칩의 × 로 뺀다. 목록에 없는 사람은 `AssigneePicker` 의
 * '기타(직접 입력)' 로 넣는다 — 계정이 없으므로 `account_id` 는 null 이고 이름만 남는다.
 */
export default function AssigneeMultiPicker({
  members,
  value,
  onChange,
  addLabel = "담당자 추가",
  disabled,
}: {
  members: SatelliteMember[];
  value: ShootOwner[];
  onChange: (next: ShootOwner[]) => void;
  addLabel?: string;
  disabled?: boolean;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingName, setPendingName] = useState("");

  function add() {
    if (pendingId != null) {
      if (value.some((o) => o.account_id === pendingId)) return;   // 같은 사람 두 번은 막는다
      const m = members.find((mm) => mm.id === pendingId);
      onChange([...value, { account_id: pendingId, name: m ? m.display_name || m.username : "" }]);
    } else if (pendingName.trim()) {
      const nm = pendingName.trim();
      if (value.some((o) => o.account_id === null && o.name === nm)) return;
      onChange([...value, { account_id: null, name: nm }]);
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
            <span key={`${o.account_id ?? "n"}-${o.name}-${i}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-periwinkle bg-periwinkle/10 border border-periwinkle/20 rounded-full pl-2.5 pr-1.5 py-1">
              {o.name}
              {!disabled && (
                <button type="button" aria-label={`${o.name} 빼기`}
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-periwinkle/20">×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <AssigneePicker members={members} accountId={pendingId} nameOverride={pendingName}
              onChange={(id, name) => { setPendingId(id); setPendingName(name); }}
              unassignedLabel={addLabel} />
          </div>
          <button type="button" onClick={add}
            className="shrink-0 text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1.5 hover:bg-periwinkle/5">
            추가
          </button>
        </div>
      )}
    </div>
  );
}
