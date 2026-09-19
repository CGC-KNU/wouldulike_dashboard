"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SatelliteStatus } from "./useSatelliteStatus";

/**
 * Satty(세티) — 세틀라이트에 같이 사는 위성 (민열님 0919 승인 시안 v4).
 *
 * 기능을 해치지 않는 여백(런처 우하단)에 작게 있다. 숫자가 좋으면 기뻐하고, 막힌 일이 쌓이면
 * 지쳐 보이고, 아무 일 없을 때도 숨을 쉰다.
 *
 * 0919 민열님: **가끔 스스로 말을 건다**(처음 만나면 자기소개, 그 뒤로는 1~3분에 한 번). 원래는
 * 눌렀을 때만 말하게 했는데, 그러면 아무도 안 누른다. 대신 선은 지킨다 — 자는 시간(22~06)과
 * 다른 탭을 보는 동안은 조용하고, 말풍선의 '조용히'를 누르면 그날은 먼저 말하지 않는다.
 *
 * 생김새: 흰자 없는 점눈 둘 · 연보라 볼 · 아주 작은 입 · 몽글한 팔 둘 · 병뚜껑 안테나.
 * 페리윙클→네이비로 도는 공 하나. 선이 적을수록 귀엽다.
 * 색은 네이비·페리윙클·연보라 셋. 경고는 색이 아니라 **속도**로 낸다(안테나 불빛이 빨라진다).
 *
 * 기분은 **툴이 이미 가진 숫자**로만 정한다. 우선순위 주목 > 피곤 > 기쁨 > 밤 > 숨쉬기, 한 번에 한 기분.
 */

export type Mood = "idle" | "happy" | "tired" | "alert" | "sleep";

export interface MoodResult { mood: Mood; line: string; go?: string }

/** 기분 판정. 근거 한 줄과 그 화면을 같이 돌려준다 — 눌렀을 때 "왜"가 보여야 한다. */
export function moodOf(st: SatelliteStatus | null | undefined, weekItems: number, now = new Date()): MoodResult {
  const h = now.getHours();
  const stale = st?.leads?.stale ?? 0;
  const unpaid = st?.billing?.unpaid ?? 0;
  const pendingApprove = st?.billing?.pendingApprove ?? 0;
  const due = st?.probe?.due ?? 0;
  const held = st?.probe?.held ?? 0;
  const blocked = stale + unpaid + due + held;

  if (stale > 0) return { mood: "alert", line: `7일 넘게 멈춘 후보가 ${stale}곳이에요`, go: "astro-leads" };
  if (unpaid >= 3) return { mood: "alert", line: `미입금이 ${unpaid}곳이에요 — 확인해 볼까요`, go: "astro-billing" };
  if (blocked >= 5 || weekItems >= 10) return { mood: "tired", line: weekItems >= 10 ? `이번 주 일정이 ${weekItems}건… 같이 가요` : `막힌 일이 ${blocked}건이에요, 하나씩`, go: weekItems >= 10 ? "astro-calendar" : "astro-leads" };
  const paidThisMonth = st?.billing?.paid ?? 0;
  const recentContracts = st?.stores?.weeks?.slice(-2).reduce((a, b) => a + b, 0) ?? 0;
  if (paidThisMonth > 0 && (recentContracts > 0 || pendingApprove === 0)) return { mood: "happy", line: `이번 달 입금 ${paidThisMonth}건! 유료 ${st?.stores?.paid ?? 0}곳이에요`, go: "astro-billing" };
  if (h >= 22 || h < 5) return { mood: "sleep", line: "늦었어요, 내일 해도 돼요" };
  return { mood: "idle", line: "오늘도 조용히 돌고 있어요" };
}

/** 세티가 하는 말. `auto` 면 스스로 건 말이라 '조용히' 버튼을 같이 보여 준다. */
export interface Say { text: string; go?: string; auto?: boolean }

/**
 * 스스로 거는 말 — **성격**이지 데이터가 아니다. 숫자 이야기는 `moodOf` 한 줄이 한다.
 * 지어낸 수치를 여기 적지 말 것. 화면으로 데려갈 수 있는 말에만 `go` 를 단다.
 */
const HELLO = [
  "안녕하세요, 저는 세티예요.",
  "세틀라이트를 같이 돌면서 막힌 일을 봐요.",
  "심심하면 눌러 보세요. 끌어서 옮겨도 돼요.",
];

const SMALLTALK: Say[] = [
  { text: "저는 우주라이크 위를 도는 작은 위성이에요." },
  { text: "제 기분은 지어낸 게 아니에요. 툴에 있는 숫자로 정해요." },
  { text: "막힌 일이 없으면 저는 그냥 숨만 쉬어요." },
  { text: "저를 끌어서 아무 데나 두셔도 돼요. 그 자리 기억할게요." },
  { text: "이번 주 할 일은 달력에도 있어요.", go: "astro-calendar" },
  { text: "우리 팀 이야기는 Atlas 에 있어요.", go: "atlas-team" },
  { text: "폴라리스는 우리가 향하는 방향이에요." },
  { text: "0 이면 정말 0 이에요. 모르는 건 — 라고 적어 둬요." },
  { text: "커피 한 잔 하고 오셔도 숫자는 안 도망가요." },
  { text: "세 번 톡톡 두드리면 좋아해요." },
  { text: "매장이 늘면 제 안테나가 빨라져요.", go: "astro-ops" },
  { text: "오늘도 고생 많으세요." },
];

const PAT = ["히히, 간지러워요", "고마워요!", "좋아요, 더 해 주세요", "오늘 기분 좋아졌어요"];
const DROP = ["여기가 좋으세요? 기억할게요.", "새 자리 마음에 들어요.", "여기서 지켜볼게요."];

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** 화면 밖으로 나가지 않게. 가장자리에 8px 는 남긴다. */
function clampPos(p: { x: number; y: number }, w: number, h: number) {
  const pad = 8;
  return {
    x: Math.max(pad, Math.min(p.x, window.innerWidth - w - pad)),
    y: Math.max(pad, Math.min(p.y, window.innerHeight - h - pad)),
  };
}

/**
 * 커서가 가까이 오면 눈동자가 따라온다. 반경 3px 안에서만 — 더 가면 눈알이 돌아간 것처럼 보인다.
 */
/**
 * size — 런처는 md(우하단 56px). 툴 안에서는 sm(36px): 하단 도크 옆에 붙어 앉는다.
 * 폰에서는 도크가 화면 폭을 다 쓰니 도크 위로 올라간다. 도크 자체는 건드리지 않는다 — 도크 알약은
 * 가로 스크롤 상자라 말풍선이 잘린다.
 */
export default function Satty({ status, weekItems = 0, onGo, className = "", size = "md" }: { status?: SatelliteStatus | null; weekItems?: number; onGo?: (target: string) => void; className?: string; size?: "md" | "sm" }) {
  const res = useMemo(() => moodOf(status, weekItems), [status, weekItems]);
  const [say, setSay] = useState<Say | null>(null);
  const [petted, setPetted] = useState(false);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /**
   * 끌어서 옮길 수 있다 (민열님 0919). 놓은 자리는 그 브라우저에만 기억한다 — 사람마다 가리는 자리가 다르다.
   * 큰 판(런처)과 작은 판(툴 안)은 자리를 따로 기억한다. 저장된 자리가 없으면 원래 구석에 앉는다.
   */
  const posKey = `satty-pos-${size}`;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; x0: number; y0: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(posKey);
      if (raw) setPos(JSON.parse(raw) as { x: number; y: number });
    } catch { /* 저장소를 못 쓰면 원래 자리 */ }
  }, [posKey]);

  // 창이 좁아지면 밖으로 나간 세티를 도로 안으로 들인다
  useEffect(() => {
    if (!pos) return;
    const clampIn = () => {
      const el = ref.current; if (!el) return;
      setPos((p) => (p ? clampPos(p, el.offsetWidth, el.offsetHeight) : p));
    };
    window.addEventListener("resize", clampIn);
    return () => window.removeEventListener("resize", clampIn);
  }, [pos]);

  // 폰에서 스크롤 중엔 숨는다 — 손가락 자리를 뺏지 않는다. 멈추면 돌아온다.
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => { setHidden(true); clearTimeout(t); t = setTimeout(() => setHidden(false), 700); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(t); };
  }, []);

  // 눈동자 — 화면 어디에 커서가 있든 살짝 따라온다
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        setPupil({ x: Math.max(-1, Math.min(1, (e.clientX - cx) / 240)) * 2.6, y: Math.max(-1, Math.min(1, (e.clientY - cy) / 240)) * 2.2 });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  // ── 말하기. 한 번에 한 마디, 시간이 지나면 스스로 지운다.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speak = (s: Say, ms = 5200) => {
    setSay(s);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setSay(null), ms);
  };
  const speakRef = useRef(speak); speakRef.current = speak;
  const resRef = useRef(res); resRef.current = res;

  /** 오늘은 먼저 말 걸지 않기 — 그 브라우저, 그날만. */
  const quietKey = `satty-quiet-${todayKey()}`;
  const [quiet, setQuiet] = useState(true); // 저장소를 읽기 전에는 조용히 — 깜빡 뜨는 걸 막는다
  useEffect(() => {
    try { setQuiet(localStorage.getItem(quietKey) === "1"); } catch { setQuiet(false); }
  }, [quietKey]);

  /**
   * 스스로 말 거는 타이머. 막힌 일이 있으면 그 이야기를 더 자주 한다.
   * 툴 안(작은 판)에서는 일하는 중이니 훨씬 뜸하게.
   */
  useEffect(() => {
    if (quiet) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const base = size === "sm" ? 210_000 : 95_000;
    const next = (ms: number) => { t = setTimeout(tick, ms); };

    const tick = () => {
      if (!alive) return;
      const h = new Date().getHours();
      if (h >= 22 || h < 6) return next(10 * 60_000);          // 자는 시간엔 안 깨운다
      if (document.hidden) return next(60_000);                 // 다른 탭을 보는 동안은 조용히
      const r = resRef.current;
      const urgent = r.mood === "alert" || r.mood === "tired";
      const useData = Math.random() < (urgent ? 0.6 : 0.25);
      speakRef.current(useData ? { text: r.line, go: r.go, auto: true } : { ...pick(SMALLTALK), auto: true });
      next(base + Math.random() * base);
    };

    let first = false;
    try { first = localStorage.getItem("satty-met") !== "1"; } catch { /* 저장소를 못 쓰면 인사는 생략 */ }
    if (first && size !== "sm") {
      t = setTimeout(() => {
        if (!alive) return;
        HELLO.forEach((text, i) => setTimeout(() => { if (alive) speakRef.current({ text }, 4200); }, i * 4600));
        try { localStorage.setItem("satty-met", "1"); } catch { /* 다음에 또 인사한다 */ }
        next(HELLO.length * 4600 + 45_000);
      }, 2500);
    } else {
      next(30_000 + Math.random() * 40_000);
    }
    return () => { alive = false; clearTimeout(t); };
  }, [quiet, size]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  /** 1.2초 안에 세 번 두드리면 쓰다듬은 것으로 본다. */
  const pats = useRef({ n: 0, at: 0 });
  const onTap = () => {
    const now = Date.now();
    pats.current = { n: now - pats.current.at < 1200 ? pats.current.n + 1 : 1, at: now };
    if (pats.current.n >= 3) {
      pats.current = { n: 0, at: 0 };
      setPetted(true);
      setTimeout(() => setPetted(false), 1800);
      speak({ text: pick(PAT) }, 2800);
      return;
    }
    speak({ text: res.line, go: res.go });
  };

  return (
    <div ref={ref} data-mood={petted ? "happy" : res.mood} data-pet={petted ? "1" : undefined}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={`satty fixed z-30 select-none touch-none transition-[opacity,transform] duration-300 ${pos ? "" : size === "sm" ? "right-3 bottom-[96px] md:right-5 md:bottom-[34px]" : "right-3 bottom-[76px] md:right-6 md:bottom-6"} ${hidden ? "opacity-0 translate-y-3 pointer-events-none" : "opacity-100"} ${className}`}>
      {say && (
        <div role="status" className="satty-bubble absolute bottom-full right-0 mb-1.5 max-[420px]:right-auto max-[420px]:left-0 w-max max-w-[min(250px,70vw)] rounded-[12px_12px_4px_12px] bg-navy text-white text-[11.5px] font-medium leading-snug px-2.5 py-1.5 shadow-[0_8px_20px_-12px_rgba(5,0,114,0.7)]">
          {say.text}
          {say.go && onGo && <button type="button" onClick={() => onGo(say.go!)} className="ml-1.5 underline underline-offset-2 text-[#C7C9F7]">보기</button>}
          {say.auto && (
            // 먼저 건 말에만 — 오늘은 그만 말하라고 할 수 있어야 한다
            <button type="button" title="오늘은 먼저 말 걸지 않을게요"
              onClick={() => { try { localStorage.setItem(quietKey, "1"); } catch { /* 이번 판만 */ } setQuiet(true); setSay(null); }}
              className="ml-1.5 text-[10.5px] text-white/50 hover:text-white/80 underline underline-offset-2">조용히</button>
          )}
        </div>
      )}
      <button type="button" aria-label={`Satty — ${res.line}. 누르면 한 마디, 끌어서 옮길 수 있어요`} title="Satty — 끌어서 옮기기"
        onPointerDown={(e) => {
          const el = ref.current; if (!el) return;
          const r = el.getBoundingClientRect();
          drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current, el = ref.current; if (!d || !el) return;
          // 손이 살짝 떨린 것까지 이동으로 치면 눌러서 말 거는 게 안 된다
          if (!d.moved && Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
          d.moved = true;
          setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, el.offsetWidth, el.offsetHeight));
        }}
        onPointerUp={() => {
          const d = drag.current; drag.current = null;
          if (!d) return;
          if (!d.moved) { onTap(); return; }
          setPos((p) => { try { if (p) localStorage.setItem(posKey, JSON.stringify(p)); } catch { /* 못 적으면 이번만 */ } return p; });
          speak({ text: pick(DROP) }, 2600);
        }}
        onPointerCancel={() => { drag.current = null; }}
        className={`block ${size === "sm" ? "w-[46px] h-[46px]" : "w-[58px] h-[58px] md:w-[76px] md:h-[76px]"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/50 rounded-full cursor-grab active:cursor-grabbing`}>
        <svg viewBox="0 0 160 160" className="satty-svg w-full h-full" aria-hidden="true">
          <defs><radialGradient id="satty-body" cx="40%" cy="30%" r="75%"><stop offset="0" stopColor="#7C7EF0" /><stop offset=".55" stopColor="#4F52DC" /><stop offset="1" stopColor="#2B28B8" /></radialGradient></defs>
          <g className="satty-antenna"><rect x="72" y="34" width="16" height="12" rx="5" fill="#4F52DC" /><circle className="satty-beacon" cx="80" cy="30" r="4.5" fill="#C7C9F7" /></g>
          <g className="satty-wing satty-wing-l"><ellipse cx="36" cy="98" rx="13" ry="10" fill="#9B9DF4" /></g>
          <g className="satty-wing satty-wing-r"><ellipse cx="124" cy="98" rx="13" ry="10" fill="#9B9DF4" /></g>
          <g className="satty-torso">
            <circle cx="80" cy="88" r="46" fill="url(#satty-body)" />
            <ellipse className="satty-blush" cx="52" cy="94" rx="8" ry="5" fill="#B9BBFA" opacity=".85" /><ellipse className="satty-blush" cx="108" cy="94" rx="8" ry="5" fill="#B9BBFA" opacity=".85" />
            <g className="satty-eyes">
              <g transform={`translate(${66 + pupil.x} ${82 + pupil.y})`}><circle className="satty-pupil" r="4.4" fill="#0B0B3A" /></g>
              <g transform={`translate(${94 + pupil.x} ${82 + pupil.y})`}><circle className="satty-pupil" r="4.4" fill="#0B0B3A" /></g>
              <path className="satty-closed" d="M60 82q6 5 12 0M88 82q6 5 12 0" stroke="#0B0B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
              <path className="satty-smile-eye" d="M60 84q6-7 12 0M88 84q6-7 12 0" stroke="#0B0B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
            </g>
            <path className="satty-mouth" d="M77 98q3 3 6 0" stroke="#0B0B3A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>
          <g className="satty-sparks" fill="#C7C9F7"><path d="M134 44l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /><path d="M22 56l1.4 3.6 3.6 1.4-3.6 1.4L22 66l-1.4-3.6L17 61l3.6-1.4z" /></g>
          <g className="satty-hearts" fill="#FF8FB1" aria-hidden="true">
            <path d="M118 46c-2.6-3.4-7.6-2.6-8.6 1.7-1-4.3-6-5.1-8.6-1.7-2.6 3.4 0 7.7 8.6 12.9 8.6-5.2 11.2-9.5 8.6-12.9z" />
            <path className="satty-heart-2" d="M44 40c-1.9-2.5-5.6-1.9-6.3 1.3-.7-3.2-4.4-3.8-6.3-1.3-1.9 2.5 0 5.7 6.3 9.5 6.3-3.8 8.2-7 6.3-9.5z" opacity=".8" />
          </g>
          <text className="satty-zz" x="122" y="50" fontFamily="inherit" fontWeight="700" fontSize="13" fill="#8C8EF0">z<tspan fontSize="9" dy="-6">z</tspan></text>
        </svg>
      </button>
    </div>
  );
}
