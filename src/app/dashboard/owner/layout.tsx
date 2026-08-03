import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import AdminViewBanner from "@/components/DevModeBanner";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import OwnerNavWrapper from "@/components/OwnerNavWrapper";

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
    <ViewModeProvider>
      <div className="min-h-screen bg-background">
        {isAdmin && <AdminViewBanner currentMode="owner" />}
        <OwnerNavWrapper>{children}</OwnerNavWrapper>
      </div>
    </ViewModeProvider>
  );
}
