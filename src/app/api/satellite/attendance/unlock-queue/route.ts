import { proxyGet } from "@/lib/apiProxy";

export async function GET() {
  return proxyGet("/api/satellite/attendance/unlock-queue/");
}
