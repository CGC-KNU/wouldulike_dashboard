import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ department: string }> }) {
  const { department } = await ctx.params;
  return proxyBody(
    "PATCH",
    `/api/dashboard/admin/department-permissions/${department}/`,
    await req.json()
  );
}
