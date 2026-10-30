"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Card, Chip, Empty, FilterPills, Notice, PageHeader, Spinner, Textarea, agoLabel } from "../_shared/ui";

/**
 * 레퍼런스 (실험실) — 1030 민열님.
 *
 * 팀원이 계정을 넣지 않는다. 세틀라이트가 매일 새벽(05:40) 비슷한 유형의 F&B 매거진 · 큐레이션 계정을 찾아 모으고,
 * 요즘 뜨는 계정(왜 핫했나 · 착안점 · 특징)과 F&B 유행(늘어난 해시태그 · 우리 큐레이션에 쓰는 법)을 정리한다.
 * 「반응 좋았던 글」은 계정 평소(중앙값) 대비 배수, 「주제 추천」은 그 글들을 근거로 캐러셀 주제 5개(버튼).
 * 계산 · 저장은 백엔드 services/refs.py(AdminConfig papillon:ref*).
 */

interface RefPost { permalink: string; ts: string; kind: string; eng: number | null; ratio: number | null; rate: number | null; caption: string; tags?: string[] }
interface Metrics { eng_rate: number | null; posts_4w: number; hot_share: number; growth_7d: number | null; growth_28d: number | null; hot_score: number }
interface RefAccount { handle: string; name?: string; bio?: string; followers?: number; carousel_share?: number; likes_hidden?: boolean; error?: string; source?: string; first_seen?: string; metrics?: Metrics; posts: RefPost[] }
interface Trend { tag: string; posts: number; accounts: number; before: number; rise: number; avg_ratio: number | null; examples: { handle: string; permalink: string; ratio: number | null }[] }
interface Scan { scanned_at: string; by: string; added: string[]; accounts: RefAccount[]; trends: Trend[] }
interface Insight { made_at: string; accounts: { handle: string; type: string; why_hot: string; angle: string; features: string }[]; trends: { name: string; what: string; evidence: string; use: string }[] }
interface Idea { title: string; pattern: string; evidence: string; angle: string; for_us: string; slides: string; refs: { handle: string; permalink: string; ratio: number; kind: string }[] }
interface Ideas { made_at: string; by: string; focus: string; based_on: number; ideas: Idea[] }
interface Pool { count: number; probed: number; excluded: string[]; candidates_left: number }

type View = "accounts" | "trends" | "posts" | "ideas";
type Period = "14" | "30" | "60";
type Kind = "all" | "캐러셀" | "릴스" | "사진";

const nf = new Intl.NumberFormat("ko-KR");
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);

export default function RefLab() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [ideas, setIdeas] = useState<Ideas | null>(null);
  const [hotRatio, setHotRatio] = useState(1.3);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "scan" | "ideas" | "exclude">("");
  const [err, setErr] = useState("");
  const [view, setView] = useState<View>("accounts");
  const [focus, setFocus] = useState("");
  const [period, setPeriod] = useState<Period>("30");
  const [kind, setKind] = useState<Kind>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/satellite/refs", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setPool(d.pool); setScan(d.scan ?? null); setInsight(d.insight ?? null); setIdeas(d.ideas ?? null); setHotRatio(d.hot_ratio ?? 1.3);
    } catch (e) {
      setErr(`불러오지 못했습니다 — ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(k: "scan" | "ideas" | "exclude", url: string, body?: unknown) {
    setBusy(k); setErr("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      return d;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  }

  const ranked = useMemo(
    () => (scan?.accounts ?? []).filter((a) => !a.error && a.metrics).sort((x, y) => (y.metrics!.hot_score) - (x.metrics!.hot_score)),
    [scan],
  );
  const why = useMemo(() => new Map((insight?.accounts ?? []).map((x) => [x.handle, x])), [insight]);

  const posts = useMemo(() => {
    if (!scan) return [];
    const since = Date.now() - Number(period) * 86400000;
    const out: (RefPost & { handle: string })[] = [];
    for (const a of scan.accounts) for (const p of a.posts) {
      if (p.ratio === null || p.ratio < hotRatio || new Date(p.ts).getTime() < since) continue;
      if (kind !== "all" && p.kind !== kind) continue;
      out.push({ ...p, handle: a.handle });
    }
    return out.sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0)).slice(0, 40);
  }, [scan, period, kind, hotRatio]);

  if (loading) return <div className="py-16 flex justify-center"><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title="레퍼런스 (실험실)"
        description="세틀라이트가 매일 새벽 비슷한 유형의 F&B 매거진 · 큐레이션 계정을 찾아 모으고, 요즘 뜨는 계정과 F&B 유행을 정리합니다."
        actions={
          <Button variant="primary" disabled={!!busy} onClick={async () => { const d = await call("scan", "/api/satellite/refs/scan"); if (d) { setScan(d.scan); setInsight(d.insight); load(); } }}>
            {busy === "scan" ? "모으는 중… 1분쯤" : "지금 다시 모으기"}
          </Button>
        }
      >
        <p className="text-[12.5px] text-gray-500">
          {scan ? `마지막 갱신 ${agoLabel(scan.scanned_at)} (${scan.by})` : "아직 한 번도 모으지 않았습니다"}
          {pool && ` · 모은 계정 ${pool.count}곳 · 확인한 후보 ${pool.probed}개 · 남은 후보 ${pool.candidates_left}개`}
          {scan?.added?.length ? ` · 새로 찾음 ${scan.added.map((h) => `@${h}`).join(" ")}` : ""}
        </p>
      </PageHeader>

      {err && <div className="mb-4"><Notice tone="red" title="잘 안 됐습니다">{err}</Notice></div>}

      {!scan ? (
        <Card><Empty title="아직 모은 글이 없습니다" detail="매일 05:40 에 자동으로 모입니다. 지금 보려면 「지금 다시 모으기」를 눌러 주세요." /></Card>
      ) : (
        <>
          <div className="mb-4">
            <FilterPills<View>
              label="보기"
              value={view}
              onChange={setView}
              options={[
                { key: "accounts", label: "뜨는 계정", count: ranked.length },
                { key: "trends", label: "F&B 유행", count: scan.trends.length },
                { key: "posts", label: "반응 좋았던 글" },
                { key: "ideas", label: "주제 추천" },
              ]}
            />
          </div>

          {view === "accounts" && (
            <div className="grid gap-3 md:grid-cols-2">
              {ranked.map((a, i) => {
                const m = a.metrics!;
                const w = why.get(a.handle);
                const best = [...a.posts].filter((p) => p.ratio).sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0)).slice(0, 2);
                return (
                  <Card key={a.handle}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12px] text-gray-500 tabular-nums">{i + 1}위{a.source === "auto" && " · 자동으로 찾음"}</div>
                        <a href={`https://instagram.com/${a.handle}`} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-gray-900 hover:underline">@{a.handle}</a>
                        <span className="text-[13px] text-gray-500 ml-1.5">{a.name}</span>
                      </div>
                      <button type="button" disabled={busy === "exclude"} className="text-[12px] text-gray-400 hover:text-red-600 shrink-0"
                        onClick={async () => { if (await call("exclude", "/api/satellite/refs", { exclude: a.handle })) load(); }}>
                        이 계정 빼기
                      </button>
                    </div>
                    {w?.type && <div className="mt-1.5"><Chip tone="navy">{w.type}</Chip></div>}
                    <dl className="mt-2.5 grid grid-cols-4 gap-2 text-center">
                      <Stat label="팔로워" value={nf.format(a.followers ?? 0)} />
                      <Stat label="평소 반응률" value={m.eng_rate === null ? "—" : `${m.eng_rate}%`} />
                      <Stat label="4주 게시" value={`${m.posts_4w}편`} />
                      <Stat label="28일 성장" value={m.growth_28d === null ? "기록 중" : pct(m.growth_28d)} />
                    </dl>
                    {w ? (
                      <dl className="mt-3 grid gap-1.5 text-[13px] leading-relaxed">
                        <Row label="왜 핫했나" value={w.why_hot} />
                        <Row label="착안점" value={w.angle} />
                        <Row label="특징" value={w.features} />
                      </dl>
                    ) : (
                      <p className="mt-3 text-[12.5px] text-gray-500">분석은 다음 갱신 때 붙습니다(상위 8곳).</p>
                    )}
                    {best.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {best.map((p) => (
                          <a key={p.permalink} href={p.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center h-6 px-2 rounded-full bg-navy/[0.07] text-navy text-[12px] hover:underline">
                            {p.kind} · 평소의 {p.ratio}×
                          </a>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {view === "trends" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <Card title="F&B 유행 주제" description={insight ? `${agoLabel(insight.made_at)} 분석 · 아래 해시태그와 반응 좋았던 글 근거` : "다음 갱신 때 붙습니다."}>
                {!insight?.trends.length ? (
                  <p className="text-[13px] text-gray-500">아직 분석이 없습니다.</p>
                ) : (
                  <ol className="space-y-3">
                    {insight.trends.map((t, i) => (
                      <li key={i} className="rounded-[14px] border border-black/[0.07] p-3.5">
                        <h3 className="text-[15px] font-semibold text-gray-900">{t.name}</h3>
                        <dl className="mt-2 grid gap-1.5 text-[13px] leading-relaxed">
                          <Row label="무엇" value={t.what} />
                          <Row label="근거" value={t.evidence} />
                          <Row label="우리 큐레이션에" value={t.use} />
                        </dl>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              <Card title="최근 2주 늘어난 해시태그" description="두 곳 이상이 쓴 태그만 · 괄호는 그 전 2주 글 수" flush>
                {scan.trends.length === 0 ? (
                  <p className="px-4 py-8 text-[13px] text-gray-500">여러 계정에서 같이 늘어난 태그가 아직 없습니다.</p>
                ) : (
                  <ol className="divide-y divide-black/[0.06]">
                    {scan.trends.map((t) => (
                      <li key={t.tag} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                        <span className="font-semibold text-gray-900 min-w-0 truncate flex-1">#{t.tag}</span>
                        <span className="text-gray-500 tabular-nums whitespace-nowrap">{t.accounts}곳 · {t.posts}편({t.before})</span>
                        <span className="text-navy font-semibold tabular-nums w-14 text-right">{t.avg_ratio === null ? "—" : `${t.avg_ratio}×`}</span>
                        <a href={t.examples[0]?.permalink} target="_blank" rel="noreferrer" className="text-[12px] text-navy hover:underline">예시</a>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          )}

          {view === "posts" && (
            <Card title="평소보다 반응 좋았던 글" description={`좋아요 + 댓글이 그 계정 최근 25편 중앙값의 ${hotRatio}배 이상`} flush>
              <div className="px-4 pt-3 flex flex-wrap gap-2">
                <FilterPills<Period> label="기간" soft value={period} onChange={setPeriod} options={[{ key: "14", label: "2주" }, { key: "30", label: "한 달" }, { key: "60", label: "두 달" }]} />
                <FilterPills<Kind> label="유형" soft value={kind} onChange={setKind} options={[{ key: "all", label: "전체" }, { key: "캐러셀", label: "캐러셀" }, { key: "릴스", label: "릴스" }, { key: "사진", label: "사진" }]} />
              </div>
              {posts.length === 0 ? (
                <p className="px-4 py-8 text-[13px] text-gray-500">이 기간 · 유형에는 평소보다 눈에 띄게 반응이 좋았던 글이 없습니다.</p>
              ) : (
                <ol className="divide-y divide-black/[0.06]">
                  {posts.map((p) => (
                    <li key={p.permalink} className="px-4 py-3 flex gap-3">
                      <div className="w-14 shrink-0 text-right">
                        <div className="text-[18px] font-bold text-navy tabular-nums leading-none">{p.ratio}×</div>
                        <div className="text-[11px] text-gray-500 mt-1">평소 대비</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
                          <span className="font-semibold text-gray-800">@{p.handle}</span>
                          <Chip tone={p.kind === "캐러셀" ? "navy" : "gray"}>{p.kind}</Chip>
                          <span>{p.ts.slice(5, 10).replace("-", "/")}</span>
                          <span className="tabular-nums">반응 {nf.format(p.eng ?? 0)}{p.rate !== null && ` · 팔로워의 ${p.rate}%`}</span>
                        </div>
                        <p className="text-[13px] text-gray-800 mt-1 line-clamp-2">{p.caption || "(캡션 없음)"}</p>
                        <a href={p.permalink} target="_blank" rel="noreferrer" className="text-[12px] text-navy hover:underline">인스타에서 보기</a>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}

          {view === "ideas" && (
            <Card title="주제 추천" description={ideas ? `${agoLabel(ideas.made_at)} ${ideas.by} · 반응 좋았던 글 ${ideas.based_on}편 근거${ideas.focus ? ` · 방향 「${ideas.focus}」` : ""}` : "반응 좋았던 글을 근거로 캐러셀 주제 5개 · 착안점 · 우리식 변형 · 장 구성을 제안합니다."}>
              <div className="flex gap-2 mb-4">
                <Textarea rows={1} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="(선택) 보고 싶은 방향 — 예: 시험 기간, 혼밥, 11월 신메뉴" aria-label="추천 방향" />
                <Button variant="primary" className="shrink-0" disabled={!!busy} onClick={async () => { const d = await call("ideas", "/api/satellite/refs/ideas", { focus }); if (d) setIdeas(d.ideas); }}>
                  {busy === "ideas" ? "생각하는 중…" : "주제 추천 받기"}
                </Button>
              </div>
              {!ideas ? (
                <p className="text-[13px] text-gray-500">아직 받은 추천이 없습니다.</p>
              ) : (
                <ol className="space-y-3">
                  {ideas.ideas.map((it, i) => (
                    <li key={i} className="rounded-[14px] border border-black/[0.07] p-3.5">
                      <h3 className="text-[15px] font-semibold text-gray-900 text-balance">{i + 1}. {it.title}</h3>
                      <dl className="mt-2 grid gap-1.5 text-[13px] leading-relaxed">
                        <Row label="먹힌 이유" value={it.pattern} />
                        <Row label="근거" value={it.evidence} />
                        <Row label="착안점" value={it.angle} />
                        <Row label="우리식으로" value={it.for_us} />
                        <Row label="장 구성" value={it.slides} />
                      </dl>
                      {it.refs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {it.refs.map((r) => (
                            <a key={r.permalink} href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center h-6 px-2 rounded-full bg-navy/[0.07] text-navy text-[12px] hover:underline">
                              @{r.handle} · {r.ratio}×
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-black/[0.03] py-1.5">
      <dd className="text-[14px] font-semibold text-gray-900 tabular-nums">{value}</dd>
      <dt className="text-[11px] text-gray-500">{label}</dt>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}
