/**
 * 매장 테이블 QR — 주소 규칙과 마케팅 안내문(HTML).
 *
 * 목록은 앱 식당 탭과 같은 백엔드 API(/restaurants/affiliate-restaurants/)에서 그때그때 받는다.
 * 매장이 추가되거나 앱 노출이 바뀌면 Drive와 안내문이 따로 손대지 않아도 같이 바뀐다.
 * 주소 형식은 앱(new1) docs/QR_딥링크_가이드.md 와 브릿지(wouldulike_deeplink)가 정한다.
 */

export const QR_BRIDGE_BASE = "https://cgc-knu.github.io/wouldulike_deeplink/";

/** 인쇄물 종류. 앱이 GA4 link_source 로 남기고, 쿠폰·스탬프 동작은 모두 같다. */
export const QR_PRINT_SOURCES = [
  { key: "sticker", label: "테이블 스티커" },
  { key: "poster", label: "포스터" },
  { key: "tent", label: "테이블 텐트" },
] as const;
export type QrPrintSource = (typeof QR_PRINT_SOURCES)[number]["key"];

export interface QrRestaurant {
  restaurant_id: number;
  name: string;
  campus: string;
}

export function restaurantQrLink(restaurantId: number, src: QrPrintSource = "sticker"): string {
  return `${QR_BRIDGE_BASE}?type=restaurant&id=${restaurantId}&src=${src}`;
}

const CAMPUS_ORDER = ["경북대", "계명대", "영남대"];

/** 백엔드 응답에서 QR에 필요한 값만 남긴다. 번호가 없는 행은 QR을 만들 수 없어 뺀다. */
export function normalizeQrRestaurants(raw: unknown): QrRestaurant[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { restaurants?: unknown }).restaurants)
      ? (raw as { restaurants: unknown[] }).restaurants
      : [];
  const seen = new Set<number>();
  const out: QrRestaurant[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = Number(r.restaurant_id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      restaurant_id: id,
      name: String(r.name ?? "").trim() || `매장 ${id}`,
      campus: String(r.campus ?? "").trim() || "기타",
    });
  }
  return out;
}

/** 대학가 순서(경북대·계명대·영남대·그 외), 안에서는 이름순. */
export function groupByCampus(list: QrRestaurant[]): { campus: string; restaurants: QrRestaurant[] }[] {
  const map = new Map<string, QrRestaurant[]>();
  for (const r of list) map.set(r.campus, [...(map.get(r.campus) ?? []), r]);
  const rank = (c: string) => {
    const i = CAMPUS_ORDER.indexOf(c);
    return i === -1 ? CAMPUS_ORDER.length : i;
  };
  return [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "ko"))
    .map(([campus, restaurants]) => ({
      campus,
      restaurants: [...restaurants].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    }));
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKoDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 마케팅팀에 넘기는 안내문. qrSvg 에 매장 번호별 SVG 를 주면 표에 QR 이미지를 함께 싣는다.
 */
export function buildRestaurantQrGuideHtml(
  list: QrRestaurant[],
  opts: { generatedAt?: Date; qrSvg?: Record<number, string> } = {},
): string {
  const groups = groupByCampus(list);
  const date = formatKoDate(opts.generatedAt ?? new Date());
  const summary = groups.map((g) => `${esc(g.campus)} ${g.restaurants.length}`).join(", ");
  const example = restaurantQrLink(317);

  const sections = groups
    .map((g) => {
      const rows = g.restaurants
        .map((r) => {
          const link = restaurantQrLink(r.restaurant_id);
          const svg = opts.qrSvg?.[r.restaurant_id];
          return `<tr>
<td class="name">${esc(r.name)}</td>
<td class="num">${r.restaurant_id}</td>
<td class="link"><a href="${esc(link)}">${esc(link)}</a></td>${svg ? `\n<td class="qr">${svg}</td>` : ""}
</tr>`;
        })
        .join("\n");
      return `<h2>${esc(g.campus)} <span class="count">${g.restaurants.length}곳</span></h2>
<div class="scroll">
<table>
<thead><tr><th>매장</th><th>번호</th><th>테이블 스티커 주소</th>${opts.qrSvg ? "<th>QR</th>" : ""}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
    })
    .join("\n\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>매장 테이블 QR 안내</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif; color: #1f2937; max-width: 980px; margin: 0 auto; padding: 40px 24px 80px; line-height: 1.65; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 40px 0 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
  .count { font-size: 14px; font-weight: 500; color: #6b7280; }
  .meta { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
  code, .addr { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  .addr { display: block; background: #f3f4f6; border-radius: 10px; padding: 14px 16px; word-break: break-all; margin: 8px 0 12px; }
  .addr b { color: #4f46e5; }
  .scroll { overflow-x: auto; }
  table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  th { background: #f9fafb; font-weight: 600; color: #4b5563; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; width: 56px; }
  td.name { white-space: nowrap; font-weight: 600; }
  td.link a { color: #4f46e5; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; text-decoration: none; }
  td.qr { width: 88px; }
  td.qr svg { width: 80px; height: 80px; display: block; }
  ul, ol { padding-left: 22px; }
  li { margin: 4px 0; }
  .note { background: #eef2ff; border-radius: 10px; padding: 12px 16px; font-size: 14px; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<h1>매장 테이블 QR 안내</h1>
<p class="meta">기준: ${date} · 앱 식당 탭에 나오는 제휴 매장 ${list.length}곳 (${summary})</p>

<p>테이블·포스터에 붙이는 QR은 매장마다 주소가 하나씩입니다. 손님이 찍으면 우주라이크 앱이 그 매장으로 열리고, 처음이면 쿠폰이 나가고 다음부터는 스탬프를 찍는 화면이 나옵니다.</p>

<h2>QR에 넣을 주소</h2>
<p>테이블 스티커는 아래 주소입니다. 숫자만 매장 번호로 바꿉니다.</p>
<span class="addr">${esc(QR_BRIDGE_BASE)}?type=restaurant&amp;id=<b>매장번호</b>&amp;src=sticker</span>
<p>예) 라라더(317): <a href="${esc(example)}"><code>${esc(example)}</code></a></p>
<p><code>type=restaurant</code>와 <code>src=sticker</code>는 그대로 둡니다. <code>id</code>만 매장 번호입니다.</p>
<p>포스터는 끝의 <code>sticker</code>를 <code>poster</code>로, 테이블 텐트는 <code>tent</code>로 바꿉니다. 쿠폰·스탬프 동작은 같고, 나중에 어떤 인쇄물이 효과가 있었는지만 구분됩니다. 한 매장에 스티커와 포스터를 같이 쓰면 주소를 두 개 만듭니다.</p>

<h2>손님이 찍으면</h2>
<ul>
<li>앱이 있으면 그 매장 화면이 열립니다.</li>
<li>그 매장 QR을 처음 찍은 손님에게는 쿠폰 1장이 나갑니다. 받은 날 자정까지이고, 같은 매장에서는 한 사람당 한 번입니다.</li>
<li>그 다음 방문은 스탬프 적립 화면입니다. 아직 안 쓴 쿠폰이 있으면 그 화면에서 쿠폰을 쓰고 스탬프도 찍을 수 있습니다.</li>
<li>오늘 이미 스탬프를 찍었으면 "오늘 완료" 안내가 나옵니다.</li>
<li>앱이 없으면 앱스토어·플레이스토어로 갑니다. 설치 뒤에 자동으로 그 매장으로 이어지지는 않으므로, 설치 후 QR을 한 번 더 찍어 달라고 안내하면 됩니다.</li>
</ul>

${sections}

<h2>새로 들어오는 매장</h2>
<p class="note">대시보드 홈 → Drive → <b>매장 QR</b>에 새 매장이 자동으로 올라옵니다. 앱 식당 탭에 보이게 되는 순간부터 그곳에서 QR 이미지를 바로 내려받을 수 있습니다.</p>
<p>직접 만들 때는 매장 이름으로 QR을 만들지 않습니다. 앱에 등록된 <b>매장 번호</b>가 있어야 합니다.</p>
<ol>
<li>운영에서 그 매장을 제휴 식당으로 등록하고, 앱 식당 탭에 보이게 합니다.</li>
<li>등록이 끝나면 매장 번호를 받습니다. 세틀라이트 매장 정보의 <code>restaurant_id</code>와 같은 숫자입니다. Drive의 매장 QR 카드에도 번호가 적혀 있습니다.</li>
<li>주소의 <code>id=</code> 뒤에 그 번호를 넣습니다. 나머지 글자는 라라더 예시와 같게 둡니다.</li>
<li>그 주소로 QR을 만듭니다. 다른 매장 QR을 복사해 매장 이름만 바꾸면 손님이 엉뚱한 매장으로 갑니다.</li>
<li>인쇄 전에 아이폰·안드로이드로 각각 한 번씩 찍어, 그 매장 이름 화면이 열리는지 확인합니다.</li>
</ol>
<p>같은 매장의 2호점이라도 번호가 다릅니다. 지점마다 QR을 따로 만듭니다.</p>

<h2>인쇄할 때</h2>
<ul>
<li>QR 한 변은 2.5cm 이상. 테이블에서 폰으로 바로 읽히는 크기입니다.</li>
<li>주소가 길어서 QR이 촘촘합니다. 작은 스티커일수록 더 크게 뽑습니다.</li>
<li>QR 둘레 여백을 자르지 않습니다.</li>
<li>카카오톡 카메라로도 한 번 찍어, 앱이 바로 안 열리면 화면에 "우주라이크 앱 열기" 버튼이 있는지만 보면 됩니다.</li>
</ul>
</body>
</html>
`;
}
