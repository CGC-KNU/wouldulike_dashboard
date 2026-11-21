"use client";

import { useEffect, useRef, useState } from "react";
import { IconFolder, IconHome, IconMessageChatbot, IconMoodSmile } from "@tabler/icons-react";
import NotificationBell from "@/components/NotificationBell";
import { BusinessCardButton } from "@/components/BusinessCard";
import { useThemeToggle } from "@/components/ThemeClock";
import { focusRing } from "./ui";

/**
 * 왼쪽 앱 레일 — 슬랙 맨 왼쪽 줄처럼 (1121 민열님).
 *
 *   위: 홈 · 앱들 — 이름은 **원래 앱 이름**(Astro · Papillon …, 1121 2차: "영업 · 마케팅 이런 게 아니라 원래 앱 이름으로")
 *   아래: 알림 · 밝기 · 리브라 · 내 계정(파트너 화면 · 명함 · 로그아웃) — 위쪽 줄(AdminHeader)에 있던 것을 슬랙처럼 여기로 옮겼다.
 *        레일이 떠 있는 동안 body[data-rail="1"] 을 달고, 위쪽 줄은 그걸 보고 오른쪽 묶음을 숨긴다.
 *
 * 넓은 화면(lg 이상)에서만. 폰은 위쪽 줄 · 아래 도크 그대로.
 */

export interface RailItem { key: string; name: string }
export interface RailUser { name: string; title?: string | null; role?: string | null }

/** 일 순서 — 영업 · 마케팅이 위, 개발이 아래 */
const ORDER = ["astro", "hubble", "papillon", "probe", "aether", "castor", "drive", "playroom"];
const NAME: Record<string, string> = { drive: "Drive", playroom: "세티" };
const APP_ICON = new Set(["papillon", "astro", "hubble", "aether", "probe", "castor"]);

export default function AppRail({ items, active, onHome, onSelect, badge, libra, user }: {
  items: RailItem[]; active: string | null; onHome: () => void; onSelect: (key: string) => void;
  badge?: (key: string) => number;
  libra?: { channelUrl: string; channel: string; context: string };
  user?: RailUser;
}) {
  const [copied, setCopied] = useState(false);
  const { theme, toggle } = useThemeToggle();
  const list = [...items].filter((i) => ORDER.includes(i.key)).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  // 위쪽 줄이 오른쪽 묶음을 숨기는 신호
  useEffect(() => {
    document.body.dataset.rail = "1";
    return () => { delete document.body.dataset.rail; };
  }, []);

  async function talk() {
    if (!libra) return;
    // 슬랙 링크는 본문을 못 채운다 — 태그와 지금 화면을 복사해 두고 채널을 연다(도크와 같다)
    try { await navigator.clipboard.writeText(`@Libra [${libra.context}] `); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { /* 무시 */ }
    window.open(libra.channelUrl, "_blank", "noreferrer");
  }

  return (
    // 펼침(알림 · 내 계정)이 레일 밖으로 나가야 해서 nav 자체는 넘침을 자르지 않는다 — 앱 목록만 스크롤
    <nav aria-label="앱" className="hidden lg:flex fixed left-0 top-14 bottom-0 z-30 w-[76px] flex-col items-center bg-[#050072] border-r border-white/10">
      <div className="w-full flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] flex flex-col items-center gap-0.5 pt-3">
        <RailButton label="홈" on={active === null} onClick={onHome}>
          <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-white/10 text-white"><IconHome size={19} stroke={1.9} aria-hidden="true" /></span>
        </RailButton>
        {list.length > 0 && <span aria-hidden="true" className="w-8 h-px bg-white/15 my-1.5 shrink-0" />}
        {list.map((t) => (
          <RailButton key={t.key} label={NAME[t.key] ?? t.name} on={active === t.key} onClick={() => onSelect(t.key)} count={badge?.(t.key) ?? 0}>
            {APP_ICON.has(t.key)
              ? <img src={`/satellite/${t.key}_app.svg`} alt="" width={36} height={36} className="w-9 h-9 rounded-[11px]" aria-hidden="true" />
              : <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-white/10 text-white">{t.key === "playroom" ? <IconMoodSmile size={19} stroke={1.9} aria-hidden="true" /> : <IconFolder size={18} stroke={1.9} aria-hidden="true" />}</span>}
          </RailButton>
        ))}
      </div>

      {/* 아래 — 위쪽 줄에서 옮겨 온 것 */}
      <div className="w-full flex flex-col items-center gap-1.5 py-3 border-t border-white/10">
        <NotificationBell placement="rail" />
        <button type="button" onClick={toggle} aria-label={theme === "dark" ? "라이트 모드로" : "다크 모드로"} title={theme === "dark" ? "라이트 모드로 (오늘만)" : "다크 모드로 (오늘만)"}
          className={`w-9 h-9 rounded-[11px] grid place-items-center text-white/55 hover:text-white hover:bg-white/10 transition-colors ${focusRing}`}>
          {theme === "dark"
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>}
        </button>
        {libra && (
          <div className="relative">
            <button type="button" onClick={talk} aria-label={`리브라랑 대화 — #${libra.channel} 에서 @Libra`} title={`리브라랑 대화 — #${libra.channel}`}
              className={`w-9 h-9 rounded-[11px] grid place-items-center bg-[linear-gradient(135deg,#7FE9CB,#2BBE9B)] text-white hover:brightness-110 ${focusRing}`}>
              <IconMessageChatbot size={19} stroke={1.9} aria-hidden="true" />
            </button>
            {copied && <span role="status" className="absolute left-full ml-3 bottom-1 whitespace-nowrap text-[11px] font-semibold text-white bg-libra-deep rounded-lg px-2.5 py-1.5 shadow-lg">@Libra 태그 복사됨 · #{libra.channel} 에 붙여넣고 질문하세요</span>}
          </div>
        )}
        {user && <Me user={user} />}
      </div>
    </nav>
  );
}

/** 내 계정 — 슬랙 맨 아래 얼굴처럼. 누르면 이름 · 직함, 파트너 화면, 명함, 로그아웃 */
function Me({ user }: { user: RailUser }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const initial = (user.name || "?").trim().slice(0, 1);
  const item = `w-full flex items-center gap-2.5 px-3 h-9 text-[13px] font-semibold text-gray-800 hover:bg-navy/[0.05] text-left ${focusRing}`;
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true" aria-label={`내 계정 — ${user.name}`} title={user.name}
        className={`w-9 h-9 rounded-[11px] bg-white text-navy text-[14px] font-bold grid place-items-center ring-2 ring-white/20 hover:ring-white/50 ${focusRing}`}>
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute left-full bottom-0 ml-3 w-[220px] bg-white rounded-[14px] border border-black/[0.08] shadow-[0_16px_48px_-16px_rgba(5,0,114,0.45)] overflow-hidden z-50 py-1">
          <div className="px-3 py-2 border-b border-black/[0.06]">
            <p className="text-[13.5px] font-bold text-gray-900 truncate">{user.name}</p>
            <p className="text-[11.5px] text-gray-500 truncate">{[user.title, user.role].filter(Boolean).join(" · ")}</p>
          </div>
          <a href="/dashboard/owner" role="menuitem" className={item}>파트너 화면으로 보기</a>
          {/* 명함 이스터에그(1002) — 버튼은 아이콘뿐이라 남색 원 안에 두고 글을 옆에 */}
          <div className="flex items-center gap-1 pl-1.5 pr-3 h-9 hover:bg-navy/[0.05]">
            <span className="rounded-lg bg-navy"><BusinessCardButton /></span>
            <span className="text-[13px] font-semibold text-gray-800">내 명함</span>
          </div>
          <a href="/api/auth/logout" role="menuitem" className={`${item} text-red-600 border-t border-black/[0.06] mt-1`}>로그아웃</a>
        </div>
      )}
    </div>
  );
}

function RailButton({ label, on, onClick, count = 0, children }: { label: string; on: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-current={on ? "page" : undefined}
      className={`group relative w-[64px] shrink-0 flex flex-col items-center gap-1 py-1.5 rounded-[14px] transition-colors ${focusRing} ${on ? "bg-white/[0.14]" : "hover:bg-white/[0.08]"}`}>
      <span className={`relative transition-transform duration-150 group-active:scale-95 ${on ? "" : "opacity-85 group-hover:opacity-100"}`}>
        {children}
        {count > 0 && <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10.5px] font-bold tabular-nums grid place-content-center ring-2 ring-[#050072]">{count}</span>}
      </span>
      <span className={`text-[11px] font-semibold leading-tight ${on ? "text-white" : "text-white/70 group-hover:text-white"}`}>{label}</span>
    </button>
  );
}
