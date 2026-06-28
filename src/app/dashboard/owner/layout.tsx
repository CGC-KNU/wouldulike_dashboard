import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import BottomNav from "@/components/BottomNav";
import AdminViewBanner from "@/components/DevModeBanner";

export default async function OwnerLayout({
  children,
  params: _params,
}: {
  children: React.ReactNode;
  params: Promise<Record<string, string>>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  let isAdmin = false;
  try {
    const payload = decodeJwt<{ is_admin?: boolean }>(token);
    isAdmin = !!payload.is_admin;
  } catch {
    // 파싱 실패 무시
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isAdmin && <AdminViewBanner currentMode="owner" />}
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
