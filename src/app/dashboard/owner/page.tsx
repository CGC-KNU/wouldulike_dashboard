import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

export default async function OwnerHomePage({ searchParams }: { searchParams: Promise<{ rid?: string }> }) {
  const { rid } = await searchParams;
  const token = (await cookies()).get("access_token")?.value ?? "";

  // 관리자 JWT 인데 rid 가 없으면 관리자 화면으로 — 볼 매장이 없다
  let adminNoRid = false;
  try { const p = decodeJwt<{ is_admin?: boolean }>(token); adminNoRid = Boolean(p.is_admin) && !rid; } catch { /* 무시 */ }
  if (adminNoRid) redirect("/dashboard/admin");

  const [home, promo] = await Promise.all([fetchHome(token, rid), fetchPromoFiles(token, rid)]);

  if (!home) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-[14px] font-semibold text-gray-700">매장 정보를 불러오지 못했습니다.</p>
        <p className="text-[12.5px] text-gray-400 mt-1">잠시 뒤 다시 열어 보시고, 계속 안 되면 hello@wouldulike.kr 로 알려 주세요.</p>
      </div>
    );
  }

  return <PartnerHome data={home} ridParam={rid ? `?rid=${rid}` : ""} promo={promo} />;
}
