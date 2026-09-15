import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { readDraft } from "@/lib/draft/store";
import { METRIC_LABEL, TILE_KEYS, approx, comparable } from "@/lib/draft/report";
import type { ReportMetric, StoreReport } from "@/lib/draft/types";
import ViewBeacon from "./ViewBeacon";
import DownloadBar from "./DownloadBar";

/**
 * 점주가 카톡으로 받아 여는 **매장 리포트** — 로그인 없음.
 *
 * 애딧 캠페인 성과 리포트의 뼈대를 그대로 빌렸다: 상단 바 → 제목 → 게시물 카드 → 성과 6타일 → 비교 막대 + 한 문장 해석 + 근거 줄
 * → (우리 것) 같은 기간 앱에서 일어난 일 → 다음 제안 → 푸터. 1열 520px, 12px 라벨 / 26px 숫자, 네이비 한 색.
 *
 * 그리는 값은 전부 스냅샷이다(라이브 조회 없음 — 인증도 없고 수치도 변한다). 못 읽은 값은 '—'.
 * 발행(SENT)된 리포트만 열린다. 초안·승인 상태는 로그인한 담당자만 미리보기로 본다.
 */

const seed = (): StoreReport[] => [];

async function load(token: string): Promise<{ r: StoreReport; preview: boolean } | null> {
  if (!/^[0-9a-f]{40}$/.test(token)) {
    // 초안 미리보기: /r/preview-<id> — 담당자 쿠키가 있을 때만
    if (token.startsWith("preview-")) {
      const has = (await cookies()).get("access_token")?.value;
      if (!has) return null;
      const r = readDraft<StoreReport[]>("probe_reports", seed).find((x) => x.id === token.slice(8));
      return r ? { r, preview: true } : null;
    }
    return null;
  }
  const r = readDraft<StoreReport[]>("probe_reports", seed).find((x) => x.token === token);
  if (!r) return null;
  if (r.status === "REVOKED") return { r, preview: false };
  if (r.status !== "LINKED" && r.status !== "SENT") return null;
  return { r, preview: false };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const hit = await load(token);
  if (!hit || hit.r.status === "REVOKED") return { title: { absolute: "우주라이크 매장 리포트" } };
  const { r } = hit;
  return {
    title: { absolute: `${r.snapshot.store.name} · 우주라이크 매장 리포트` },
    description: r.summary,
    // 카톡 미리보기: 매장 제공 사진(게시물 커버)만. 없으면 앱 아이콘.
    openGraph: { title: `${r.snapshot.store.name} 인스타그램 홍보 성과`, description: r.summary, images: [r.snapshot.post.cover_url ?? "/brand/appicon.png"], type: "article" },
  };
}

const fmtDT = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\. /g, ".").replace(/\.$/, "");
const fmtD = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "");

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hit = await load(token);
  if (!hit) notFound();
  const { r, preview } = hit;
  const s = r.snapshot;

  if (r.status === "REVOKED") {
    return (
      <Frame>
        <div className="bg-white rounded-2xl border border-black/[0.06] px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-gray-900">이 리포트는 더 이상 공개되지 않습니다.</p>
          <p className="text-[13px] text-gray-500 mt-2">새 리포트를 받으셨다면 그 링크로 열어 주세요.</p>
        </div>
      </Frame>
    );
  }

  const tiles = TILE_KEYS.map((k) => s.metrics.find((m) => m.key === k) ?? null);
  const compared = ["reach", "saved"].map((k) => s.metrics.find((m) => m.key === k)).filter((m): m is ReportMetric => Boolean(m && comparable(m)));
  const proposals = r.proposals.filter((p) => p.approved);
  const appVisible = s.app && (s.app.coupon_redeemed + s.app.stamp_earned + s.app.revisit + s.app.loyal_total > 0);
  const posted = s.post.posted_at ? fmtD(s.post.posted_at) : null;

  const fname = `${s.store.name}_매장리포트_${s.as_of.slice(0, 10).replace(/-/g, "")}`;

  return (
    <Frame preview={preview} download={preview ? fname : undefined}>
      {!preview && r.token && <ViewBeacon token={r.token} />}

      <header className="mb-4">
        <h1 className="text-[18px] font-bold tracking-[-0.01em] leading-snug">{r.title}</h1>
        <p className="text-[12px] text-gray-500 mt-1">{[posted && `${posted.slice(0, 7).replace(".", "년 ").replace(/^(\d{4})년 0?(\d+)$/, "$1년 $2월")}`, "@w_ouldulike", `'${s.post.topic}'`].filter(Boolean).join(" · ")}</p>
      </header>

      {/* 게시물 카드 */}
      <section className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="/brand/appicon.png" alt="" width={36} height={36} className="w-9 h-9 rounded-full" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">우주라이크 · @w_ouldulike</p>
            <p className="text-[11px] text-gray-500">{posted ? `${posted} 게시` : "게시일 미확인"}{s.post.co_stores > 1 ? ` · ${s.post.co_stores}곳 함께 소개` : ""}</p>
          </div>
        </div>
        {s.post.cover_url ? <img src={s.post.cover_url} alt={`'${s.post.topic}' 게시물`} className="w-full aspect-[4/5] object-cover bg-gray-100" /> : <div className="w-full h-24 bg-[linear-gradient(160deg,#eef0ff,#f7f7fa)] flex items-center justify-center text-[12px] text-gray-400">게시물 이미지는 Instagram 에서 확인해 주세요</div>}
        <div className="px-4 py-3">
          {s.post.caption && <p className="text-[13px] text-gray-800 leading-relaxed line-clamp-4 whitespace-pre-line">{s.post.caption}</p>}
          {s.post.permalink && <a href={s.post.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center mt-2 text-[13px] font-semibold text-navy">Instagram에서 보기 →</a>}
        </div>
      </section>

      {/* 성과 6타일 */}
      <Section title="게시물 성과">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((m, i) => (
            <div key={TILE_KEYS[i]} className="bg-white rounded-xl border border-black/[0.06] px-2 py-3 text-center">
              <p className="text-[11px] text-gray-500">{METRIC_LABEL[TILE_KEYS[i]]}</p>
              <p className={`text-[22px] font-bold tabular-nums tracking-[-0.01em] leading-tight mt-0.5 ${m ? "text-gray-900" : "text-gray-300"}`}>{m ? m.value.toLocaleString() : "—"}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-2">{fmtDT(s.as_of)} 기준 수치입니다.{s.collecting ? " 아직 수집 중이라 더 오를 수 있습니다." : ""}</p>
      </Section>

      {/* 비교 — 우리 채널 평소 게시물 */}
      <Section title="평소 게시물과 비교">
        {compared.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/[0.06] px-4 py-4 text-[13px] text-gray-600">비교 기준(우리 채널 평소 게시물 5건 이상)이 아직 없어 수치만 드립니다. 다음 리포트부터 비교를 붙입니다.</div>
        ) : (
          <div className="space-y-2">
            {compared.map((m) => {
              const max = Math.max(m.value, m.p90 ?? 0, m.median ?? 0) || 1;
              const bar = (v: number) => `${Math.max(2, Math.round((v / max) * 100))}%`;
              return (
                <div key={m.key} className="bg-white rounded-xl border border-black/[0.06] px-4 py-3">
                  <div className="flex items-baseline justify-between"><span className="text-[12px] font-semibold text-gray-700">{METRIC_LABEL[m.key]}</span><span className="text-[11px] text-gray-400">우리 채널 평소 게시물 {m.n}건</span></div>
                  <Row label="이번 게시물" v={m.value.toLocaleString()} w={bar(m.value)} strong />
                  <Row label="평소 중앙값" v={approx(m.median as number)} w={bar(m.median as number)} />
                  {m.p10 !== null && m.p90 !== null && <Row label="평소 범위" v={`${approx(m.p10).replace("약 ", "")}~${approx(m.p90)}`} w={bar(m.p90)} range={bar(m.p10)} />}
                  <p className="text-[13px] text-gray-800 mt-2 leading-relaxed">{r.interpretation.find((t) => t.startsWith(METRIC_LABEL[m.key])) ?? ""}</p>
                </div>
              );
            })}
            <p className="text-[11px] text-gray-500">근거: {fmtDT(s.as_of)} 기준 인스타그램 인사이트{s.cohort_note ? `, ${s.cohort_note}` : ""}. 다른 매장과 비교하지 않습니다.</p>
          </div>
        )}
      </Section>

      {/* 앱에서 일어난 일 — 인과 주장 없음, 전부 0이면 숨김 */}
      {appVisible && s.app && (
        <Section title="같은 달 앱에서 일어난 일">
          <div className="grid grid-cols-4 gap-1.5">
            {[["쿠폰 사용", s.app.coupon_redeemed], ["스탬프 적립", s.app.stamp_earned], ["재방문", s.app.revisit], ["단골 누적", s.app.loyal_total]].map(([l, v]) => (
              <div key={l as string} className="bg-white rounded-xl border border-black/[0.06] px-1.5 py-2.5 text-center"><p className="text-[10px] text-gray-500">{l}</p><p className="text-[17px] font-bold tabular-nums leading-tight mt-0.5">{(v as number).toLocaleString()}</p></div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">{s.app.month.replace("-", "년 ").replace(/년 0?/, "년 ")}월 우주라이크 앱 기준. 게시물과 직접 연결된 수치는 아니고, 같은 기간에 일어난 일입니다.</p>
        </Section>
      )}

      {/* 다음 제안 — 사람이 승인한 것만 */}
      {proposals.length > 0 && (
        <Section title="다음 제안">
          <ol className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.05]">
            {proposals.map((p, i) => (
              <li key={p.rule} className="flex gap-3 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-navy text-white text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div><p className="text-[13px] font-semibold">{p.title}</p><p className="text-[13px] text-gray-700 leading-relaxed mt-0.5">{p.text}</p></div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <footer className="text-center text-[11px] text-gray-400 mt-8 leading-relaxed">우주라이크 제휴팀 · @w_ouldulike · 문의는 카카오톡 채널로<br />이 페이지를 열어 본 횟수는 저희 쪽에 자동으로 기록됩니다 (누가 열었는지는 알 수 없습니다).</footer>
    </Frame>
  );
}

function Frame({ children, preview, download }: { children: React.ReactNode; preview?: boolean; download?: string }) {
  return (
    <>
      {/* 인쇄(PDF 저장): 상단 바·버튼줄 숨김, 배경색 유지, 한 열 그대로 */}
      <style>{`@media print{html,body{background:#fff!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}main{padding-top:0!important;padding-bottom:0!important}section{break-inside:avoid}}@page{size:A4;margin:12mm}`}</style>
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-black/[0.06] print:hidden">
        <div className="max-w-[520px] mx-auto px-4 h-12 flex items-center gap-2">
          <span role="img" aria-label="우주라이크" className="block h-[15px] w-[86px] bg-navy" style={{ WebkitMaskImage: "url(/brand/wordmark.png)", maskImage: "url(/brand/wordmark.png)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }} />
          <span className="text-[13px] text-gray-500">매장 리포트</span>
          {preview && <span className="ml-auto text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">미리보기 · 아직 발행 전</span>}
        </div>
      </div>
      {download && <DownloadBar filename={download} />}
      <main className="max-w-[520px] mx-auto px-4 pt-5 pb-12">{children}</main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5"><h2 className="text-[12px] font-semibold text-gray-500 mb-2">{title}</h2>{children}</section>;
}

function Row({ label, v, w, range, strong }: { label: string; v: string; w: string; range?: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 mt-2 text-[12px]">
      <span className={`w-[72px] shrink-0 ${strong ? "font-semibold text-gray-900" : "text-gray-500"}`}>{label}</span>
      <span className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden relative">
        {range ? <span className="absolute top-0 bottom-0 bg-gray-300 rounded-full" style={{ left: range, width: `calc(${w} - ${range})` }} /> : <span className={`block h-full rounded-full ${strong ? "bg-navy" : "bg-gray-300"}`} style={{ width: w }} />}
      </span>
      <span className={`w-[92px] text-right tabular-nums ${strong ? "font-bold text-navy" : "text-gray-600"}`}>{v}</span>
    </div>
  );
}
