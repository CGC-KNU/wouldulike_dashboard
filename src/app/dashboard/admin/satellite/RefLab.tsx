"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Card, Chip, Empty, FilterPills, Input, Notice, PageHeader, Spinner, Textarea, agoLabel } from "../_shared/ui";

/**
 * 레퍼런스 (실험실) — 1030 민열님.
 *
 * 검색량으로 주제를 고르는 대신, 다른 음식 매거진이 최근 올린 글 중 **그 계정 평소보다 반응이 좋았던 글**을 보고 주제를 잡는다.
 * 1) 살펴볼 매거진 계정 목록(팀원 누구나 고침)  2) 「최근 글 모으기」 — 계정마다 최근 25편, 좋아요 + 댓글이 평소(중앙값)의 몇 배인지
 * 3) 「주제 추천 받기」 — 반응 좋았던 글을 근거로 주제 · 착안점 · 우리식 변형 · 캐러셀 장 구성 5개.
 * 모으기 · 추천은 버튼을 눌렀을 때만 돈다(인스타 호출 · AI 비용). 값은 백엔드 AdminConfig — services/refs.py.
 */

interface RefPost { permalink: string; ts: string; kind: string; likes: number | null; comments: number; eng: number | null; ratio: number | null; rate: number | null; caption: string }
interface RefAccount { handle: string; name?: string; followers?: number; median_eng?: number | null; likes_hidden?: boolean; error?: string; posts: RefPost[] }
interface Scan { scanned_at: string; by: string; accounts: RefAccount[] }
interface Idea { title: string; pattern: string; evidence: string; angle: string; for_us: string; slides: string; refs: { handle: string; permalink: string; ratio: number; kind: string }[] }
interface Ideas { made_at: string; by: string; focus: string; based_on: number; ideas: Idea[] }
interface Handle { handle: string; note: string }

type Period = "14" | "30" | "60";
type Kind = "all" | "캐러셀" | "릴스" | "사진";

const nf = new Intl.NumberFormat("ko-KR");

export default function RefLab() {
  const [handles, setHandles] = useState<Handle[]>([]);
  const [scan, setScan] = useState<Scan | null>(null);
  const [ideas, setIdeas] = useState<Ideas | null>(null);
  const [hotRatio, setHotRatio] = useState(1.3);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "scan" | "ideas" | "save">("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState("");
  const [period, setPeriod] = useState<Period>("30");
  const [kind, setKind] = useState<Kind>("all");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/satellite/refs", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setHandles(d.list?.handles ?? []);
      setScan(d.scan ?? null);
      setIdeas(d.ideas ?? null);
      setHotRatio(d.hot_ratio ?? 1.3);
      if (!(d.list?.handles ?? []).length) setEditing(true);
    } catch (e) {
      setErr(`불러오지 못했습니다 — ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(kindOf: "scan" | "ideas" | "save", url: string, method: string, body?: unknown) {
    setBusy(kindOf); setErr("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
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

  async function saveHandles(next: Handle[]) {
    const d = await call("save", "/api/satellite/refs", "PUT", { handles: next });
    if (d) setHandles(d.list.handles);
  }
  function addFromDraft() {
    const items = draft.split(/[\s,]+/).filter(Boolean).map((h) => ({ handle: h, note: "" }));
    if (!items.length) return;
    saveHandles([...handles, ...items]);
    setDraft("");
  }

  const posts = useMemo(() => {
    if (!scan) return [];
    const since = Date.now() - Number(period) * 86400000;
    const out: (RefPost & { handle: string; followers?: number })[] = [];
    for (const a of scan.accounts) for (const p of a.posts) {
      if (p.ratio === null || p.ratio < hotRatio) continue;
      if (new Date(p.ts).getTime() < since) continue;
      if (kind !== "all" && p.kind !== kind) continue;
      out.push({ ...p, handle: a.handle, followers: a.followers });
    }
    return out.sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0)).slice(0, 40);
  }, [scan, period, kind, hotRatio]);

  const failed = scan?.accounts.filter((a) => a.error) ?? [];
  const hidden = scan?.accounts.filter((a) => a.likes_hidden) ?? [];

  if (loading) return <div className="py-16 flex justify-center"><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title="레퍼런스 (실험실)"
        description="다른 음식 매거진이 최근 올린 글 중 그 계정 평소보다 반응이 좋았던 글을 모아, 다음 캐러셀 주제와 착안점을 잡습니다."
        actions={<>
          <Button onClick={() => setEditing((v) => !v)}>{editing ? "목록 닫기" : `살펴볼 계정 ${handles.length}`}</Button>
          <Button variant="primary" disabled={!handles.length || !!busy} onClick={async () => { const d = await call("scan", "/api/satellite/refs/scan", "POST"); if (d) setScan(d.scan); }}>
            {busy === "scan" ? "모으는 중… (계정당 1~2초)" : "최근 글 모으기"}
          </Button>
        </>}
      />

      {err && <div className="mb-4"><Notice tone="red" title="잘 안 됐습니다">{err}</Notice></div>}

      {editing && (
        <Card title="살펴볼 매거진 계정" description="인스타 비즈니스 · 크리에이터 계정만 볼 수 있습니다(개인 계정은 인스타가 막음). 최대 30개." className="mb-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {handles.length === 0 && <span className="text-[13px] text-gray-500">아직 없습니다. 아래에 계정 아이디를 넣어 주세요.</span>}
            {handles.map((h) => (
              <span key={h.handle} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-black/[0.05] text-[13px]">
                <a href={`https://instagram.com/${h.handle}`} target="_blank" rel="noreferrer" className="hover:underline">@{h.handle}</a>
                {h.note && <span className="text-gray-500">· {h.note}</span>}
                <button type="button" aria-label={`@${h.handle} 빼기`} className="w-6 h-6 rounded-full text-gray-500 hover:bg-black/[0.08]" onClick={() => saveHandles(handles.filter((x) => x.handle !== h.handle))}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFromDraft(); }} placeholder="계정 아이디 또는 인스타 주소 — 여러 개는 띄어쓰기로" aria-label="추가할 계정" />
            <Button onClick={addFromDraft} disabled={!draft.trim() || busy === "save"}>추가</Button>
          </div>
        </Card>
      )}

      {!scan ? (
        <Card><Empty title="아직 모은 글이 없습니다" detail={handles.length ? "「최근 글 모으기」를 누르면 계정마다 최근 25편을 가져옵니다." : "먼저 살펴볼 매거진 계정을 추가해 주세요."} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card
            title="평소보다 반응 좋았던 글"
            description={`좋아요 + 댓글이 그 계정 최근 25편 중앙값의 ${hotRatio}배 이상 · ${agoLabel(scan.scanned_at)} ${scan.by} 모음`}
            flush
          >
            <div className="px-4 pt-3 flex flex-wrap gap-2">
              <FilterPills<Period> options={[{ key: "14", label: "2주" }, { key: "30", label: "한 달" }, { key: "60", label: "두 달" }]} value={period} onChange={setPeriod} label="기간" soft />
              <FilterPills<Kind> options={[{ key: "all", label: "전체" }, { key: "캐러셀", label: "캐러셀" }, { key: "릴스", label: "릴스" }, { key: "사진", label: "사진" }]} value={kind} onChange={setKind} label="유형" soft />
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
            {(failed.length > 0 || hidden.length > 0) && (
              <div className="px-4 py-3 border-t border-black/[0.06] text-[12px] text-gray-500 space-y-1">
                {failed.map((a) => <div key={a.handle}>@{a.handle} — {a.error}</div>)}
                {hidden.map((a) => <div key={a.handle}>@{a.handle} — 좋아요를 숨긴 계정이라 비교에서 뺐습니다.</div>)}
              </div>
            )}
          </Card>

          <Card
            title="주제 추천"
            description={ideas ? `${agoLabel(ideas.made_at)} ${ideas.by} · 반응 좋았던 글 ${ideas.based_on}편 근거${ideas.focus ? ` · 방향 「${ideas.focus}」` : ""}` : "반응 좋았던 글을 근거로 주제 5개 · 착안점 · 우리식 변형 · 장 구성을 제안합니다."}
          >
            <div className="flex gap-2 mb-4">
              <Textarea rows={1} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="(선택) 보고 싶은 방향 — 예: 시험 기간, 혼밥, 11월 신메뉴" aria-label="추천 방향" />
              <Button variant="primary" className="shrink-0" disabled={!!busy} onClick={async () => { const d = await call("ideas", "/api/satellite/refs/ideas", "POST", { focus }); if (d) setIdeas(d.ideas); }}>
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
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}
