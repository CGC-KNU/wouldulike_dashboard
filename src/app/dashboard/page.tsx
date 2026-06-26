import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwt } from "@/lib/jwt";

interface DashboardJWT {
  is_admin?: boolean;
}

export default async function DashboardRootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) redirect("/login");

  try {
    const payload = decodeJwt<DashboardJWT>(token);
    if (payload.is_admin) redirect("/dashboard/admin");
  } catch {
    // 파싱 실패 시 owner 폴백
  }

  redirect("/dashboard/owner");
}
