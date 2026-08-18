import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET() {
  return proxyGet("/api/bannerlab/weekly/semesters/");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", "/api/bannerlab/weekly/semesters/", body);
}
