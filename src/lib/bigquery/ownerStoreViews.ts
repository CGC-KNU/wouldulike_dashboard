import { clientFromEnv, type Client } from "./appMetrics";
import { EVENT_LIVE_FROM } from "./couponFunnel";

export type ViewStatus = "ok" | "partial" | "pending" | "unavailable" | "unknown_start";
export interface OwnerStoreViews {
  month: number | null; total: number | null;
  month_status: ViewStatus; total_status: ViewStatus;
  through: string | null; available_from: string | null;
}
export const unavailableViews = (): OwnerStoreViews => ({ month: null, total: null,
  month_status: "unavailable", total_status: "unavailable", through: null, available_from: null });
const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function dateKey(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new Error("invalid date");
  return value.replace(/-/g, "");
}

/** 인증된 매장 한 곳만 조회. COUNTIF는 열람 횟수이며 고유 기기 수와 다르다. */
export async function readOwnerStoreViews(
  opts: { restaurantId: number; month: string; since: string | null; today: string },
  client: Client | null = clientFromEnv(process.env, { jobTimeoutMs: 8_000 }),
): Promise<OwnerStoreViews> {
  if (!Number.isSafeInteger(opts.restaurantId) || opts.restaurantId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(opts.month))
    throw new Error("invalid store/window");
  const month = dateKey(`${opts.month}-01`), since = opts.since ? dateKey(opts.since) : null, today = dateKey(opts.today);
  if (!client) return unavailableViews();
  const [tables] = await client.run<{ first: string | null; last: string | null }>(
    `SELECT MIN(table_id) AS first, MAX(table_id) AS last FROM \`${client.dataset}.__TABLES__\`
     WHERE REGEXP_CONTAINS(table_id, r'^events_[0-9]{8}$')`,
  );
  if (!tables?.first || !tables.last) return { ...unavailableViews(), month_status: "pending", total_status: since ? "pending" : "unknown_start" };
  const available = [EVENT_LIVE_FROM.restaurant_detail_open, tables.first.slice(7)].sort().at(-1)!;
  const end = [today, tables.last.slice(7)].sort()[0];
  const out: OwnerStoreViews = { month: null, total: null, month_status: "pending",
    total_status: since ? "pending" : "unknown_start", through: dash(end), available_from: dash(available) };
  const bounds = [month, ...(since ? [since] : [])].map((s) => s < available ? available : s).sort();
  if (bounds[0] > end) return out;
  const [row] = await client.run<{ month: number; total: number }>(
    `SELECT COUNTIF(_TABLE_SUFFIX >= @month) AS month, COUNTIF(_TABLE_SUFFIX >= @since) AS total
     FROM \`${client.dataset}.events_*\`
     WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'restaurant_detail_open'
       AND (SELECT COALESCE(CAST(value.int_value AS STRING), value.string_value)
            FROM UNNEST(event_params) WHERE key = 'restaurant_id') = @rid`,
    { month, since: since ?? "99991231", start: bounds[0], end, rid: String(opts.restaurantId) },
  );
  if (month <= end) { out.month = Number(row?.month ?? 0); out.month_status = month < available ? "partial" : "ok"; }
  if (since && since <= end) { out.total = Number(row?.total ?? 0); out.total_status = since < available ? "partial" : "ok"; }
  return out;
}
