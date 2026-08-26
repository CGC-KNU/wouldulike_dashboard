"use client";

import { useState } from "react";
import { SatelliteMember } from "./types";

const OTHER_VALUE = "__other__";

/**
 * 담당자 선택 — 목록(SatelliteMember) + "기타(직접 입력)" (마케팅팀 피드백
 * 2026-08-26: "담당자 선택 시 인원 목록에 '기타' 옵션을 추가하고, 목록에 없는
 * 인원은 직접 입력하여 추가할 수 있게"). 실제 계정이 아니므로 selected id는
 * null로 두고 표시용 텍스트만 별도로 저장한다(백엔드 owner_name_override 패턴과
 * 동일 — Sponsorship.shoot_owners 의 {name: ...} 항목도 이 컴포넌트를 재사용한다).
 */
export default function AssigneePicker({
  members,
  accountId,
  nameOverride,
  onChange,
  disabled,
  unassignedLabel = "담당자 선택",
}: {
  members: SatelliteMember[];
  accountId: number | null;
  nameOverride: string;
  onChange: (accountId: number | null, nameOverride: string) => void;
  disabled?: boolean;
  unassignedLabel?: string;
}) {
  // 드롭다운에서 방금 "기타"를 골랐지만 아직 이름을 안 친 상태(nameOverride="")도
  // 입력칸이 계속 보여야 하므로, 데이터로만 판단하지 않고 사용자가 고른 모드를
  // 별도로 기억한다.
  const [forcedOther, setForcedOther] = useState(false);
  const isOther = forcedOther || (!accountId && !!nameOverride);
  const selectValue = isOther ? OTHER_VALUE : accountId ?? "";

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER_VALUE) {
            setForcedOther(true);
            onChange(null, nameOverride);
            return;
          }
          setForcedOther(false);
          onChange(v ? Number(v) : null, "");
        }}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">{unassignedLabel}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name || m.username}
          </option>
        ))}
        <option value={OTHER_VALUE}>기타(직접 입력)</option>
      </select>
      {isOther && (
        <input
          type="text"
          value={nameOverride}
          onChange={(e) => onChange(null, e.target.value)}
          disabled={disabled}
          placeholder="이름 직접 입력"
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-periwinkle disabled:bg-gray-50"
        />
      )}
    </div>
  );
}
