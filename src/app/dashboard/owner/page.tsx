import { cookies } from "next/headers";
import StorePicker, { type PickStore } from "./StorePicker";
import { decodeJwt } from "@/lib/jwt";
import PartnerHome, { type PartnerHomeData } from "./PartnerHome";

/**
 * 파트너 뷰 첫 화면 (민열님 0919). 폼이 아니라 **숫자와 "우주라이크가 한 일"** 이 먼저다.
 * 원자료는 백엔드 /api/astro/partner/home/ 한 벌. 점주 토큰이면 자기 매장, 관리자면 ?rid.
 */

async function fetchHome(token: string, rid?: string): Promise<PartnerHomeData | null> {
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/astro/partner/home/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PartnerHomeData;
  } catch { return null; }
}

async function fetchPromoFiles(token: string, rid?: string): Promise<{ poster_url: string; qr_url: string }> {
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/promo-files/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return { poster_url: "", qr_url: "" };
    return await res.json();
  } catch { return { poster_url: "", qr_url: "" }; }
}

/** 관리자가 고를 매장 목록. 못 읽으면 빈 배열 — 화면이 "0곳"이 아니라 "못 읽었다"고 말한다. */
async function fetchStores(token: string): Promise<PickStore[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurants/`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { restaurants?: PickStore[] };
    return j.restaurants ?? [];
  } catch { return []; }
}

export default async function OwnerHomePage({ searchParams }: { searchParams: Promise<{ rid?: string }> }) {
  const { rid } = await searchParams;
  const token = (await cookies()).get("access_token")?.value ?? "";

  /**
   * 관리자 JWT 인데 rid 가 없으면 **볼 매장을 고르게 한다** (민열님 0919).
   * 전에는 관리자 화면으로 되돌렸는데, 화면이 그대로여서 '파트너를 눌러도 안 바뀐다' 로 보였다.
   */
  let adminNoRid = false;
  try { const p = decodeJwt<{ is_admin?: boolean }>(token); adminNoRid = Boolean(p.is_admin) && !rid; } catch { /* 무시 */ }
  if (adminNoRid) return <StorePicker stores={await fetchStores(token)} />;

  const [home, promo] = await Promise.all([fetchHome(token, rid), fetchPromoFiles(token, rid)]);

  if (!home) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-[14px] font-semibold text-gray-700">매장 정보를 불러오지 못했습니다.</p>
        <p className="text-[12.5px] text-gray-400 mt-1">잠시 뒤 다시 열어 보시고, 계속 안 되면 hello@wouldulike.kr 로 알려 주세요.</p>
      </div>
    );
  }

  return (
    <>
      {/* 온보딩을 마친 사장님이 곧장 들어오는 화면이다. 아직 손보는 중인데 아무 말이 없으면
          "이게 다인가" 하고 실망한 채로 나가신다. 사실대로 먼저 적는다. (0922) */}
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] font-semibold text-amber-900">지금 보완하고 있는 화면입니다</p>
          <p className="text-[12.5px] text-amber-800 mt-0.5">
            쿠폰·스탬프 사용 내역과 성과 지표를 곧 여기에 붙입니다. 그때까지 궁금하신 것은 담당자에게 물어봐 주세요.
            <b> 손님께 나가는 혜택과 적립은 지금도 정상으로 돌아갑니다.</b>
          </p>
        </div>
      </div>
      <PartnerHome data={home} ridParam={rid ? `?rid=${rid}` : ""} promo={promo} />
    </>
  );
}
