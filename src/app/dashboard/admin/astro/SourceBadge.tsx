"use client";

import { useState } from "react";

import type { ReactNode } from "react";

/**
 * 이 값의 **원본이 어디인가**를 화면에서 말한다.
 *
 * 0921 에 같은 종류의 혼선이 하루에 세 번 났다 — 시트를 비추는 메모 칸을 진짜 값으로 알고 고쳤고,
 * 진짜 값을 고치는 버튼은 사실 저장이 안 되고 있었고, 그 번호가 손님 적립에도 쓰이는 줄 몰랐다.
 * 근본 원인은 **한 패널 안에 원본이 다른 값들이 같은 모양으로 섞여 있다**는 것이다.
 *
 *   app    앱이 실제로 쓰는 값 (백엔드 매장 레코드·PIN·혜택). 고치면 손님 화면이 바뀐다.
 *   ops    우리 영업 기록 (Astro 운영 필드). 우리끼리 보는 값.
 *   sheet  시트를 비추는 메모. 고쳐도 앱은 안 바뀐다.
 */
export type Source = "app" | "ops" | "sheet";

const META: Record<Source, { label: string; cls: string; title: string }> = {
  app: { label: "앱", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", title: "앱이 실제로 쓰는 값입니다. 고치면 손님 화면·적립에 바로 반영됩니다." },
  ops: { label: "영업기록", cls: "bg-navy/[0.06] text-navy border-navy/15", title: "우리 영업 기록입니다. 앱에는 영향이 없습니다." },
  sheet: { label: "메모", cls: "bg-gray-100 text-gray-500 border-gray-200", title: "시트를 비추는 메모입니다. 고쳐도 앱은 바뀌지 않습니다." },
};

export default function SourceBadge({ src }: { src: Source }) {
  const m = META[src];
  return (
    <span title={m.title} className={`ml-1.5 inline-flex items-center align-middle px-1.5 py-[1px] rounded-md border text-[9.5px] font-bold leading-[1.35] ${m.cls}`}>
      {m.label}
    </span>
  );
}

/** 라벨 + 배지를 한 덩어리로 — Field 의 label 에 그대로 넣는다. */
export function L({ children, src }: { children: ReactNode; src: Source }) {
  return (
    <>
      {children}
      <SourceBadge src={src} />
    </>
  );
}

/**
 * 메모(시트)와 실제 값이 **다를 때만** 뜨는 줄.
 * 둘 다 보여주고, 어느 쪽이 진짜인지 말하고, 한 번에 맞출 수 있게 한다.
 */
export function Mismatch({ memo, real, realLabel, onUseReal }: { memo: string | null; real: string | null; realLabel: string; onUseReal?: () => void }) {
  const m = (memo ?? "").trim(), r = (real ?? "").trim();
  if (!m || !r || m === r) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
      <span>메모 <b>{m}</b> · 실제({realLabel}) <b>{r}</b> — 앱은 <b>{r}</b> 로 동작합니다.</span>
      {onUseReal && (
        <button type="button" onClick={onUseReal} className="font-bold underline underline-offset-2 hover:text-amber-700">
          메모를 실제 값으로 맞추기
        </button>
      )}
    </div>
  );
}


/**
 * 메모에 적힌 매장 PIN 이 **실제로 맞는지** 확인한다 (0925).
 *
 * 예전에는 실제 PIN 값을 읽어다 메모와 나란히 띄우고 다르면 빨간 줄을 냈다.
 * PIN 을 해시로 저장하면서 값을 못 읽게 됐으므로, **비교를 서버에 맡긴다** —
 * 맞는지 아닌지만 돌아오고 값은 오지 않는다.
 *
 * 자동으로 부르지 않고 눌러야 확인한다. 화면을 열 때마다 PIN 을 서버에 던지면
 * 무차별 시도 잠금(dashboard/pin_guard.py)에 우리가 먼저 걸린다.
 */
export function PinMemoCheck({ rid, memo }: { rid: number; memo: string | null }) {
  const m = (memo ?? "").trim();
  const [state, setState] = useState<"idle" | "busy" | "match" | "differ" | "none" | "error">("idle");
  if (!m) return null;

  async function check() {
    setState("busy");
    try {
      const res = await fetch(`/api/dashboard/auth/check-pin?rid=${rid}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: m }),
      });
      const d = (await res.json().catch(() => ({}))) as { matches?: boolean; has_pin?: boolean };
      if (!res.ok) { setState("error"); return; }
      setState(d.has_pin === false ? "none" : d.matches ? "match" : "differ");
    } catch { setState("error"); }
  }

  const tone =
    state === "differ" ? "border-amber-200 bg-amber-50 text-amber-900"
    : state === "match" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-black/[0.08] bg-black/[0.02] text-gray-600";
  const text =
    state === "busy" ? "확인 중…"
    : state === "match" ? `메모의 ${m} 이 실제 매장 PIN 과 같습니다.`
    : state === "differ" ? `메모는 ${m} 인데 실제 매장 PIN 은 다릅니다. 앱은 실제 값으로 동작합니다 — 메모를 고치거나 위에서 PIN 을 새로 정해 주세요.`
    : state === "none" ? "이 매장에는 아직 매장 PIN 이 없습니다."
    : state === "error" ? "확인하지 못했습니다. 잠시 뒤 다시 해 주세요."
    : `메모에 ${m} 이 적혀 있습니다. 실제 매장 PIN 과 같은지 확인할 수 있습니다.`;

  return (
    <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] ${tone}`}>
      <span>{text}</span>
      {state !== "busy" && (
        <button type="button" onClick={check} className="font-bold underline underline-offset-2">
          {state === "idle" ? "확인" : "다시 확인"}
        </button>
      )}
    </div>
  );
}
