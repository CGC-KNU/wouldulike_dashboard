import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";

/**
 * 카카오맵 매장 리서치 — 기획안을 쓰기 전에 **실물**을 모은다.
 *
 * 윤지님 교안(`기획안_제작_교안_윤지.md` §4)의 `_research.py` 를 그대로 옮겼다.
 * 그 스크립트는 표준 라이브러리로 카카오맵 공개 엔드포인트 두 개만 부른다 —
 * 검색으로 장소 id 를 찾고, 그 id 로 상세 패널을 읽는다. 옮기는 데 막힐 게 없었다.
 *
 * ## 왜 툴 안에 두나
 *
 * 교안의 철칙 1번이 "실측·실물만 쓴다"이다. 메뉴·가격·영업시간은 카카오맵에 있는 것만 쓴다.
 * 그러려면 기획안을 쓰기 전에 리서치가 손에 있어야 하는데, 지금은 터미널을 열어야 했다.
 * 미팅 잡히면 그 자리에서 눌러 볼 수 있어야 한다.
 *
 * ## 여기서 하지 않는 것
 *
 * **기획안을 쓰지는 않는다.** 소구점·큐레이션 주제는 판단이라 사람(또는 클로드)이 쓴다.
 * 이 라우트는 그 판단에 필요한 재료를 모아 줄 뿐이다. 없는 값을 지어내지 않는다 —
 * 카카오맵이 안 주면 빈 칸으로 둔다.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function getJson<T>(url: string, referer: string, extra: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, "Accept-Language": "ko", ...extra },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type Search = { place?: { confirmid?: string; name?: string; address?: string }[] };

interface Panel {
  summary?: { category?: { name?: string }; address?: { road?: string }; road_view?: { url?: string } };
  kakaomap_review?: {
    score_set?: { average_score?: number; review_count?: number; photo_count?: number; strength_counts?: { id: string }[] };
    strength_description?: { id: string; name: string }[];
    reviews?: { contents?: string; content?: string; point?: number; star_rating?: number }[];
  };
  menu?: { menus?: { items?: { name?: string; price?: number; recommend_reasons?: string[]; ai_mate_desc?: string }[] } };
  open_hours?: { week_from_today?: { week_periods?: { days?: { on_days?: { start_end_time_desc?: string; break_times_desc?: string[] } }[] }[] } };
  blog_review?: { reviews?: { title?: string }[] };
  place_add_info?: { tags?: (string | { name?: string })[] };
}

/** 카카오맵 링크에서 장소 id 를 뽑는다. 링크를 주면 검색을 건너뛸 수 있다. */
function idFromUrl(u: string): string | null {
  return u.match(/place\.map\.kakao\.com\/(\d+)/)?.[1] ?? u.match(/\/place\/(\d+)/)?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ detail: "매장명 또는 카카오맵 링크가 필요합니다." }, { status: 400 });

  // 1) 장소 id — 링크면 바로, 아니면 검색
  let pid = idFromUrl(q);
  let matched: string | null = null;
  if (!pid) {
    const s = await getJson<Search>(
      `https://search.map.kakao.com/mapsearch/map.daum?q=${encodeURIComponent(q)}&msFlag=A&sort=0`,
      "https://map.kakao.com/"
    );
    const first = s?.place?.[0];
    if (!first?.confirmid) {
      return NextResponse.json(
        { detail: "카카오맵에서 못 찾았습니다. 지점명까지 넣거나 카카오맵 링크를 그대로 붙여 보세요.", query: q },
        { status: 404 }
      );
    }
    pid = first.confirmid;
    matched = first.name ?? null;
  }

  // 2) 상세 패널 — 메뉴·리뷰·영업시간·태그가 여기 다 있다
  const j = await getJson<Panel>(`https://place-api.map.kakao.com/places/panel3/${pid}`, "https://place.map.kakao.com/", { pf: "web" });
  if (!j) return NextResponse.json({ detail: "카카오맵 상세를 읽지 못했습니다. 잠시 뒤 다시 눌러 주세요." }, { status: 502 });

  const sum = j.summary ?? {};
  const rv = j.kakaomap_review ?? {};
  const ss = rv.score_set ?? {};
  const names = new Map((rv.strength_description ?? []).map((x) => [x.id, x.name]));

  const menus = (j.menu?.menus?.items ?? [])
    .map((m) => {
      let line = typeof m.price === "number" && m.price ? `${m.name ?? ""} ${m.price.toLocaleString()}원` : (m.name ?? "");
      const rr = m.recommend_reasons ?? [];
      if (rr.length) line += ` — ${rr.slice(0, 2).join(" / ")}`;
      else if (m.ai_mate_desc) line += ` — ${m.ai_mate_desc.slice(0, 60)}`;
      return line.trim();
    })
    .filter(Boolean)
    .slice(0, 20);

  let hours = "";
  try {
    const day = j.open_hours!.week_from_today!.week_periods![0].days![0].on_days!;
    hours = day.start_end_time_desc ?? "";
    if (day.break_times_desc?.length) hours += ` / ${day.break_times_desc.join(", ")}`;
  } catch {
    /* 영업시간이 없는 곳도 있다 — 지어내지 않는다 */
  }

  const reviews = (rv.reviews ?? [])
    .slice(0, 8)
    .map((c) => {
      const t = (c.contents ?? c.content ?? "").replace(/\n/g, " ").trim();
      return t ? `★${c.point ?? c.star_rating ?? ""} ${t.slice(0, 170)}` : "";
    })
    .filter(Boolean);

  return NextResponse.json({
    query: q,
    matched,
    pid,
    category: sum.category?.name ?? null,
    address: sum.address?.road ?? null,
    rating: ss.average_score ?? null,
    review_count: ss.review_count ?? null,
    photo_count: ss.photo_count ?? null,
    strength: (ss.strength_counts ?? []).map((x) => names.get(x.id) ?? x.id),
    hours,
    tags: (j.place_add_info?.tags ?? []).map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean),
    menus,
    reviews,
    blogs: (j.blog_review?.reviews ?? []).slice(0, 6).map((b) => b.title ?? "").filter(Boolean),
    roadview: sum.road_view?.url ?? null,
    source: "kakao",
  });
}
