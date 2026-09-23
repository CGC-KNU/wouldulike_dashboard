"use client";

import { useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { focusRing } from "../_shared/ui";

/**
 * 테스트로 만든 매장 지우기 — 파트너 계약 탭 안에서 (민열님 0923 인계 ②).
 *
 * 왜 여기냐 — 삭제 UI 가 원래 `식당 관리` 탭에 있는데 그 탭이 **어느 제품에도 안 묶인 고아 탭**이라
 * `?tab=restaurants` 로 딥링크해도 런처로 떨어진다. 갈 수가 없으니 지울 수가 없었다.
 * 테스트 매장이 생기는 자리가 여기(온보딩 링크 발급)이니, 치우는 자리도 여기가 맞다.
 *
 * **테스트로 보이는 매장에만** 뜬다(`looksLikeTest`). 진짜 파트너 매장 옆에 삭제 버튼을 두지 않는다 —
 * 실수로 누르면 되돌릴 수 없고, 손님 스탬프·쿠폰이 같이 사라진다.
 *
 * 2차 비밀번호는 백엔드가 요구한다(`AdminRestaurantView.delete`). 여기서 받아 그대로 넘기고
 * **어디에도 남기지 않는다** — 상태에만 잠깐 있다가 닫으면 사라진다.
 */

/** 이름만 보고 테스트인지 고른다. 애매하면 '아니다' — 진짜 매장에 삭제 버튼이 뜨는 쪽이 훨씬 나쁘다. */
export function looksLikeTest(name: string): boolean {
  return /(^|[\s_-])?(테스트|test|더미|dummy|샘플|sample)/i.test(name || "");
}

export default function TestStoreDelete({ rid, name, onDeleted }: { rid: number; name: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (!pw) { setErr("2차 비밀번호를 입력해 주세요."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/dashboard/admin/restaurants/${rid}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secondary_password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.detail ?? "삭제하지 못했습니다."); return; }
      setPw(""); setOpen(false);
      onDeleted();
    } catch {
      setErr("연결하지 못했습니다.");
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setErr(""); }}
        className={`inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-400 hover:text-red-600 rounded ${focusRing}`}>
        <IconTrash size={13} aria-hidden="true" />테스트 매장 지우기
      </button>
    );
  }

  return (
    <div className="mt-1.5 rounded-xl border border-red-200 bg-red-50/60 p-2.5">
      <p className="text-[12px] font-semibold text-red-700">「{name}」 을(를) 지웁니다</p>
      <p className="text-[11.5px] text-gray-600 mt-0.5">되돌릴 수 없습니다. 쿠폰·스탬프 기록도 같이 사라집니다.</p>
      <div className="flex gap-1.5 mt-2">
        <input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="2차 비밀번호" aria-label="2차 비밀번호" autoComplete="off"
          className="flex-1 min-w-0 text-[12.5px] border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400"
        />
        <button type="button" onClick={run} disabled={busy}
          className={`shrink-0 text-[12.5px] font-bold text-white bg-red-600 rounded-lg px-3 disabled:opacity-60 ${focusRing}`}>
          {busy ? "지우는 중…" : "삭제"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setPw(""); setErr(""); }}
          className={`shrink-0 text-[12.5px] font-semibold text-gray-500 px-2 ${focusRing}`}>취소</button>
      </div>
      {err && <p role="alert" className="text-[11.5px] text-red-700 mt-1.5">{err}</p>}
    </div>
  );
}
