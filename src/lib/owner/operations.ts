import { backend, Backend, JsonObject, OwnerError, OwnerRequestContext, ownerCall } from "./appAuth";
import { invoiceVisible, reportStatus } from "./presentation";
import { PLANS } from "./plans";
import { submitBenefitRequest } from "./benefitRequests";

export const EDITABLE_FIELDS = ["description", "phone_number", "main_menu", "url", "address", "category", "promotion_text", "s3_image_urls"];
export function validateBody(body: unknown, fields: readonly string[]): JsonObject {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OwnerError(400, "invalid_input", "입력값을 확인해 주세요.");
  const obj = body as JsonObject;
  if (Object.keys(obj).some((key) => !fields.includes(key))) throw new OwnerError(400, "invalid_input", "허용되지 않는 항목입니다.");
  return obj;
}
export function validateOwnerInput(route: string, method: string, input: unknown): void {
  if (method === "GET") return;
  const fields: Record<string, string[]> = { restaurant: EDITABLE_FIELDS,
    "images/presign": ["filename", "content_type"], "pin/change": ["current_pin", "new_pin"],
    "benefit-requests": ["action", "benefit_id", "title", "subtitle", "notes", "note"] };
  if (fields[route]) validateBody(input, fields[route]);
}
const tokenValid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{40}$/.test(v);
export async function publishedReports(ctx: OwnerRequestContext, call: Backend = backend): Promise<JsonObject[]> {
  const d = await ownerCall(ctx, "/api/probe/reports/mine/", "GET", undefined, call);
  if (!Array.isArray(d.reports)) throw new OwnerError(502, "upstream_invalid", "리포트를 읽지 못했습니다.");
  return d.reports.filter((r: JsonObject) => ["LINKED", "SENT"].includes(r.status) && tokenValid(r.token))
    .sort((a: JsonObject, b: JsonObject) => String(b.sent_at ?? b.linked_at ?? b.created_at ?? "").localeCompare(String(a.sent_at ?? a.linked_at ?? a.created_at ?? "")));
}
export async function openReport(ctx: OwnerRequestContext, id: string, call: Backend = backend) {
  const rows = await publishedReports(ctx, call);
  const row = rows.find((r) => String(r.id) === id);
  if (!row) throw new OwnerError(404, "report_unavailable", "공개된 리포트를 찾지 못했습니다.");
  const d = await ownerCall(ctx, `/api/probe/reports/by-token/${row.token}/`, "GET", undefined, call);
  if (!d.report || String(d.report.id) !== id || !["LINKED", "SENT"].includes(d.report.status) || d.report.token !== row.token)
    throw new OwnerError(404, "report_unavailable", "리포트 공개가 종료되었습니다.");
  return { url: `https://app.wouldulike.kr/r/${row.token}` };
}
export async function ownerOperation(ctx: OwnerRequestContext, route: string, method: string, input: unknown, call: Backend = backend): Promise<unknown> {
  const get = (p: string) => ownerCall(ctx, p, "GET", undefined, call);
  if (route === "home" || route === "plan") {
    const home = await get("/api/astro/partner/home/");
    if (!home.store || !home.billing || !home.stats || !Array.isArray(home.feed))
      throw new OwnerError(502, "upstream_invalid", "매장 정보를 읽지 못했습니다.");
    home.billing = { monthly_fee: home.billing.monthly_fee, pay_cycle: home.billing.pay_cycle,
      invoice: invoiceVisible(home.billing.invoice) ? home.billing.invoice : null };
    if (route === "plan") return { store: home.store, billing: home.billing,
      plans: PLANS.map(({ id, displayName, price, priceSub, features }) => ({ id, displayName, price, priceSub, features })) };
    const [promo, reports] = await Promise.allSettled([get("/api/dashboard/promo-files/"), publishedReports(ctx, call)]);
    for (const r of [promo, reports]) {
      if (r.status === "rejected" && r.reason instanceof OwnerError && [401, 403, 409].includes(r.reason.status)) throw r.reason;
    }
    return { ...home, promo: promo.status === "fulfilled" ? promo.value : null,
      report_status: reportStatus(home.store.contract_days ?? null, reports.status === "fulfilled" ? reports.value.length : null),
      partial_errors: [promo.status === "rejected" ? "promo" : null, reports.status === "rejected" ? "reports" : null].filter(Boolean) };
  }
  if (route === "reports") return { reports: (await publishedReports(ctx, call)).map((r) => ({
    id: String(r.id), title: r.title, summary: r.summary, status: r.status,
    created_at: r.created_at, linked_at: r.linked_at, sent_at: r.sent_at,
  })) };
  const report = /^reports\/([A-Za-z0-9_-]+)\/open$/.exec(route);
  if (report) return openReport(ctx, report[1], call);
  if (route === "benefits") {
    const [current, choices] = await Promise.all([get("/api/dashboard/coupon-benefits/"), get("/api/astro/partner/benefits/")]);
    return { current, choices: choices.benefits };
  }
  if (route === "benefit-requests" && method === "POST") {
    const body = validateBody(input, ["action", "benefit_id", "title", "subtitle", "notes", "note"]);
    if (!["EDIT", "STOP", "RESUME", "OTHER"].includes(body.action)) throw new OwnerError(400, "invalid_input", "신청 종류를 선택해 주세요.");
    if (["title", "subtitle", "notes", "note"].some((k) => k in body && typeof body[k] !== "string") ||
        (body.action !== "OTHER" && (!Number.isSafeInteger(body.benefit_id) || body.benefit_id <= 0)))
      throw new OwnerError(400, "invalid_input", "신청할 혜택과 내용을 확인해 주세요.");
    return submitBenefitRequest(body, (b) => ownerCall(ctx, "/api/astro/benefit-requests/", "POST", b, call));
  }
  if (route === "restaurant" && method === "PATCH") {
    const body = validateBody(input, EDITABLE_FIELDS);
    if (!Object.keys(body).length || Object.entries(body).some(([k, v]) => k !== "s3_image_urls" && typeof v !== "string"))
      throw new OwnerError(400, "invalid_input", "매장 입력값을 확인해 주세요.");
    if ("s3_image_urls" in body && (!Array.isArray(body.s3_image_urls) || body.s3_image_urls.length > 5 || body.s3_image_urls.some((v: unknown) => typeof v !== "string" || !v.startsWith("https://"))))
      throw new OwnerError(400, "invalid_input", "사진은 HTTPS 주소로 최대 5장까지 저장할 수 있습니다.");
    return ownerCall(ctx, "/api/dashboard/restaurant/", "PATCH", body, call);
  }
  if (route === "images/presign") {
    const body = validateBody(input, ["filename", "content_type"]);
    if (typeof body.filename !== "string" || !body.filename || !["image/jpeg", "image/png", "image/webp"].includes(body.content_type))
      throw new OwnerError(400, "invalid_input", "지원하는 사진 파일을 선택해 주세요.");
    return ownerCall(ctx, "/api/dashboard/images/presign/", "POST", { ...body, restaurant_id: ctx.restaurantId, upload_type: "restaurant" }, call);
  }
  if (route === "pin/change") {
    const body = validateBody(input, ["current_pin", "new_pin"]);
    if (typeof body.new_pin !== "string" || (body.current_pin !== undefined && typeof body.current_pin !== "string"))
      throw new OwnerError(400, "invalid_input", "PIN을 확인해 주세요.");
    return ownerCall(ctx, "/api/dashboard/auth/change-pin/", "POST", body, call);
  }
  if (route === "stamp-rule") {
    try { return await get("/api/dashboard/stamp-rule/"); }
    catch (e) {
      // Only the existing explicit absence marker is a valid empty state.
      if (e instanceof OwnerError && e.status === 404 && e.upstreamData?.exists === false) return { exists: false };
      throw e;
    }
  }
  const paths: Record<string, string> = { restaurant: "/api/dashboard/restaurant/", categories: "/api/config/categories/",
    "stamp-rule": "/api/dashboard/stamp-rule/", "benefit-requests": "/api/astro/benefit-requests/" };
  if (paths[route] && method === "GET") return get(paths[route]);
  throw new OwnerError(404, "not_found", "지원하지 않는 요청입니다.");
}
