"use client";

import { useEffect, useState } from "react";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import ImageUploader from "@/components/ImageUploader";
import { Button, Chip, Field, Input, Notice, Select, Skeleton } from "../_shared/ui";

/**
 * 파트너 매장 상세 안의 **식당 관리** 블록.
 *
 * 민열님 0913: "식당 관리에서 하던 일(사진 등록·PIN 수정 등)을 파트너 매장으로 옮기고, 식당 관리 데이터 풀이 기준이 된다."
 * 그래서 여기서 손대는 값은 전부 **백엔드 매장(식당 관리와 같은 레코드)** 이다. Astro 운영 필드(계약·입금)와 섞이지 않게
 * 블록을 따로 두고, 저장 대상이 어디인지 화면이 말한다.
 *
 * 쓰는 경로는 식당 관리 화면과 같다 —
 *   사진   GET/PATCH `/api/dashboard/restaurant?rid=<id>` (`s3_image_urls`)
 *   플랜·제휴·PIN  PATCH `/api/dashboard/admin/restaurants/<id>`
 *   포스터·QR      GET/PUT `/api/dashboard/admin/promo-files/<id>`
 * 백엔드가 없으면(미리보기) 읽기는 비고 쓰기는 막힌다 — 조용히 성공한 척하지 않는다.
 */

interface Detail { s3_image_urls?: string[]; pin?: string | number | null; phone_number?: string | null; address?: string | null }

export default function StoreAppSection({ id, tier, isAffiliate, onChanged, onEnd }: { id: number; tier: string | null; isAffiliate: boolean; onChanged?: () => void; onEnd?: () => void | Promise<void> }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [promo, setPromo] = useState<{ poster_url: string; qr_url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [msg, setMsg] = useState<{ tone: "blue" | "red"; text: string } | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  /** 계약 종료는 앱에 바로 보이는 변화라 화면 안에서 한 번 더 확인받는다. */
  const [ending, setEnding] = useState(false);

  const load = () => {
    setLoading(true); setMsg(null);
    Promise.all([
      fetch(`/api/dashboard/restaurant?rid=${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/dashboard/admin/promo-files/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([d, p]) => {
      setReachable(Boolean(d));
      setDetail((d as Detail) ?? {});
      setPin(d?.pin != null ? String(d.pin) : "");
      setPromo({ poster_url: p?.poster_url ?? "", qr_url: p?.qr_url ?? "" });
    }).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  async function patchStore(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/admin/restaurants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ tone: "red", text: (d as { detail?: string }).detail ?? `저장하지 못했습니다 (${res.status}).` }); return; }
      setMsg({ tone: "blue", text: ok });
      onChanged?.();
    } finally { setBusy(false); }
  }

  /**
   * 계약 종료 — 두 곳을 같이 고친다.
   *   ① 앱 매장의 제휴를 끈다 (앱에서 혜택이 사라진다)
   *   ② 영업 기록에 종료일을 남긴다 (날짜가 없으면 나중에 아무도 모른다)
   * 둘 다 끝난 뒤에야 "옮겼다"고 말한다. 하나라도 실패하면 실패라고 말한다.
   */
  async function endContract() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/admin/restaurants/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_affiliate: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg({ tone: "red", text: (d as { detail?: string }).detail ?? `제휴를 끄지 못했습니다 (${res.status}).` });
        return;
      }
      await onEnd?.();
      setEnding(false);
      setMsg({ tone: "blue", text: "계약 종료로 옮겼습니다. 파트너 매장의 '계약 종료' 칸에서 볼 수 있고, 재계약하면 그대로 되돌아옵니다." });
      onChanged?.();
    } catch {
      setMsg({ tone: "red", text: "서버에 연결하지 못했습니다. 옮기지 못했습니다." });
    } finally { setBusy(false); }
  }

  async function savePromo() {
    if (!promo) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/admin/promo-files/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(promo) });
      setMsg(res.ok ? { tone: "blue", text: "포스터·QR 링크를 저장했습니다." } : { tone: "red", text: `저장하지 못했습니다 (${res.status}).` });
    } finally { setBusy(false); }
  }

  if (loading) return <Skeleton rows={3} cols={2} />;

  return (
    <div className="space-y-3">
      {!reachable && (
        <Notice tone="amber" title="백엔드를 읽지 못했습니다">
          미리보기이거나 백엔드가 닫혀 있습니다. <strong>여기 값은 저장되지 않습니다</strong> — 사진·플랜·PIN 은 앱에 바로 반영되는 값이라 초안 저장소에 담지 않습니다.
        </Notice>
      )}
      {msg && <Notice tone={msg.tone === "red" ? "red" : "blue"} title={msg.text} />}

      <div>
        <p className="text-[12px] font-semibold text-gray-700 mb-1.5">매장 사진 <span className="font-normal text-gray-400">1번이 배너 소재로 쓰입니다</span></p>
        <ImageUploader
          restaurantId={id}
          initialUrls={detail?.s3_image_urls ?? []}
          onSave={async (urls) => {
            const res = await fetch(`/api/dashboard/restaurant?rid=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ s3_image_urls: urls, restaurant_id: id }) });
            if (!res.ok) throw new Error("저장 실패");
            setDetail((d) => ({ ...(d ?? {}), s3_image_urls: urls }));
            onChanged?.();
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Field label="플랜" hint="앱과 청구가 같이 보는 값입니다">
          <Select value={tier ?? ""} disabled={busy} onChange={(e) => patchStore({ tier: e.target.value || null }, `플랜을 ${e.target.value || "미지정"} 으로 바꿨습니다.`)}>
            <option value="">미지정</option>
            <option value="FREE">FREE</option>
            <option value="BOOST">BOOST</option>
            <option value="CONTENT">CONTENT</option>
          </Select>
        </Field>
        <Field label="매장 PIN" hint="손님이 부르는 번호. 앱의 적립이 이 값으로 붙습니다">
          <div className="flex gap-1.5">
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="1234" inputMode="numeric" />
            <Button size="sm" onClick={() => patchStore({ pin }, "PIN 을 저장했습니다.")} disabled={busy || !pin}>저장</Button>
          </div>
        </Field>
      </div>

      {/* 계약 종료 — 지우지 않는다. 제휴만 끄고 종료일을 적어 '계약 종료' 칸으로 옮긴다.
          재계약하는 곳이 있어서 이력을 지우면 안 된다 (민열님 0914).
          되돌릴 수는 있지만 앱에 바로 보이는 변화라, **한 번 더 묻는다**. */}
      <div className="py-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-gray-700">
            상태 {isAffiliate ? <Chip tone="green">제휴 중</Chip> : <Chip tone="red">계약 종료</Chip>}
          </span>
          {isAffiliate ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setEnding((v) => !v)} aria-expanded={ending}>
              계약 종료
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => patchStore({ is_affiliate: true }, "다시 제휴 매장으로 옮겼습니다. 계약 시작일과 월 이용료를 확인하세요.")}>
              재계약 — 제휴 켜기
            </Button>
          )}
        </div>

        {ending && isAffiliate && (
          <div className="mt-2 rounded-[12px] border border-red-200 bg-red-50/70 p-3">
            <p className="text-[13px] font-semibold text-red-700">정말 계약 종료로 옮길까요?</p>
            <ul className="mt-1.5 text-[12px] text-red-900/80 leading-relaxed list-disc pl-4 space-y-0.5">
              <li>앱에서 <b>제휴 혜택이 바로 사라집니다</b> (쿠폰·스탬프). 일반 식당으로는 계속 보입니다.</li>
              <li>파트너 매장 목록의 <b>계약 종료</b> 칸으로 갑니다.</li>
              <li>청구·입금·홈 큐·일정에서 빠집니다.</li>
              <li>기록은 지우지 않습니다. 재계약하면 그대로 되살아납니다.</li>
            </ul>
            <div className="flex gap-2 mt-2.5">
              <Button size="sm" variant="danger" disabled={busy} onClick={endContract}>{busy ? "옮기는 중…" : "네, 계약 종료로 옮깁니다"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEnding(false)}>취소</Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Field label="포스터 링크"><Input value={promo?.poster_url ?? ""} onChange={(e) => setPromo((p) => ({ poster_url: e.target.value, qr_url: p?.qr_url ?? "" }))} placeholder="https://" /></Field>
        <Field label="QR 링크"><Input value={promo?.qr_url ?? ""} onChange={(e) => setPromo((p) => ({ poster_url: p?.poster_url ?? "", qr_url: e.target.value }))} placeholder="https://" /></Field>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={savePromo} disabled={busy}>포스터·QR 저장</Button>
        {promo?.poster_url && <a href={promo.poster_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy font-medium">포스터 열기 <IconExternalLink size={12} aria-hidden="true" /></a>}
        {promo?.qr_url && <a href={promo.qr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-navy font-medium">QR 열기 <IconExternalLink size={12} aria-hidden="true" /></a>}
        <Button size="sm" variant="ghost" icon={<IconRefresh />} onClick={load} disabled={busy}>다시 읽기</Button>
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        이 블록의 값은 <strong>식당 관리와 같은 매장 레코드</strong>에 저장됩니다. 계약·입금 같은 영업 기록은 아래 블록(Astro 운영 필드)에 따로 남습니다.
      </p>
    </div>
  );
}
