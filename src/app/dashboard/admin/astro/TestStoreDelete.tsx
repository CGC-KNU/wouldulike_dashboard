"use client";

import { useEffect, useRef, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { focusRing } from "../_shared/ui";

/**
 * 테스트로 만든 매장 지우기 (민열님 0923 인계 ②).
 *
 * 삭제 화면이 원래 **어느 제품에도 안 묶인 고아 탭**(`restaurants`)에 있어 갈 수가 없었다.
 * 테스트 매장이 보이는 자리는 파트너 매장 탭의 '테스트' 필터라, 치우는 자리도 거기다.
 *
 * ## 왜 표 안이 아니라 덮는 창인가 (0923 사고)
 * 처음에는 표 줄 안에서 비밀번호 칸을 열었다. 그랬더니 **크롬이 그 칸을 로그인 폼으로 오해해서
 * 저장해 둔 아이디를 화면의 매장 검색창에 자동으로 채웠다.** 검색어가 생기니 목록이 0곳이 되고,
 * 누른 사람에게는 "지우기를 눌렀더니 매장이 다 사라졌다"로 보인다.
 * 그래서 (1) 표 밖 덮는 창으로 빼고 (2) 자동완성이 물 미끼 칸을 창 안에 둔다.
 *
 * 2차 비밀번호는 백엔드가 요구한다(`AdminRestaurantView.delete`). 여기서 받아 그대로 넘기고
 * **어디에도 남기지 않는다** — 상태에만 잠깐 있다가 닫으면 사라진다.
 */

/**
 * 테스트 매장인가. **`ops.is_test` 가 먼저다** — 사람이 그렇게 표시한 값이라 이름 짐작보다 정확하다.
 * 플래그가 없을 때만 이름으로 본다(플래그를 안 켜고 만든 옛 테스트 매장). 애매하면 '아니다' —
 * 진짜 매장 옆에 삭제 버튼이 뜨는 쪽이 훨씬 나쁘다.
 */
export function looksLikeTest(name: string, isTest?: boolean | null): boolean {
  if (isTest === true) return true;
  if (isTest === false) return false;
  return /(^|[\s_-])?(테스트|test|더미|dummy|샘플|sample)/i.test(name || "");
}

export default function TestStoreDelete({ rid, name, onDeleted }: { rid: number; name: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => pwRef.current?.focus(), 40);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setPw(""); setErr(""); } };
    window.addEventListener("keydown", esc);
    return () => { clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [open]);

  function close() { setOpen(false); setPw(""); setErr(""); }

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
      close();
      onDeleted();
    } catch {
      setErr("연결하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); setErr(""); }}
        className={`inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-400 hover:text-red-600 rounded ${focusRing}`}>
        <IconTrash size={13} aria-hidden="true" />지우기
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${name} 삭제`}
          onClick={(e) => { e.stopPropagation(); close(); }}>
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative w-full max-w-sm rounded-[18px] bg-white shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[15px] font-bold text-gray-900">「{name}」 을(를) 지웁니다</h2>
            <p className="text-[12.5px] text-gray-500 mt-1 leading-relaxed">
              되돌릴 수 없습니다. 이 매장의 쿠폰·스탬프 기록도 같이 사라집니다.
            </p>

            {/* 자동완성 미끼 — 크롬은 비밀번호 칸 옆에서 아이디 칸을 찾는다. 이게 없으면 화면의 검색창을 채운다(0923). */}
            <input type="text" name="fake-user" autoComplete="username" tabIndex={-1} aria-hidden="true"
              className="absolute opacity-0 pointer-events-none w-0 h-0" />

            <input
              ref={pwRef} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(); }}
              placeholder="2차 비밀번호" aria-label="2차 비밀번호"
              autoComplete="new-password" name="secondary-password"
              className="mt-3 w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
            />
            {err && <p role="alert" className="text-[12px] text-red-700 mt-2">{err}</p>}

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={run} disabled={busy}
                className={`flex-1 text-[13px] font-bold text-white bg-red-600 rounded-lg py-2 disabled:opacity-60 ${focusRing}`}>
                {busy ? "지우는 중…" : "삭제"}
              </button>
              <button type="button" onClick={close}
                className={`text-[13px] font-semibold text-gray-600 px-4 rounded-lg border border-gray-200 ${focusRing}`}>취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
