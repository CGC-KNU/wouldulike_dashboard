/** Shared with Edge middleware; only these methods bypass web cookie authentication. */
const methods: Record<string, readonly string[]> = {
  config: ["GET"], home: ["GET"], restaurant: ["GET", "PATCH"],
  categories: ["GET"], "pin/change": ["POST"], "images/presign": ["POST"],
  benefits: ["GET"], "stamp-rule": ["GET"], "benefit-requests": ["GET", "POST"],
  reports: ["GET"], plan: ["GET"],
};
export function ownerRouteMethods(pathname: string): readonly string[] | undefined {
  const prefix = "/api/app/owner/";
  if (!pathname.startsWith(prefix)) return undefined;
  const path = pathname.slice(prefix.length);
  if (Object.prototype.hasOwnProperty.call(methods, path)) return methods[path];
  return /^reports\/[A-Za-z0-9_-]{1,100}\/open$/.test(path) ? ["GET"] : undefined;
}
