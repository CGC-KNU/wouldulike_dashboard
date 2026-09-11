"use client";

import { useState } from "react";
import { CAMPUSES } from "@/lib/draft/types";
import { Input, Select, focusRing } from "../_shared/ui";

/**
 * 캠퍼스 고르기 — 기본 3곳(경북대·영남대·계명대) + **지금 데이터에 있는 것** + 직접 추가.
 * 새 대학 상권에 들어갈 때 코드를 고치지 않아도 되게 (민열님 0911).
 */

/** 기본값 + 데이터에 들어 있는 값 (중복 제거, 기본값이 앞). */
export function allCampuses(...lists: (string | null | undefined)[][]): string[] {
  const seen = new Set<string>(CAMPUSES);
  for (const l of lists) for (const c of l) if (c && c.trim()) seen.add(c.trim());
  return [...seen];
}

export default function CampusPicker({ value, options, onChange, id }: { value: string | null; options: string[]; onChange: (v: string) => void; id?: string }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const list = options.includes(value ?? "") || !value ? options : [...options, value];

  if (adding) {
    const commit = () => { const v = draft.trim(); if (v) onChange(v); setAdding(false); setDraft(""); };
    return (
      <div className="flex gap-1.5">
        <Input id={id} value={draft} autoFocus placeholder="새 캠퍼스 이름 (예: 대구대)" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setAdding(false); setDraft(""); } }} onBlur={commit} />
        <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className={`shrink-0 px-2 text-[12px] text-gray-500 hover:text-gray-800 rounded ${focusRing}`}>취소</button>
      </div>
    );
  }
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => { if (e.target.value === "__new") { setAdding(true); return; } onChange(e.target.value); }}>
      {!value && <option value="">선택</option>}
      {list.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value="__new">+ 캠퍼스 추가…</option>
    </Select>
  );
}
