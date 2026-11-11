import { NextResponse } from "next/server";
import { authenticateOwner, OwnerError, ownerModeEnabled, positiveId } from "@/lib/owner/appAuth";
import { ownerRouteMethods } from "@/lib/owner/routes";
import { ownerOperation, validateOwnerInput } from "@/lib/owner/operations";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function handle(req: Request) {
  try {
    const url = new URL(req.url);
    const allowed = ownerRouteMethods(url.pathname);
    if (!allowed) throw new OwnerError(404, "not_found", "지원하지 않는 요청입니다.");
    if (!allowed.includes(req.method)) return NextResponse.json({ code: "method_not_allowed" }, { status: 405, headers: { ...headers, Allow: allowed.join(", ") } });
    if ([...url.searchParams.keys()].some((k) => k !== "restaurant_id") || url.searchParams.getAll("restaurant_id").length > 1)
      throw new OwnerError(400, "invalid_input", "지원하지 않는 요청 항목입니다.");
    const route = url.pathname.slice("/api/app/owner/".length);
    const rid = route === "config" && !url.searchParams.has("restaurant_id") ? undefined : positiveId(url.searchParams.get("restaurant_id"));
    const input = ["POST", "PATCH"].includes(req.method) ? await req.json().catch(() => { throw new OwnerError(400, "invalid_input", "JSON 입력이 필요합니다."); }) : undefined;
    validateOwnerInput(route, req.method, input);
    const ctx = await authenticateOwner(req, rid);
    const enabled = ownerModeEnabled();
    if (route === "config") return NextResponse.json({ enabled }, { headers });
    if (!enabled) throw new OwnerError(503, "owner_mode_disabled", "사장님 모드를 사용할 수 없습니다.");
    return NextResponse.json(await ownerOperation(ctx, route, req.method, input), { headers });
  } catch (e) {
    const err = e instanceof OwnerError ? e : new OwnerError(502, "upstream_unavailable", "요청을 처리하지 못했습니다.");
    return NextResponse.json({ code: err.code, detail: err.message }, { status: err.status, headers });
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE, handle as OPTIONS, handle as HEAD };
