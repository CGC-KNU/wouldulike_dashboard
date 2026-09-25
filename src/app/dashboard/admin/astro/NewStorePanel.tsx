"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Select, SlideOver, Textarea, periodLocal } from "../_shared/ui";
import { defaultMonthlyFee, feeHint } from "@/lib/draft/pricing";
import { APP_CATEGORIES, type Campus } from "@/lib/draft/types";
import CampusPicker from "./CampusPicker";

/* ═══════════ 매장 추가 — 식당 관리와 같은 생성 경로 ═══════════ */

export default function NewStorePanel({ actor, campus, campusOptions, onClose, onCreated }: { actor: string; campus: Campus; campusOptions: string[]; onClose: () => void; onCreated: (made: { rid: number; name: string }) => void }) {
  const thisP = periodLocal(), nextP = periodLocal(1);
  const [form, setForm] = useState({ name: "", campus, category: "", phone: "", url: "", map_url: "", map_name: "", address: "", tier: "FREE", memo: "", billing_start: thisP });
  /** 월 이용료 — 플랜·캠퍼스의 기본값으로 채우되, 한 번 손대면 그 값을 지킨다 (정든밤 22,000 같은 예외가 있다). */
  const [fee, setFee] = useState<string>("");
  const [feeTouched, setFeeTouched] = useState(false);
  const suggested = defaultMonthlyFee(form.tier, form.campus);
  useEffect(() => {
    if (feeTouched) return;
    setFee(suggested !== null && suggested > 0 ? String(suggested) : "");
  }, [suggested, feeTouched]);
  const [lookup, setLookup] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  /** 지도 링크에서 공식 상호를 읽어 매장명에 넣는다 — 팀원과 툴이 같은 이름을 쓴다. */
  async function fromMap() {
    if (!form.map_url.trim() || lookup.busy) return;
    setLookup({ busy: true, msg: null });
    try {
      const res = await fetch(`/api/astro/place?url=${encodeURIComponent(form.map_url.trim())}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.name) { setLookup({ busy: false, msg: d.detail ?? "지도에서 이름을 못 읽었습니다. 직접 적어 주세요." }); return; }
      setForm((f) => ({ ...f, name: d.name, map_name: d.name, address: f.address || d.address || "" }));
      setLookup({ busy: false, msg: `${d.provider} 표기 "${d.name}" 를 매장명으로 넣었습니다.` });
    } catch { setLookup({ busy: false, msg: "지도 페이지를 읽지 못했습니다." }); }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      // 1) 매장 본체는 백엔드 원본(식당 관리와 같은 경로)
      const res = await fetch("/api/dashboard/admin/restaurants/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), address: form.address, phone_number: form.phone, category: form.category, url: form.url, main_menu: "", description: "", s3_image_urls: [], tier: form.tier || null }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(res.status === 502 || res.status === 501 ? "미리보기 모드라 매장을 만들 수 없습니다. 백엔드에 붙으면 식당 관리와 같은 경로로 생성됩니다." : d.detail ?? d.message ?? "매장을 만들지 못했습니다."); return; }
      const id = d.restaurant_id ?? d.id;
      // 2) 캠퍼스·상권·메모는 Astro 운영 필드
      const feeNum = Number(String(fee).replace(/[^\d]/g, ""));
      if (id) await fetch(`/api/astro/stores/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campus: form.campus, map_url: form.map_url || null, map_name: form.map_name || null, billing_start_period: form.billing_start, memo: form.memo || null, monthly_fee: feeNum > 0 ? feeNum : null, pay_cycle: feeNum > 0 ? "MONTHLY" : null, updated_by: actor }) });
      onCreated({ rid: Number(id), name: form.name.trim() }); onClose();
    } catch { setError("서버에 연결하지 못했습니다."); } finally { setSaving(false); }
  }

  return (
    <SlideOver open onClose={onClose} title="매장 추가" subtitle="식당 관리와 같은 경로로 만들어집니다. 사진·쿠폰은 식당 관리에서 이어서 등록하세요."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.name.trim() || saving}>{saving ? "만드는 중…" : "매장 만들기"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <Field label="지도 링크 (네이버지도 · 카카오맵)" hint="지도상 공식 상호를 매장명으로 씁니다. 팀원이 부르는 이름과 툴 이름이 갈리지 않게.">
        <div className="flex gap-2"><Input value={form.map_url} onChange={set("map_url")} type="url" inputMode="url" placeholder="https://naver.me/… 또는 https://place.map.kakao.com/…" autoFocus /><Button onClick={fromMap} disabled={!form.map_url.trim() || lookup.busy}>{lookup.busy ? "읽는 중…" : "이름 가져오기"}</Button></div>
        {lookup.msg && <p className="text-[12px] text-gray-600 mt-1">{lookup.msg}</p>}
      </Field>
      <Field label="매장명" required hint={form.map_name ? `지도 표기: ${form.map_name}` : undefined}><Input value={form.name} onChange={set("name")} placeholder="예: 라라더" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="캠퍼스"><CampusPicker value={form.campus} options={campusOptions} onChange={(v) => setForm((f) => ({ ...f, campus: v }))} /></Field>
        <Field label="플랜"><Select value={form.tier} onChange={set("tier")}><option value="FREE">무료</option><option value="BOOST">Boost</option><option value="CONTENT">Premium</option></Select></Field>
        <Field label="월 이용료 (VAT 포함)" hint={feeHint(form.tier, form.campus) ?? "정해진 기본값이 없는 플랜입니다. 계약한 금액을 적으세요."}>
          <Input type="number" inputMode="numeric" value={fee} onChange={(e) => { setFee(e.target.value); setFeeTouched(true); }} placeholder={suggested ? String(suggested) : "예: 22000"} />
        </Field>
        <Field label="청구 시작" hint="월 중간에 들어오면 이번 달부터 받을지 다음 달부터 받을지"><Select value={form.billing_start} onChange={set("billing_start")}><option value={thisP}>이번 달부터 ({Number(thisP.slice(5))}월)</option><option value={nextP}>다음 달부터 ({Number(nextP.slice(5))}월)</option></Select></Field>
        <Field label="카테고리" hint="앱 목록 그대로입니다."><Select value={form.category} onChange={set("category")}><option value="">미정</option>{APP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="매장 전화"><Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" /></Field>
        <Field label="링크"><Input value={form.url} onChange={set("url")} type="url" inputMode="url" placeholder="네이버 플레이스" /></Field>
      </div>
      <Field label="주소"><Input value={form.address} onChange={set("address")} /></Field>
      <Field label="메모"><Textarea rows={3} value={form.memo} onChange={set("memo")} placeholder="계약 특이사항 · 점주 요청" /></Field>
    </SlideOver>
  );
}
