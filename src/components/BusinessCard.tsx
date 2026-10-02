"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * 내 디지털 명함 — 세틀라이트 상단 이스터에그 (1002 민열님).
 *
 * 실물 명함(남색 앞면 · 흰 뒷면) 그대로를 3D 카드로 띄운다.
 *  · 누르면 뒤집힌다. 끌면 자유롭게 돌고, 놓으면 가까운 면으로 돌아와 선다.
 *  · 마우스를 올리면 그쪽으로 살짝 기울고 빛이 스친다(움직임 줄이기 설정이면 기울기·빛 없음).
 * 이름·직함·연락처는 백엔드(AdminConfig)에서 온다 — 이 레포는 공개라 값을 코드에 두지 않는다.
 * 다크 모드는 globals.css 가 `.bg-white` 를 남색으로 덮는다 — 명함은 실물이라 색을 인라인으로 고정한다.
 * 회사 주소는 공개 정보라 여기 둔다(계약서·랜딩과 같은 정본: 대학로 80 글로벌플라자 101호).
 */

interface Card {
  name: string; name_en: string; role: string; role_en: string; mobile: string; email: string; saved?: boolean;
}

const NAVY = "#050072";
const FIELDS: { k: keyof Card; label: string; ph: string }[] = [
  { k: "name", label: "이름", ph: "김수연" },
  { k: "name_en", label: "영문 이름", ph: "KIM SOOYEON" },
  { k: "role", label: "직함", ph: "세일즈 | 프런티어 스카우트" },
  { k: "role_en", label: "영문 직함", ph: "Sales | Frontier Scout" },
  { k: "mobile", label: "휴대폰", ph: "010 0000 0000" },
  { k: "email", label: "메일", ph: "name@wouldulike.kr" },
];

/** 010-1234-5678 / 01012345678 → 010 1234 5678 (실물 명함 표기) */
function phone(s: string) {
  const d = s.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return s;
}

/** 흰/남색 로고를 정확한 색으로 — PNG 를 마스크로 쓰고 배경색을 칠한다 */
function Mark({ src, color, style }: { src: string; color: string; style: CSSProperties }) {
  return <span aria-hidden="true" style={{ display: "block", background: color, WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "center", maskPosition: "center", ...style }} />;
}

export function BusinessCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="내 명함 보기" title="내 명함"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="9" cy="11" r="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.5 16c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2M14.5 10h3.5M14.5 13.5h2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && <CardModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CardModal({ onClose }: { onClose: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Card | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/admin/me/card", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.detail ?? "명함을 불러오지 못했습니다."); return j as Card; })
      .then((c) => { setCard(c); if (!c.saved) { setDraft(c); setEditing(true); } })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function save() {
    if (!draft) return;
    setSaving(true); setErr("");
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.k, draft[f.k] ?? ""]));
      const r = await fetch("/api/dashboard/admin/me/card", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "저장하지 못했습니다.");
      setCard(j); setEditing(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const shown = editing && draft ? draft : card;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="내 명함" className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 px-4 py-8 overflow-y-auto"
      style={{ background: "radial-gradient(1200px 700px at 50% 35%, rgba(40,40,120,0.55), rgba(5,4,30,0.92))", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button type="button" onClick={onClose} aria-label="닫기" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white/80 hover:bg-white/20 flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>

      {err && <p className="text-[13px] text-red-200 bg-red-900/40 rounded-lg px-3 py-2">{err}</p>}
      {shown ? <Card3D card={shown} /> : !err && <div className="w-[min(88vw,540px)] aspect-[1.74] rounded-[18px] bg-white/10 animate-pulse" />}

      <p className="text-[12px] text-white/55 select-none">눌러서 뒤집기 · 끌어서 돌려 보기</p>

      {card && !editing && (
        <button type="button" onClick={() => { setDraft(card); setEditing(true); }} className="text-[12.5px] font-semibold text-white/80 hover:text-white underline underline-offset-4">명함 고치기</button>
      )}
      {editing && draft && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="w-[min(88vw,540px)] grid grid-cols-2 gap-2.5 bg-white/[0.07] border border-white/10 rounded-2xl p-4">
          {!card?.saved && <p className="col-span-2 text-[12.5px] text-white/75">처음이라 이름·직함만 채워 두었습니다. 나머지를 적고 저장하면 명함이 완성됩니다.</p>}
          {FIELDS.map((f) => (
            <label key={f.k} className="flex flex-col gap-1 text-[11.5px] font-semibold text-white/60">
              {f.label}
              <input value={(draft[f.k] as string) ?? ""} placeholder={f.ph} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}
                style={{ background: "rgba(255,255,255,0.92)" }} className="h-9 rounded-lg text-[13px] font-medium text-[#14143C] px-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/70" />
            </label>
          ))}
          <div className="col-span-2 flex justify-end gap-2 pt-1">
            {card?.saved && <button type="button" onClick={() => setEditing(false)} className="h-9 px-3 rounded-lg text-[13px] font-semibold text-white/75 hover:text-white">취소</button>}
            <button type="submit" disabled={saving} className="h-9 px-4 rounded-lg text-[13px] font-bold text-[#050072] disabled:opacity-60" style={{ background: "#FFFFFF" }}>{saving ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      )}
    </div>,
    document.body
  );
}

function Card3D({ card }: { card: Card }) {
  const box = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: 0, y: 0 });          // 끌어서 돌린 각도(누적)
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50 });
  const [anim, setAnim] = useState(true);                  // 놓았을 때만 부드럽게 돌아간다
  const drag = useRef<{ sx: number; sy: number; rx: number; ry: number; moved: boolean } | null>(null);
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);

  const snap = useCallback((y: number) => Math.round(y / 180) * 180, []);

  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, rx: rot.x, ry: rot.y, moved: false };
    setAnim(false);
  }
  function move(e: React.PointerEvent) {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    if (drag.current) {
      const dx = e.clientX - drag.current.sx, dy = e.clientY - drag.current.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
      setRot({ x: Math.max(-35, Math.min(35, drag.current.rx - dy * 0.35)), y: drag.current.ry + dx * 0.6 });
      return;
    }
    if (reduce || e.pointerType === "touch") return;
    setTilt({ x: (0.5 - py) * 14, y: (px - 0.5) * 18, gx: px * 100, gy: py * 100 });
  }
  function up() {
    const d = drag.current; drag.current = null; setAnim(true);
    if (!d) return;
    if (!d.moved) setRot((r) => ({ x: 0, y: snap(r.y) + 180 }));   // 그냥 누르면 뒤집기
    else setRot((r) => ({ x: 0, y: snap(r.y) }));                    // 끌었으면 가까운 면으로
  }
  function leave() { setTilt({ x: 0, y: 0, gx: 50, gy: 50 }); if (drag.current) up(); }

  const faceBack = Math.round(((rot.y % 360) + 360) % 360) >= 90 && Math.round(((rot.y % 360) + 360) % 360) < 270;

  return (
    <div style={{ perspective: 1400 }} className="select-none touch-none">
      <div ref={box} role="button" tabIndex={0} aria-label={faceBack ? "명함 앞면 보기" : "명함 뒷면 보기"}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAnim(true); setRot((r) => ({ x: 0, y: snap(r.y) + 180 })); } }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave}
        className="relative w-[min(88vw,540px)] aspect-[1.74] cursor-grab active:cursor-grabbing focus-visible:outline-none"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${rot.x + tilt.x}deg) rotateY(${rot.y + tilt.y}deg)`,
          transition: anim ? (reduce ? "none" : "transform 700ms cubic-bezier(.2,.8,.2,1)") : "none",
        }}>
        <Face back={false} glare={tilt}><Front /></Face>
        <Face back glare={tilt}><Back card={card} /></Face>
      </div>
    </div>
  );
}

function Face({ back, glare, children }: { back: boolean; glare: { gx: number; gy: number }; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 rounded-[16px] overflow-hidden"
      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined,
        boxShadow: "0 40px 80px -30px rgba(0,0,0,0.65), 0 12px 24px -12px rgba(0,0,0,0.45)" }}>
      {children}
      {/* 빛 — 손이 있는 쪽이 밝다 */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(circle at ${back ? 100 - glare.gx : glare.gx}% ${glare.gy}%, rgba(255,255,255,${back ? 0.35 : 0.18}), rgba(255,255,255,0) 55%)`, mixBlendMode: back ? "soft-light" : "screen" }} />
    </div>
  );
}

function Front() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4.5%]" style={{ background: `linear-gradient(160deg, #0A0A86 0%, ${NAVY} 55%, #03004F 100%)` }}>
      <Mark src="/brand/symbol.png" color="#FFFFFF" style={{ width: "12%", aspectRatio: "319 / 301" }} />
      <Mark src="/brand/wordmark.png" color="#FFFFFF" style={{ width: "17%", aspectRatio: "577 / 101" }} />
    </div>
  );
}

function Back({ card }: { card: Card }) {
  // 실물 명함 비율(940×540)을 기준으로 % 배치 — 카드 크기가 바뀌어도 모양이 같다
  const fs = (px: number) => `calc(min(88vw, 540px) * ${px / 940})`;
  return (
    <div className="absolute inset-0 text-[#050072]" style={{ background: "#FFFFFF", fontFamily: "Pretendard, 'Apple SD Gothic Neo', sans-serif" }}>
      <Mark src="/brand/wordmark.png" color={NAVY} style={{ position: "absolute", right: "6.5%", top: "13%", width: "25.5%", aspectRatio: "577 / 101" }} />

      <div style={{ position: "absolute", left: "6.6%", top: "24%" }}>
        <p style={{ fontSize: fs(38), fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
          {card.name}{card.name_en && <span style={{ fontSize: fs(18), fontWeight: 800, marginLeft: fs(10), letterSpacing: "0.01em" }}>{card.name_en}</span>}
        </p>
        {card.role && <p style={{ fontSize: fs(21), fontWeight: 800, marginTop: fs(36) }}>{card.role}</p>}
        {card.role_en && <p style={{ fontSize: fs(16), fontWeight: 500, marginTop: fs(10) }}>{card.role_en}</p>}
      </div>

      <dl style={{ position: "absolute", left: "47.5%", top: "40%", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: fs(36), rowGap: fs(8), fontSize: fs(20) }}>
        {card.mobile && <><dt style={{ fontWeight: 800 }}>Mobile</dt><dd style={{ fontWeight: 500, letterSpacing: "0.02em" }}>{phone(card.mobile)}</dd></>}
        {card.email && <><dt style={{ fontWeight: 800 }}>Email</dt><dd style={{ fontWeight: 500 }}>{card.email}</dd></>}
      </dl>

      <div style={{ position: "absolute", left: "47.5%", top: "67%", lineHeight: 1.45 }}>
        <p style={{ fontSize: fs(19), fontWeight: 800 }}>우주라이크</p>
        <p style={{ fontSize: fs(15.5), fontWeight: 700 }}>스타트업 허브센터,</p>
        <p style={{ fontSize: fs(15.5), fontWeight: 700 }}>대구광역시 북구 대학로 80 KNU글로벌플라자 101호</p>
        <p style={{ fontSize: fs(13.5), fontWeight: 500, marginTop: fs(4) }}>#101, KNU Global Plaza (Startup Hub Center),</p>
        <p style={{ fontSize: fs(13.5), fontWeight: 500 }}>80 Daehak-ro, Buk-gu, Daegu 41566, Republic of Korea</p>
      </div>

      {/* 코끼리 마크 — 흰 바탕 PNG 라 multiply 로 얹고 연보라로 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/elephant.png" alt="" aria-hidden="true" style={{ position: "absolute", left: "5.4%", bottom: "8.5%", width: "14.5%", mixBlendMode: "multiply", opacity: 0.4 }} />
    </div>
  );
}
