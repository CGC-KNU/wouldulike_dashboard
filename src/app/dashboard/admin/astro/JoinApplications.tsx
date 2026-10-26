"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "../_shared/ui";
import CampusMark from "./CampusMark";

/**
 * 입점 신청 승인 — 사장님이 /join 링크로 혼자 낸 신청을 우리가 보고 매장으로 만든다.
 *
 * 무료는 바로 승인, 유료는 연락해서 입금 · 개시일을 맞춘 뒤 승인한다(1026 결정).
 * 승인 한 번에 백엔드가 매장 · 플랜 · 운영값 · PIN · 스탬프 · 쿠폰 · 점주 연결 · 후보(계약 완료) · 동의 기록을
 * 만들고, 중간에 실패하면 거꾸로 지운다. 그래서 여기서는 **보고 고르는 것**만 한다.
 *
 * 겹치는 매장(같은 이름 · 같은 주소)은 새 매장으로 만들지 않는다 — 기존 매장 PIN 은 손님 스탬프 번호와 같아서
 * 덮으면 안 된다. 「기존 매장으로 처리」로 닫고 담당자가 사장님께 연락한다.
 */

interface Dup {
  stores: { restaurant_id: number; name: string; address: string; campus: string; exact: boolean; same_address: boolean }[];
  leads: { id: number; name: string; stage: string; owner: string; campus: string; restaurant_id: number | null }[];
  blocked: boolean;
}
interface App {
  id: number; status: "pending" | "approved" | "rejected" | "duplicate";
  store_name: string; address: string; campus: string; category: string; hubble_id: string;
  plan: "FREE" | "BOOST" | "PREMIUM"; source: string; owner_name: string; phone: string; created_at: string;
  dup: Dup | null; restaurant_id: number | null; note: string;
  biz_no?: string; rep_name?: string; email?: string;
  benefits?: { stamps?: { stamps: number; reward: string }[]; stamp_note?: string; coupons?: { benefit: string; cond: string }[] };
  consent?: { version?: string; signature?: string; signed_at?: string; checks?: Record<string, string> };
}

const PLAN: Record<App["plan"], string> = { FREE: "무료", BOOST: "Boost", PREMIUM: "Premium" };
const SRC: Record<string, string> = { dm: "인스타 DM", web: "회사 랜딩", qr: "QR", kakao: "카카오톡" };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const bizFmt = (s?: string) => (s && s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5)}` : s ?? "");

export default function JoinApplications({ onDone }: { onDone?: () => void }) {
  const [items, setItems] = useState<App[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "blue" | "red"; text: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/astro/applications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { applications?: App[] } | null) => setItems(j?.applications ?? []))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const act = async (a: App, action: "approve" | "reject" | "duplicate", extra: Record<string, unknown> = {}) => {
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt(`${a.store_name} — 반려 사유 (사장님 화면에는 「담당자가 연락드립니다」로만 보입니다)`, "");
      if (note === null) return;
    }
    if (action === "approve" && a.plan !== "FREE" &&
        !window.confirm(`${a.store_name} · ${PLAN[a.plan]}\n사장님과 통화해 입금 · 개시일을 맞추셨나요? 승인하면 매장이 바로 만들어집니다.`)) return;
    setBusy(a.id); setMsg(null);
    try {
      const r = await fetch(`/api/astro/applications/${a.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note, ...extra }),
      });
      const j = (await r.json().catch(() => ({}))) as { detail?: string; restaurant_id?: number };
      if (!r.ok) throw new Error(j.detail ?? `실패 (${r.status})`);
      setMsg({
        tone: "blue",
        text: action === "approve"
          ? `${a.store_name} 입점 승인 — 매장 #${j.restaurant_id} 이 만들어졌습니다. 사장님께 앱 로그인 안내를 드려 주세요.`
          : action === "reject" ? `${a.store_name} 신청을 반려했습니다.` : `${a.store_name} 신청을 기존 매장으로 처리했습니다. 사장님께 연락해 주세요.`,
      });
      setOpen(null); load(); onDone?.();
    } catch (err) { setMsg({ tone: "red", text: (err as Error).message }); } finally { setBusy(null); }
  };

  if (!items || items.length === 0) return msg ? <div className="mb-3"><Notice tone={msg.tone} title="입점 신청">{msg.text}</Notice></div> : null;

  return (
    <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
      <p className="text-[13px] font-semibold text-indigo-950">입점 신청 {items.length}건</p>
      <p className="text-[12px] text-indigo-900/80 mt-0.5 mb-2.5">
        사장님이 입점 링크로 직접 낸 신청입니다. <b>무료는 확인 뒤 바로 승인</b>, 유료는 연락해서 입금 · 개시일을 맞춘 뒤 승인해 주세요.
      </p>
      <div className="space-y-2">
        {items.map((a) => {
          const dup = a.dup ?? { stores: [], leads: [], blocked: false };
          const isOpen = open === a.id;
          const b = a.benefits ?? {};
          return (
            <div key={a.id} className="rounded-lg border border-indigo-100 bg-white">
              <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen}
                className="w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
                <CampusMark campus={a.campus} size={14} />
                <span className="text-[13px] font-semibold text-gray-900">{a.store_name}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${a.plan === "FREE" ? "bg-gray-100 text-gray-600" : "bg-indigo-100 text-indigo-800"}`}>{PLAN[a.plan]}</span>
                {a.status === "duplicate" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">기존 매장과 겹침</span>}
                {a.status === "pending" && (dup.stores.length > 0 || dup.leads.length > 0) && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">비슷한 곳 {dup.stores.length + dup.leads.length}</span>}
                <span className="text-[11.5px] text-gray-400 ml-auto tabular-nums">{a.campus} · {SRC[a.source] ?? (a.source || "링크")} · {when(a.created_at)}</span>
              </button>

              {isOpen && (
                <div className="border-t border-indigo-50 px-3 pb-3 pt-2.5 space-y-3 text-[12.5px] text-gray-800">
                  <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      ["주소", a.address || "—"],
                      ["업종", a.category || "—"],
                      ["사장님", `${a.owner_name} · ${a.phone}`],
                      ["사업자", `${bizFmt(a.biz_no)}${a.rep_name && a.rep_name !== a.owner_name ? ` · 대표 ${a.rep_name}` : ""}`],
                      ["이메일", a.email || "—"],
                      ["허블", a.hubble_id ? `인허가 ${a.hubble_id}` : "직접 적음"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2"><dt className="w-12 shrink-0 text-gray-400">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
                    ))}
                  </dl>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11.5px] text-gray-500 mb-1">스탬프</p>
                      <ul className="space-y-0.5">
                        {(b.stamps ?? []).map((s) => <li key={s.stamps}><b className="tabular-nums">{s.stamps}개</b> · {s.reward}</li>)}
                      </ul>
                      {b.stamp_note && <p className="text-[11.5px] text-gray-500 mt-1">메모 · {b.stamp_note}</p>}
                    </div>
                    <div>
                      <p className="text-[11.5px] text-gray-500 mb-1">쿠폰</p>
                      {(b.coupons ?? []).length === 0 ? <p className="text-gray-400">없음</p> : (
                        <ul className="space-y-0.5">{(b.coupons ?? []).map((c, i) => <li key={i}>{c.benefit}{c.cond && <span className="text-gray-500"> · {c.cond}</span>}</li>)}</ul>
                      )}
                    </div>
                  </div>

                  {a.consent && (
                    <p className="text-[11.5px] text-gray-500">
                      약관 {a.consent.version} · 서명 <b className="text-gray-700">{a.consent.signature}</b>
                      {a.consent.signed_at && ` · ${when(a.consent.signed_at)}`} · 중요 내용 체크 {Object.keys(a.consent.checks ?? {}).length}개
                    </p>
                  )}

                  {(dup.stores.length > 0 || dup.leads.length > 0) && (
                    <div className={`rounded-md p-2.5 ${dup.blocked ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
                      <p className="font-semibold text-[12px] mb-1">{dup.blocked ? "이미 있는 매장과 겹칩니다 — 새로 만들지 마세요" : "비슷한 매장 · 후보가 있습니다 — 같은 가게인지 확인해 주세요"}</p>
                      <ul className="space-y-1">
                        {dup.stores.map((s) => (
                          <li key={`s${s.restaurant_id}`} className="flex flex-wrap items-center gap-2">
                            <span>매장 #{s.restaurant_id} {s.name}<span className="opacity-70"> · {s.address || s.campus}{s.same_address ? " · 주소 같음" : ""}{s.exact ? " · 이름 같음" : ""}</span></span>
                            <Button size="sm" disabled={busy === a.id} onClick={() => act(a, "duplicate", { restaurant_id: s.restaurant_id })}>이 매장으로 처리</Button>
                          </li>
                        ))}
                        {dup.leads.map((l) => (
                          <li key={`l${l.id}`}>후보 {l.name}<span className="opacity-70"> · {l.campus} · {l.stage}{l.owner ? ` · 담당 ${l.owner}` : ""}</span>
                            {!l.restaurant_id && <span className="opacity-70"> — 승인하면 이 후보가 「계약 완료」로 바뀝니다</span>}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {a.note && <p className="text-[11.5px] text-gray-500">메모 · {a.note}</p>}

                  <div className="flex flex-wrap gap-2">
                    {a.status === "pending" && (
                      <Button size="sm" variant="primary" disabled={busy === a.id} onClick={() => act(a, "approve")}>
                        {busy === a.id ? "처리 중…" : a.plan === "FREE" ? "승인 — 매장 만들기" : "연락 마치고 승인"}
                      </Button>
                    )}
                    {a.status === "duplicate" && (
                      <Button size="sm" disabled={busy === a.id}
                        onClick={() => window.confirm(`${a.store_name}\n겹치는 매장과 다른 가게가 맞나요? 새 매장으로 만듭니다(기존 매장은 건드리지 않습니다).`) && act(a, "approve", { force: true })}>
                        다른 가게 — 새 매장으로 만들기
                      </Button>
                    )}
                    <Button size="sm" disabled={busy === a.id} onClick={() => act(a, "reject")}>반려</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className={`text-[12px] mt-2 ${msg.tone === "red" ? "text-red-700" : "text-gray-700"}`}>{msg.text}</p>}
    </div>
  );
}
