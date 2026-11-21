"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft, IconArrowRight, IconMessageChatbot, IconSearch } from "@tabler/icons-react";

/**
 * 위쪽 줄 가운데 — 슬랙처럼 ‹ › · 검색 · 리브라 (1121 민열님).
 *
 * 위쪽 줄(AdminHeader)은 레이아웃에 있어서 지금 어느 툴 · 어느 탭인지 모른다. 그래서 줄에는 빈 자리(#sat-header-center)만 두고,
 * 상태를 아는 page 가 이 묶음을 그 자리에 꽂는다(portal).
 *   ‹ › — 브라우저 뒤로 · 앞으로. 툴 · 탭을 옮길 때마다 주소가 기록되므로(page.syncUrl) 그대로 먹는다.
 *   검색 — 누르면(또는 ⌘K) 화면 · 파트너 매장 · 후보를 찾는 창(CommandPalette)이 열린다. `satellite:search` 이벤트로 연다.
 *   리브라에게 물어보기 — 지금 화면의 슬랙 채널을 열고 `@Libra [화면]` 을 복사해 둔다(전에는 레일 아래 · 도크에 있던 것).
 */
export default function HeaderTools({ libra }: { libra?: { channelUrl: string; channel: string; context: string } }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setSlot(document.getElementById("sat-header-center")); }, []);
  if (!slot) return null;

  async function talk() {
    if (!libra) return;
    try { await navigator.clipboard.writeText(`@Libra [${libra.context}] `); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { /* 무시 */ }
    window.open(libra.channelUrl, "_blank", "noreferrer");
  }
  const ghost = "w-7 h-7 rounded-md grid place-items-center text-white/60 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

  return createPortal(
    <div className="flex items-center gap-1.5 w-full max-w-[720px] min-w-0">
      <div className="hidden md:flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={() => history.back()} aria-label="뒤로" title="뒤로" className={ghost}><IconArrowLeft size={17} stroke={2} aria-hidden="true" /></button>
        <button type="button" onClick={() => history.forward()} aria-label="앞으로" title="앞으로" className={ghost}><IconArrowRight size={17} stroke={2} aria-hidden="true" /></button>
      </div>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("satellite:search"))}
        className="flex-1 min-w-0 h-7 rounded-md bg-white/[0.14] hover:bg-white/[0.2] border border-white/10 px-2.5 flex items-center gap-2 text-left text-[12.5px] text-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
        <IconSearch size={14} stroke={2} aria-hidden="true" className="shrink-0" />
        <span className="truncate">세틀라이트에서 검색 — 화면 · 매장 · 후보</span>
        <kbd className="ml-auto hidden sm:inline text-[10.5px] font-semibold text-white/55">⌘K</kbd>
      </button>
      {libra && (
        <div className="relative shrink-0">
          <button type="button" onClick={talk} title={`#${libra.channel} 에서 @Libra 에게`}
            className="h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[linear-gradient(135deg,#3FCFA6,#1F9E80)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <IconMessageChatbot size={15} stroke={2} aria-hidden="true" />
            <span className="hidden sm:inline">리브라에게 물어보기</span>
          </button>
          {copied && <span role="status" className="absolute right-0 top-9 whitespace-nowrap text-[11px] font-semibold text-white bg-libra-deep rounded-lg px-2.5 py-1.5 shadow-lg z-50">@Libra 태그 복사됨 · #{libra.channel} 에 붙여넣고 질문하세요</span>}
        </div>
      )}
    </div>,
    slot,
  );
}
