import { cookies } from "next/headers";
import type { PartnerHomeData } from "../PartnerHome";

/**
 * 리포트 — 월간 A4 한 장 (파트너 뷰 탭, 민열님 0919).
 *
 * 리포트 본문은 Probe 가 만들고 공개 링크(/r/<token>)로 카톡으로 보낸다. 점주가 여기서 볼 수 있는 건
 * **첫 리포트까지 얼마나 남았는지**와, 받은 리포트 링크다. 리포트 목록 API 가 점주 토큰으로 열리면
 * 그때 이 화면에 목록이 붙는다 — 지금은 지어내지 않는다.
 */
export default async function OwnerReportsPage({ searchParams }: { searchParams: Promise<{ rid?: string }> }) {
  const { rid } = await searchParams;
  const token = (await cookies()).get("access_token")?.value ?? "";
  let data: PartnerHomeData | null = null;
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/astro/partner/home/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.ok) data = (await res.json()) as PartnerHomeData;
  } catch { data = null; }

  const days = data?.store.contract_days ?? null;
  const left = days === null ? null : Math.max(0, 30 - days);
  const s = data?.stats;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-5 pb-8 space-y-3">
      <h1 className="text-[18px] font-bold text-gray-900">리포트</h1>
      <p className="text-[12.5px] text-gray-500 -mt-1">매달 A4 한 장. 쿠폰이 몇 장 나갔고 그중 몇 장이 실제로 쓰였는지, 무엇을 했는지를 적어 드립니다. 매출을 약속하지는 않습니다.</p>

      <div className="bg-white rounded-[18px] border border-gray-200 p-4">
        {left === null ? (
          <p className="text-[13px] text-gray-600">계약 시작일이 아직 안 적혀 있어 첫 리포트 시점을 계산할 수 없습니다. 담당자에게 알려 주세요.</p>
        ) : left > 0 ? (
          <>
            <p className="text-[14px] font-bold text-gray-900">첫 월간 리포트까지 {left}일</p>
            <p className="text-[12.5px] text-gray-500 mt-1">계약 {days}일차. 30일치 데이터가 쌓이면 담당자가 정리해서 보내 드립니다.</p>
            <div className="h-[8px] rounded-full bg-black/[0.06] overflow-hidden mt-3"><div className="h-full rounded-full bg-[linear-gradient(90deg,#050072,#6366E0)]" style={{ width: `${Math.min(100, ((days ?? 0) / 30) * 100)}%` }} /></div>
          </>
        ) : (
          <>
            <p className="text-[14px] font-bold text-gray-900">월간 리포트가 준비됩니다</p>
            <p className="text-[12.5px] text-gray-500 mt-1">담당자가 카카오톡으로 링크를 보내 드립니다. 못 받으셨으면 <a href="mailto:hello@wouldulike.kr" className="text-navy font-semibold">hello@wouldulike.kr</a></p>
          </>
        )}
      </div>

      {s && (
        <div className="bg-white rounded-[18px] border border-gray-200 p-4">
          <p className="text-[13px] font-bold text-gray-900 mb-2">이번 달 지금까지</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {([["쿠폰 사용", s.this.coupon_used, "장"], ["스탬프", s.this.stamp, "개"], ["재방문", s.this.revisit, "명"]] as const).map(([k, v, u]) => (
              <div key={k} className="rounded-xl bg-navy/[0.04] py-2.5"><dt className="text-[11px] text-gray-500">{k}</dt><dd className="text-[20px] font-bold text-gray-900 tabular-nums">{v}<span className="text-[11px] font-medium text-gray-400 ml-0.5">{u}</span></dd></div>
            ))}
          </dl>
          <p className="text-[11.5px] text-gray-400 mt-2">리포트에는 이 숫자에 콘텐츠 도달·저장과 담당자 코멘트가 붙습니다.</p>
        </div>
      )}
    </div>
  );
}
