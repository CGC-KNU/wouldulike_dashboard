"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";

/**
 * 혜택 변경 신청 — 사장님이 신청하고, 우주라이크가 승인한다 (민열님 0924).
 *
 * ## 왜 그 자리에서 안 바꾸나
 * 혜택은 손님에게 나가는 약속이다. 오후에 바뀌면 그날 온 손님이 아침에 본 것과 다른 걸 받는다.
 * 사장님은 무엇을 어떻게 바꾸고 싶은지만 남기고, 실제로 바뀌는 건 우리가 한 번 보고 넘긴 뒤다.
 *
 * ## 자유 입력이 아니라 고르기
 * "쿠폰 좀 바꿔 주세요" 만 오면 우리가 되물어야 한다. 그래서 **지금 걸려 있는 줄을 골라서**
 * 그 줄의 문구를 고치게 한다. 고른 줄이 곧 우리가 승인할 때 손댈 줄이다.
 *
 * ## 화면이 먼저 답해야 하는 것
 * 신청을 넣은 사장님이 제일 궁금한 건 "접수됐나, 지금 어디까지 왔나" 하나다.
 * 그래서 목록이 폼보다 **위에** 있고, 대기 중인 건은 접히지 않는다.
 */

type Action = "EDIT" | "STOP" | "RESUME" | "OTHER";

interface Benefit {
  id: number; kind: string; stamp_key: string; active: boolean;
  title: string; subtitle: string; notes: string; label: string;
}

interface Req {
  id: number;
  action: Action;
  action_label: string;
  applies_automatically: boolean;
  benefit_label: string;
  before: string;
  after: string;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string | null;
  decided_at: string | null;
  decision_note: string;
}

const STATUS = {
  PENDING: { label: "검토 중", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "반영됨", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "반려", cls: "bg-gray-100 text-gray-500" },
} as const;

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function BenefitChangeRequest({ rid }: { rid: string | null }) {
  const q = rid ? `?restaurant_id=${rid}` : "";

  const [rows, setRows] = useState<Req[] | null>(null);
  const [benefits, setBenefits] = useState<Benefit[] | null>(null);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");

  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>("EDIT");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/astro/benefit-requests${q}`, { cache: "no-store" }),
        fetch(`/api/astro/partner-benefits${q}`, { cache: "no-store" }),
      ]);
      const [ad, bd] = await Promise.all([a.json().catch(() => ({})), b.json().catch(() => ({}))]);
      if (!a.ok) throw new Error(ad?.detail ?? "신청 내역을 읽지 못했습니다.");
      setRows(Array.isArray(ad.requests) ? ad.requests : []);
      setBenefits(b.ok && Array.isArray(bd.benefits) ? bd.benefits : []);
    } catch (e) {
      setRows(null);
      setErr(e instanceof Error ? e.message : "신청 내역을 읽지 못했습니다.");
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const picked = useMemo(
    () => (benefits ?? []).find((b) => b.id === pickedId) ?? null,
    [benefits, pickedId],
  );

  /** 줄을 고르면 지금 문구를 그대로 채워 준다 — 빈 칸부터 시작하면 다시 쓰게 된다. */
  function pick(id: number) {
    setPickedId(id);
    const b = (benefits ?? []).find((x) => x.id === id);
    setTitle(b?.title ?? "");
    setSubtitle(b?.subtitle ?? "");
    setAction(b && !b.active ? "RESUME" : "EDIT");
  }

  async function submit() {
    setBusy(true); setErr(""); setSent("");
    try {
      const body = action === "OTHER"
        ? { action, note: note.trim() }
        : { action, benefit_id: pickedId, title: title.trim(), subtitle: subtitle.trim(), note: note.trim() };
      const res = await fetch(`/api/astro/benefit-requests${q}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.detail ?? "신청하지 못했습니다.");
      setSent(d.replaced
        ? "이미 검토 중이던 같은 신청을 새 내용으로 바꿨습니다."
        : "신청했습니다. 우주라이크가 확인한 뒤 반영됩니다.");
      setOpen(false); setNote(""); setPickedId(null); setTitle(""); setSubtitle("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "신청하지 못했습니다.");
    } finally { setBusy(false); }
  }

  const canSend = action === "OTHER" ? note.trim().length > 0 : pickedId !== null && (action !== "EDIT" || title.trim().length > 0);
  const pending = (rows ?? []).filter((r) => r.status === "PENDING");
  const done = (rows ?? []).filter((r) => r.status !== "PENDING").slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      {rows === null && !err ? (
        <div className="flex justify-center py-6"><Spinner size={16} /></div>
      ) : (
        <>
          {pending.map((r) => (
            <div key={r.id} className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-800">{r.benefit_label || r.action_label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS.PENDING.cls}`}>{STATUS.PENDING.label}</span>
                <span className="text-[10px] text-gray-400 ml-auto">{when(r.created_at)} 신청</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="text-gray-400 line-through">{r.before || "없음"}</span>
                <span className="mx-1.5 text-gray-300">▸</span>
                <span className="font-semibold text-navy">{r.after}</span>
              </p>
              {r.note && <p className="text-[11px] text-gray-400 mt-1.5 bg-gray-50 rounded-lg px-2 py-1">{r.note}</p>}
            </div>
          ))}

          {done.length > 0 && (
            <ul className="flex flex-col divide-y divide-gray-100 bg-white rounded-2xl px-4 shadow-sm">
              {done.map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    <span className="text-[11.5px] text-gray-600 truncate">{r.benefit_label || r.action_label} · {r.after}</span>
                    <span className="text-[10px] text-gray-300 ml-auto shrink-0">{when(r.decided_at)}</span>
                  </div>
                  {r.decision_note && <p className="text-[11px] text-gray-500 mt-1">{r.decision_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {sent && <p className="text-[11.5px] text-green-700 bg-green-50 rounded-xl px-3 py-2">{sent}</p>}
      {err && <p role="alert" className="text-[11.5px] text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>}

      {open ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div>
            <label htmlFor="bcr-pick" className="block text-[11px] font-semibold text-gray-500 mb-1.5">어느 혜택을 바꿀까요</label>
            <select
              id="bcr-pick"
              value={action === "OTHER" ? "OTHER" : (pickedId ?? "")}
              onChange={(e) => {
                if (e.target.value === "OTHER") { setAction("OTHER"); setPickedId(null); return; }
                pick(Number(e.target.value));
              }}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-periwinkle"
            >
              <option value="" disabled>고르세요</option>
              {(benefits ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.label}{b.active ? "" : " (내려 둠)"}</option>
              ))}
              <option value="OTHER">그 밖의 요청 (스탬프 개수, 새 쿠폰 등)</option>
            </select>
            {benefits !== null && benefits.length === 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">아직 등록된 혜택이 없습니다. 아래에 원하시는 내용을 적어 주세요.</p>
            )}
          </div>

          {action !== "OTHER" && picked && (
            <>
              <div className="flex gap-1.5" role="group" aria-label="무엇을 할까요">
                {([["EDIT", "문구 고치기"], ["STOP", "당분간 내리기"], ["RESUME", "다시 걸기"]] as const)
                  .filter(([k]) => (picked.active ? k !== "RESUME" : k !== "STOP"))
                  .map(([k, label]) => (
                    <button
                      key={k} type="button" onClick={() => setAction(k)} aria-pressed={action === k}
                      className={`flex-1 h-9 rounded-xl text-[12.5px] font-semibold border transition-colors ${
                        action === k ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-gray-200"
                      }`}
                    >{label}</button>
                  ))}
              </div>

              {action === "EDIT" && (
                <>
                  <div>
                    <label htmlFor="bcr-title" className="block text-[11px] font-semibold text-gray-500 mb-1.5">혜택 내용</label>
                    <input
                      id="bcr-title" value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="예: 음료 1캔 무료"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
                    />
                  </div>
                  <div>
                    <label htmlFor="bcr-sub" className="block text-[11px] font-semibold text-gray-500 mb-1.5">조건 (선택)</label>
                    <input
                      id="bcr-sub" value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="예: 10,000원 이상 주문 시 · 포장 제외"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div>
            <label htmlFor="bcr-note" className="block text-[11px] font-semibold text-gray-500 mb-1.5">
              {action === "OTHER" ? "무엇을 바꾸고 싶으신가요" : "덧붙일 말 (선택)"}
            </label>
            <textarea
              id="bcr-note" rows={action === "OTHER" ? 3 : 2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={action === "OTHER"
                ? "예: 스탬프를 10개에서 8개로 줄이고 싶습니다"
                : "언제부터 적용하고 싶은지 적어 주시면 빠릅니다."}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-periwinkle"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button" onClick={submit} disabled={busy || !canSend}
              className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {busy ? "보내는 중…" : "신청하기"}
            </button>
            <button
              type="button" onClick={() => { setOpen(false); setErr(""); }}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500"
            >취소</button>
          </div>
        </div>
      ) : (
        <button
          type="button" onClick={() => { setOpen(true); setSent(""); }}
          className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-2xl text-xs font-semibold text-gray-400 hover:border-periwinkle hover:text-periwinkle transition-colors"
        >
          + 혜택 변경 신청
        </button>
      )}
    </div>
  );
}
