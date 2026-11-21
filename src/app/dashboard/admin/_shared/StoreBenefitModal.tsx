"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BenefitCatalogSection, StampRuleSection, type RestaurantBenefit } from "@/components/CouponCatalog";
import type { StoreRow } from "@/lib/draft/types";
import { Button, Input, SlideOver, Textarea } from "./ui";

/**
 * 메인 매장 줄 → 이 매장 쿠폰 · 스탬프 바로 보기 · 고치기 (1121 민열님: "필요한 기능 동선 줄이는 용").
 *
 * 위: **앱에 실제로 나가는 것** — 식당 관리 · 신규 매장 등록과 같은 편집기(BenefitCatalogSection · StampRuleSection)라
 *     고치면 그 자리에서 앱에 반영된다.
 * 아래: 매장 정보의 「혜택 — 계약서에 적은 조건(영업 기록)」 네 칸. 「앱 혜택으로 채우기」 한 번이면 위 값으로 맞춘다.
 * 매장 상세 전체가 필요하면 맨 아래 「매장 상세 열기」.
 */

type OpsBenefit = { coupon_basic: string; coupon_limited: string; stamp_count: string; stamp_reward: string };

export default function StoreBenefitModal({ store, actor, onClose, onGo, onSaved }: {
  store: StoreRow | null; actor: string; onClose: () => void; onGo: (t: string) => void; onSaved?: () => void;
}) {
  const [ops, setOps] = useState<OpsBenefit>({ coupon_basic: "", coupon_limited: "", stamp_count: "", stamp_reward: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rid = store ? String(store.restaurant_id) : null;

  useEffect(() => {
    if (!store) return;
    const o = store.ops;
    setOps({ coupon_basic: o?.coupon_basic ?? "", coupon_limited: o?.coupon_limited ?? "", stamp_count: o?.stamp_count ?? "", stamp_reward: o?.stamp_reward ?? "" });
    setMsg(null);
  }, [store]);

  /** 앱에 등록된 혜택을 영업 기록 네 칸의 글로 — 일반 = 기본 쿠폰, 한정 = 한정 쿠폰, 스탬프는 「5개 ○○ · 10개 ○○」 */
  async function fillFromApp() {
    if (!rid) return;
    setBusy(true); setMsg(null);
    try {
      const [a, s] = await Promise.all([
        fetch(`/api/dashboard/restaurant-benefits?rid=${rid}`).then((r) => (r.ok ? r.json() : Promise.reject())),
        fetch(`/api/dashboard/restaurant-benefits?rid=${rid}&kind=STAMP`).then((r) => (r.ok ? r.json() : Promise.reject())),
      ]) as [RestaurantBenefit[], RestaurantBenefit[]];
      const live = (k: string, list: RestaurantBenefit[]) => list.filter((b) => b.kind === k && b.active);
      const line = (b: RestaurantBenefit) => [b.title, b.subtitle].filter(Boolean).join(" — ");
      const stamps = live("STAMP", s).sort((x, y) => Number(x.stamp_key) - Number(y.stamp_key));
      setOps({
        coupon_basic: live("GENERAL", a).map(line).join("\n"),
        coupon_limited: live("SPECIAL", a).map(line).join("\n"),
        stamp_count: stamps.map((b) => b.stamp_key).filter(Boolean).join(" / "),
        stamp_reward: stamps.map((b) => `${b.stamp_key}개 ${b.title}`).join(" · "),
      });
      setMsg({ ok: true, text: "앱 혜택으로 채웠습니다. 「영업 기록 저장」을 눌러야 저장됩니다." });
    } catch {
      setMsg({ ok: false, text: "앱 혜택을 읽지 못했습니다." });
    } finally { setBusy(false); }
  }

  async function save() {
    if (!store) return;
    setBusy(true); setMsg(null);
    try {
      const body = Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, v.trim() || null]));
      const res = await fetch(`/api/astro/stores/${store.restaurant_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, updated_by: actor }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `HTTP ${res.status}`);
      setMsg({ ok: true, text: "매장 정보(영업 기록)에 저장했습니다." });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: `저장하지 못했습니다 — ${(e as Error).message}` });
    } finally { setBusy(false); }
  }

  const set = (k: keyof OpsBenefit) => (e: { target: { value: string } }) => setOps((o) => ({ ...o, [k]: e.target.value }));

  // 메인 카드는 backdrop-blur 라 fixed 자식을 카드 안에 가둔다 — body 로 띄운다(1121 미리보기에서 카드 안에 열림)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <SlideOver open={Boolean(store)} onClose={onClose} width="lg"
      title={store?.name ?? ""}
      subtitle={store ? [store.ops?.campus ?? "경북대", store.tier === "BOOST" ? "Boost" : store.tier === "CONTENT" ? "Premium" : "무료"].join(" · ") + " · 쿠폰 · 스탬프" : ""}
      footer={<>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        {store && <Button className="ml-auto" onClick={() => { onClose(); onGo(`astro-ops?open=${store.restaurant_id}`); }}>매장 상세 열기 →</Button>}
      </>}>
      {store && (
        <div className="space-y-6">
          <section>
            <h3 className="text-[14px] font-bold text-gray-900">앱에 나가는 쿠폰</h3>
            <p className="text-[12px] text-gray-500 mt-0.5 mb-2.5">여기서 고치면 바로 앱에 반영됩니다. 일반 쿠폰 · 한정 쿠폰.</p>
            <BenefitCatalogSection rid={rid} />
          </section>
          <section>
            <h3 className="text-[14px] font-bold text-gray-900">앱에 나가는 스탬프</h3>
            <p className="text-[12px] text-gray-500 mt-0.5 mb-2.5">적립 개수마다 보상 쿠폰이 자동으로 나갑니다. 고치면 바로 반영됩니다.</p>
            <StampRuleSection rid={rid} />
          </section>
          <section className="pt-4 border-t border-black/[0.06]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-bold text-gray-900">매장 정보 — 계약서에 적은 혜택</h3>
                <p className="text-[12px] text-gray-500 mt-0.5">영업 기록 · 견적서 · 점주 안내문이 이 칸을 씁니다. 위 앱 혜택과 다르면 맞춰 주세요.</p>
              </div>
              <Button size="sm" disabled={busy} onClick={fillFromApp} className="shrink-0">앱 혜택으로 채우기</Button>
            </div>
            <div className="mt-3 grid gap-2.5">
              <label className="text-[12px] font-semibold text-gray-600">기본 쿠폰 (상시)<Textarea rows={2} value={ops.coupon_basic} onChange={set("coupon_basic")} placeholder="예: 메뉴당 1,000원 할인 (포장 제외)" /></label>
              <label className="text-[12px] font-semibold text-gray-600">한정 쿠폰<Textarea rows={2} value={ops.coupon_limited} onChange={set("coupon_limited")} placeholder="예: 아메리카노 사이즈업" /></label>
              <div className="grid grid-cols-[8rem_1fr] gap-2.5">
                <label className="text-[12px] font-semibold text-gray-600">스탬프 개수<Input value={ops.stamp_count} onChange={set("stamp_count")} placeholder="5 / 10" /></label>
                <label className="text-[12px] font-semibold text-gray-600">스탬프 혜택<Input value={ops.stamp_reward} onChange={set("stamp_reward")} placeholder="5개 음료 · 10개 만원 할인" /></label>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? "저장 중…" : "영업 기록 저장"}</Button>
              {msg && <span role="status" className={`text-[12px] ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
            </div>
          </section>
        </div>
      )}
    </SlideOver>,
    document.body,
  );
}
