import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

async function fetchRestaurantName(token: string, id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant/?restaurant_id=${id}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.name ?? null;
  } catch {
    return null;
  }
}

export default async function AdminRestaurantAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const name = await fetchRestaurantName(token, id);
  if (!name) notFound();

  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/admin"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 19L8 12L15 5" stroke="#0A0676" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <p className="text-xs text-gray-400">식당 지표</p>
          <h1 className="text-lg font-bold text-navy">{name}</h1>
        </div>
      </div>

      {/* Placeholder — 지표 코드 연동 예정 */}
      <div className="bg-white rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">📊</div>
        <p className="text-sm font-semibold text-gray-600">지표 대시보드 준비 중</p>
        <p className="text-xs text-gray-400">식당 ID: {id}</p>
      </div>
    </div>
  );
}
