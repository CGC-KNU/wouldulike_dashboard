import { proxyGet } from "@/lib/apiProxy";

export async function GET() {
  return proxyGet("/api/dashboard/admin/department-permissions/");
}
