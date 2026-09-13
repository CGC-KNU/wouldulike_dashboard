"use client";

import { useState } from "react";

/**
 * 캠퍼스 표식 — 이름 옆에 붙는 작은 로고 자리.
 *
 * 민열님 0913: "캠퍼스 이름 옆에 로고도 붙여놔 헷갈리지 않게." 캠퍼스가 늘어나면(열린 목록) 이름만으로는
 * 한눈에 안 갈린다. 색 + 두 글자면 목록을 훑을 때 눈이 먼저 잡는다.
 *
 * 실제 대학 로고 파일을 `public/campus/<slug>.png` 로 넣어 두면 **그 그림이 대신 뜬다**.
 * 파일이 없으면(지금) 글자 표식으로 조용히 내려앉는다 — 깨진 이미지를 보이지 않게.
 * 로고는 학교 자산이라 우리가 임의로 받아 두지 않았다. 쓸 거면 학교 표기 지침을 따를 것.
 */

/** 기본 3곳은 고정 색. 그 외는 이름에서 만든 색이라 새 캠퍼스도 바로 구분된다. */
const FIXED: Record<string, { slug: string; short: string; bg: string; fg: string }> = {
  경북대: { slug: "knu", short: "경북", bg: "#C0392B", fg: "#fff" },
  영남대: { slug: "ynu", short: "영남", bg: "#1F5FA8", fg: "#fff" },
  계명대: { slug: "kmu", short: "계명", bg: "#2E7D5B", fg: "#fff" },
};

const PALETTE = ["#7A4AC7", "#B4632C", "#0F7B8A", "#8A2B62", "#4B5563", "#A6871F"];

export function campusStyle(name: string): { slug: string; short: string; bg: string; fg: string } {
  const key = name.trim();
  if (FIXED[key]) return FIXED[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const bare = key.replace(/(대학교|대학|캠퍼스|대)$/u, "") || key;
  return { slug: encodeURIComponent(key), short: bare.slice(0, 2), bg: PALETTE[h % PALETTE.length], fg: "#fff" };
}

export default function CampusMark({ campus, size = 16, className = "" }: { campus: string | null | undefined; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!campus) return null;
  const s = campusStyle(campus);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.3) };

  if (!broken) {
    return (
      // 로고 파일이 있으면 그것. 없으면 onError 로 글자 표식으로 바꾼다.
      <img
        src={`/campus/${s.slug}.png`}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
        style={{ ...box, objectFit: "contain" }}
        className={`shrink-0 inline-block align-[-0.2em] ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...box, background: s.bg, color: s.fg, fontSize: Math.round(size * 0.45), lineHeight: 1 }}
      className={`shrink-0 inline-flex items-center justify-center font-bold tracking-[-0.03em] align-[-0.2em] ${className}`}
    >
      {s.short}
    </span>
  );
}

/** 표식 + 이름을 한 덩어리로. 목록·세그먼트·상세 어디서나 같은 모양이 되게. */
export function CampusLabel({ campus, size = 16, className = "" }: { campus: string | null | undefined; size?: number; className?: string }) {
  if (!campus) return <span className="text-gray-400">캠퍼스 없음</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <CampusMark campus={campus} size={size} />
      <span>{campus}</span>
    </span>
  );
}
