import { cookies } from "next/headers";
import { IconBrandInstagram } from "@tabler/icons-react";
import type { PartnerHomeData } from "../PartnerHome";
import { FORMAT_LABEL, postNote, postStats, scheduleRows } from "@/lib/owner/contentPosts";

/**
 * 콘텐츠 — 우리 매장이 나온 게시물 (파트너 뷰 탭, 민열님 0919).
 * 원자료는 홈과 같은 한 벌. 여기서는 콘텐츠와 캠페인만 추려 시간순으로 보여 준다.
 *
 * 1124: 위에 「게시물별 성과」(metrics.promotion.posts) — 게시된 글마다 인스타 최신 숫자.
 * 홈의 「홍보 게시물 도달·조회」 합계와 같은 게시물 묶음이다(보낸 리포트 · 명시 연결 · 제목 대조).
 * 아래 목록은 예정·캠페인, 그리고 위에 안 잡힌 게시된 글만 남긴다.
 */
export default async function OwnerContentPage({ searchParams }: { searchParams: Promise<{ rid?: string }> }) {
  const { rid } = await searchParams;
  const token = (await cookies()).get("access_token")?.value ?? "";
  let data: PartnerHomeData | null = null;
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/astro/partner/home/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    // 0925: 파싱이 실패하면 **null 이어야 한다.** `{}` 는 참이라 화면이 '읽었다'고 믿고 store.name 에서 터진다.
    if (res.ok) data = (await res.json().catch(() => null)) as PartnerHomeData | null;
  } catch { data = null; }

  const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const failed = data === null;
  const posts = data?.metrics?.promotion?.posts;
  const rows = scheduleRows(data?.feed ?? [], posts ?? []);
  const label: Record<string, string> = { published: "게시됨", scheduled: "예정", failed: "실패", done: "지남", active: "진행 중" };
  const chip: Record<string, string> = { published: "bg-emerald-50 text-emerald-700", scheduled: "bg-navy/[0.07] text-navy", failed: "bg-red-50 text-red-600", done: "bg-gray-100 text-gray-500", active: "bg-amber-50 text-amber-800" };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-5 pb-8">
      <h1 className="text-[18px] font-bold text-gray-900">콘텐츠</h1>
      <p className="text-[12.5px] text-gray-500 mt-1 mb-4">{data ? `${data.store.name}이 나온 게시물과, 손님을 보내는 캠페인 주간입니다. 최근 30일과 앞으로 30일.` : "불러오지 못했습니다."}</p>
      {/* 0924: 못 읽었을 때도 "아직 없습니다" 가 떴다. 위에서는 못 읽었다고 하고 아래에서는
          없다고 하니 서로 반대말이었다. 없는 것과 못 읽은 것은 다르다. */}
      {failed ? (
        <div className="bg-white rounded-[18px] border border-gray-200 p-5 text-center">
          <p className="text-[13px] font-semibold text-gray-700">지금 불러오지 못했습니다</p>
          <p className="text-[12px] text-gray-400 mt-1">게시물이 없는 것이 아니라 읽지 못한 것입니다. 잠시 뒤 다시 열어 주세요.</p>
        </div>
      ) : (<>
      {posts && posts.length > 0 && (
        <section aria-label="게시물별 성과" className="mb-5">
          <h2 className="text-[14px] font-bold text-gray-900 mb-2">게시물별 성과</h2>
          <ul className="space-y-2.5">
            {posts.map((p, i) => (
              <li key={p.permalink ?? `${p.posted_at}-${i}`} className="bg-white rounded-[18px] border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-gray-400 tabular-nums">{md(p.posted_at)} · {FORMAT_LABEL[p.format] ?? "게시물"}
                      {p.report_sent && <span className="ml-1.5 text-[11.5px] font-semibold px-1.5 py-0.5 rounded-full bg-navy/[0.07] text-navy">리포트 보냄</span>}
                    </span>
                    <span className="block text-[13.5px] font-medium text-gray-900 mt-0.5">{p.title}</span>
                  </span>
                  {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-navy text-white text-[12px] font-semibold"><IconBrandInstagram size={14} aria-hidden="true" />보기</a>}
                </div>
                {postStats(p).length > 0 && (
                  <dl className="grid grid-cols-3 gap-1.5 mt-3 text-center">
                    {postStats(p).map((s) => (
                      <div key={s.label} className="rounded-xl bg-navy/[0.04] py-2"><dt className="text-[12px] text-gray-500">{s.label}</dt><dd className="text-[16px] font-bold text-gray-900 tabular-nums">{s.value}</dd></div>
                    ))}
                  </dl>
                )}
                <p className="text-[11.5px] text-gray-400 mt-2">{postNote(p)}</p>
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-gray-400 mt-2 leading-relaxed">숫자는 인스타그램이 주는 게시물 전체의 최신 누적값입니다. 여러 매장이 함께 나온 게시물은 그 매장들이 같은 숫자를 봅니다.</p>
        </section>
      )}
      {rows.length === 0 && posts && posts.length > 0 ? null : rows.length === 0 ? (
        <div className="bg-white rounded-[18px] border border-gray-200 p-5 text-center">
          <p className="text-[13px] font-semibold text-gray-700">아직 올라간 게시물이 없습니다</p>
          <p className="text-[12px] text-gray-400 mt-1">제작이 잡히면 예정일부터 여기에 보입니다. 우주라이크 인스타그램은 <a href="https://www.instagram.com/w_ouldulike/" target="_blank" rel="noreferrer" className="text-navy font-semibold">@w_ouldulike</a></p>
        </div>
      ) : (<>
        {posts && posts.length > 0 && <h2 className="text-[14px] font-bold text-gray-900 mb-2">일정 · 캠페인</h2>}
        <ul className="bg-white rounded-[18px] border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {rows.map((f, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="w-[74px] shrink-0 text-[11.5px] font-bold text-gray-500 tabular-nums">{md(f.date)}{f.end ? `~${md(f.end)}` : ""}</span>
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium text-gray-900">{f.title}</span><span className="block text-[12px] text-gray-400">{f.kind === "campaign" ? "앱 캠페인 주간" : "인스타그램 콘텐츠"}</span></span>
              <span className={`shrink-0 text-[11.5px] font-semibold px-1.5 py-0.5 rounded-full ${chip[f.state]}`}>{label[f.state]}</span>
              {f.permalink && <a href={f.permalink} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-navy text-white text-[12px] font-semibold"><IconBrandInstagram size={14} aria-hidden="true" />보기</a>}
            </li>
          ))}
        </ul>
      </>)}
      </>)}
    </div>
  );
}
