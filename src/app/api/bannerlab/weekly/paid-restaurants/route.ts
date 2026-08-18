import { proxyGet } from "@/lib/apiProxy";

export async function GET() {
  return proxyGet("/api/bannerlab/weekly/paid-restaurants/");
}
