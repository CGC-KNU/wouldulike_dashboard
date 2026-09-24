"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";

/**
 * 혜택 변경 신청 — 사장님이 신청하고, 우주라이크가 승인한다 (민열님 0924).
 *
 * ## 왜 그 자리에서 안 바꾸나
 * 혜택은 손님에게 나가는 약속이다. 오후에 바뀌면 그날 온 손님이 아침에 본 것과 다른 걸 받는다.
 * 그래서 사장님은 **무엇을 어떻게 바꾸고 싶은지**만 남기고, 실제로 바뀌는 건 우리가 한 번 보고 넘긴 뒤다.
 *
 * ## 화면이 말해야 하는 것
 * 신청을 넣은 사장님이 제일 궁금한 건 "접수됐나, 지금 어디까지 왔나" 하나다.
 * 그래서 목록이 폼보다 **위에** 있고, 대기 중인 건은 접히지 않는다.
 */

const FIELDS = [
  { key: "coupon_basic", label: "기본 쿠폰", hint: "예: 첫 방문 3,000원 할인" },
  { key: "coupon_limited", label: "한정 쿠폰", hint: "예: 캠페인 주간 한정 5,000원 할인" },
  { key: "stamp_count", label: "스탬프 개수", hint: "예: 10개 모으면 보상" },
  { key: "stamp_reward", label: "스탬프 보상", hint: "예: 음료 1잔 무료" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

interface Req {
  id: number;
  field: FieldKey;
  field_label: string;
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
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FieldKey>("coupon_basic");
  const [after, setAfter] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");

  const q = rid ? `?restaurant_id=${rid}` : "";

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/astro/benefit-requests${q}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.detail ?? "신청 내역을 읽지 못했습니다.");
      setRows(Array.isArray(d.requests) ? d.requests : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "신청 내역을 읽지 못했습니다.");
    } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!after.trim()) { setErr("바꾸고 싶은 내용을 적어 주세요."); return; }
    setBusy(true); setErr(""); setSent("");
    try {
      const res = await fetch(`/api/astro/benefit-requests${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, after: after.trim(), note: note.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.detail ?? "신청하지 못했습니다.");
      setSent(d.replaced
        ? "이미 검토 중이던 같은 항목의 신청을 새 내용으로 바꿨습니다."
        : "신청했습니다. 우주라이크가 확인한 뒤 반영됩니다.");
      setAfter(""); setNote(""); setOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "신청하지 못했습니다.");
    } finally { setBusy(false); }
  }

  const pending = rows.filter((r) => r.status === "PENDING");
  const done = rows.filter((r) => r.status !== "PENDING").slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="flex justify-center py-6"><Spinner size={16} /></div>
      ) : (
        <>
          {pending.map((r) => (
            <div key={r.id} className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-gray-800">{r.field_label}</span>
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
                <li key={r.id} className="py-2.5 flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  <span className="text-[11.5px] text-gray-600 truncate">{r.field_label} · {r.after}</span>
                  <span className="text-[10px] text-gray-300 ml-auto shrink-0">{when(r.decided_at)}</span>
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
            <label htmlFor="bcr-field" className="block text-[11px] font-semibold text-gray-500 mb-1.5">어느 혜택을 바꿀까요</label>
            <select
              id="bcr-field" value={field} onChange={(e) => setField(e.target.value as FieldKey)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-periwinkle"
            >
              {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bcr-after" className="block text-[11px] font-semibold text-gray-500 mb-1.5">어떻게 바꿀까요</label>
            <input
              id="bcr-after" value={after} onChange={(e) => setAfter(e.target.value)}
              placeholder={FIELDS.find((f) => f.key === field)?.hint}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
            />
          </div>
          <div>
            <label htmlFor="bcr-note" className="block text-[11px] font-semibold text-gray-500 mb-1.5">덧붙일 말 (선택)</label>
            <textarea
              id="bcr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="언제부터 적용하고 싶은지, 왜 바꾸는지 적어 주시면 빠릅니다."
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-periwinkle"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button" onClick={submit} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform"
            >
              {busy ? "보내는 중…" : "신청하기"}
            </button>
            <button
              type="button" onClick={() => { setOpen(false); setErr(""); }}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500"
            >
              취소
            </button>
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
