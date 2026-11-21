"use client";

import { useState } from "react";
import { IconFolder, IconHome, IconMessageChatbot, IconMoodSmile } from "@tabler/icons-react";
import { focusRing } from "./ui";

/**
 * 왼쪽 앱 레일 — 슬랙 맨 왼쪽 줄처럼 (1121 민열님: "앱 종류는 그냥 슬랙처럼 좌측에 모는 게 나을 듯").
 *
 * 넓은 화면(lg 이상)에서만 화면 왼쪽에 붙어 있다. 메인이든 툴 안이든 같은 자리 — 앱을 바꾸려고 메인으로 나갈 필요가 없다.
 * 그 자리에선 아래 도크와 메인의 「바로 가기」를 숨긴다(둘 다 같은 일). 폰은 자리가 없어 도크를 그대로 쓴다.
 * 이름은 앱 이름이 아니라 하는 일(영업 · 마케팅 …) — 새로 온 사람에게 Astro · Probe 는 지도가 아니라 벽이다(QA 1121 III).
 */

export interface RailItem { key: string; name: string }

const LABEL: Record<string, string> = {
  astro: "영업", hubble: "탐색", papillon: "마케팅", probe: "데이터", aether: "운영", castor: "앱 구조", drive: "파일", playroom: "세티",
};
/** 일 순서 — 영업 · 마케팅이 위, 개발이 아래 */
const ORDER = ["astro", "hubble", "papillon", "probe", "aether", "castor", "drive", "playroom"];
const APP_ICON = new Set(["papillon", "astro", "hubble", "aether", "probe", "castor"]);

export default function AppRail({ items, active, onHome, onSelect, badge, libra }: {
  items: RailItem[]; active: string | null; onHome: () => void; onSelect: (key: string) => void;
  badge?: (key: string) => number;
  libra?: { channelUrl: string; channel: string; context: string };
}) {
  const [copied, setCopied] = useState(false);
  const list = [...items].filter((i) => ORDER.includes(i.key)).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  async function talk() {
    if (!libra) return;
    // 슬랙 링크는 본문을 못 채운다 — 태그와 지금 화면을 복사해 두고 채널을 연다(도크와 같다)
    try { await navigator.clipboard.writeText(`@Libra [${libra.context}] `); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { /* 무시 */ }
    window.open(libra.channelUrl, "_blank", "noreferrer");
  }

  return (
    <nav aria-label="앱" className="hidden lg:flex fixed left-0 top-14 bottom-0 z-30 w-[76px] flex-col items-center py-3 gap-0.5 bg-[#050072] border-r border-white/10 overflow-y-auto [scrollbar-width:none]">
      <RailButton label="홈" on={active === null} onClick={onHome}>
        <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-white/10 text-white"><IconHome size={19} stroke={1.9} aria-hidden="true" /></span>
      </RailButton>
      {list.length > 0 && <span aria-hidden="true" className="w-8 h-px bg-white/15 my-1.5" />}
      {list.map((t) => (
        <RailButton key={t.key} label={LABEL[t.key] ?? t.name} title={`${t.name} · ${LABEL[t.key] ?? ""}`} on={active === t.key} onClick={() => onSelect(t.key)} count={badge?.(t.key) ?? 0}>
          {APP_ICON.has(t.key)
            ? <img src={`/satellite/${t.key}_app.svg`} alt="" width={36} height={36} className="w-9 h-9 rounded-[11px]" aria-hidden="true" />
            : <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-white/10 text-white">{t.key === "playroom" ? <IconMoodSmile size={19} stroke={1.9} aria-hidden="true" /> : <IconFolder size={18} stroke={1.9} aria-hidden="true" />}</span>}
        </RailButton>
      ))}
      <span className="flex-1" />
      {libra && (
        <div className="relative">
          <RailButton label="리브라" title={`리브라랑 대화 — #${libra.channel} 에서 @Libra`} on={false} onClick={talk}>
            <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-[linear-gradient(135deg,#7FE9CB,#2BBE9B)] text-white"><IconMessageChatbot size={19} stroke={1.9} aria-hidden="true" /></span>
          </RailButton>
          {copied && <span role="status" className="absolute left-[80px] bottom-2 whitespace-nowrap text-[11px] font-semibold text-white bg-libra-deep rounded-lg px-2.5 py-1.5 shadow-lg">@Libra 태그 복사됨 · #{libra.channel} 에 붙여넣고 질문하세요</span>}
        </div>
      )}
    </nav>
  );
}

function RailButton({ label, title, on, onClick, count = 0, children }: { label: string; title?: string; on: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title ?? label} aria-current={on ? "page" : undefined}
      className={`group relative w-[64px] flex flex-col items-center gap-1 py-1.5 rounded-[14px] transition-colors ${focusRing} ${on ? "bg-white/[0.14]" : "hover:bg-white/[0.08]"}`}>
      <span className={`relative transition-transform duration-150 group-active:scale-95 ${on ? "" : "opacity-85 group-hover:opacity-100"}`}>
        {children}
        {count > 0 && <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10.5px] font-bold tabular-nums grid place-content-center ring-2 ring-[#050072]">{count}</span>}
      </span>
      <span className={`text-[11px] font-semibold leading-tight ${on ? "text-white" : "text-white/70 group-hover:text-white"}`}>{label}</span>
    </button>
  );
}
