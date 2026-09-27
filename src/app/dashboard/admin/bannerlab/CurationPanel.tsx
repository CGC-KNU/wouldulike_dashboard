"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import { PaidRestaurant } from "./typesWeekly";
import {
  CurationBanner,
  CurationTemplate,
  KIND_LABEL,
  RedoMode,
  SLOT_LABEL,
  SpecialDay,
  STATUS_STYLE,
  TrendPhrase,
  WEATHER_LABEL,
  WeekCuration,
} from "./typesCuration";

/**
 * 큐레이션 자동화 (2026-09-27) — 1주차(일반 배너)를 대체하는 새 흐름.
 *
 * 유료 식당마다 식당 정보 + 다음 주 요일·시간대·날씨·특정일로 AI 가 주제와 문구를 정하고,
 * 배너 스튜디오에서 저장한 "큐레이션 양식"에 문구만 바꿔 얹어 세로 배너(기획전 캐러셀)를
 * 만든다. 전주 금요일 20시에 식당 수만큼 슬랙으로 가고, 통과한 배너만 그 주에 걸린다.
 * 기존 배너 스튜디오 일괄 흐름은 그대로 남아 있고, 이 패널의 스위치로 주차마다 고른다.
 */

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function md(iso: string) {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

function sendTimeLabel(weekStart: string) {
  const monday = new Date(`${weekStart}T00:00:00+09:00`);
  const friday = new Date(monday.getTime() - 3 * 24 * 3600 * 1000);
  return `${friday.getMonth() + 1}/${friday.getDate()}(금) 20:00`;
}

function describeConditions(b: CurationBanner) {
  const c = b.conditions || {};
  const parts: string[] = [];
  if (c.dates?.length) parts.push(c.dates.map(md).join(", "));
  if (c.time_slots?.length) parts.push(c.time_slots.map((s) => SLOT_LABEL[s] ?? s).join("·"));
  if (c.weather) parts.push(`${WEATHER_LABEL[c.weather] ?? c.weather}만 (아닌 날은 대체안)`);
  return parts.length ? parts.join(" / ") : "주 내내";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `요청 실패 (${res.status})`);
  return data as T;
}

export default function CurationPanel({
  weekId,
  weekStart,
  restaurants,
}: {
  weekId: number;
  weekStart: string;
  /** 이번 주 대상 식당(체크된 식당) — 미리보기에 첫 식당 사진을 쓴다 */
  restaurants: PaidRestaurant[];
}) {
  const [data, setData] = useState<WeekCuration | null>(null);
  const [templates, setTemplates] = useState<CurationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<{ image: string; overflow: string[] } | null>(null);
  const [showDays, setShowDays] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([
        api<WeekCuration>(`/api/bannerlab/weekly/weeks/${weekId}/curation`),
        api<{ templates: CurationTemplate[] }>(`/api/bannerlab/curation/templates`),
      ]);
      setData(w);
      setTemplates(t.templates);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [weekId]);

  useEffect(() => {
    load();
  }, [load]);

  const inFlight = useMemo(
    () => (data?.banners ?? []).some((b) => b.status === "pending" || b.status === "generating"),
    [data]
  );

  // 만드는 중이면 5초마다 새로 고친다 — 백엔드가 백그라운드로 한 장씩 채운다.
  useEffect(() => {
    if (!inFlight && !polling) return;
    const t = setInterval(load, 5000);
    const stop = polling ? setTimeout(() => setPolling(false), 60_000) : undefined;
    return () => {
      clearInterval(t);
      if (stop) clearTimeout(stop);
    };
  }, [inFlight, polling, load]);

  async function patch(body: Record<string, unknown>) {
    setBusy("save");
    try {
      setData(await api<WeekCuration>(`/api/bannerlab/weekly/weeks/${weekId}/curation`, { method: "PATCH", body: JSON.stringify(body) }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function run(action: "generate" | "send-slack", body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      await api(`/api/bannerlab/weekly/weeks/${weekId}/curation/${action}`, { method: "POST", body: JSON.stringify(body) });
      setPolling(true);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function runPreview() {
    setBusy("preview");
    setPreview(null);
    try {
      const first = restaurants.find((r) => r.photos?.length || r.photo_url);
      const out = await api<{ image: string; overflow_tokens: string[] }>(`/api/bannerlab/curation/preview`, {
        method: "POST",
        body: JSON.stringify({ template_id: data?.template_id ?? undefined, restaurant_id: first?.restaurant_id }),
      });
      setPreview({ image: out.image, overflow: out.overflow_tokens });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p className="text-[11px] text-gray-400">큐레이션 설정을 불러오는 중…</p>;
  if (!data) return <p className="text-[11px] text-rose-500">{err || "큐레이션 설정을 불러오지 못했습니다."}</p>;

  const banners = data.banners;
  const counts = banners.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.status]: (acc[b.status] ?? 0) + 1 }), {});
  const ctx = data.context;

  return (
    <div className="border border-periwinkle/30 bg-periwinkle/5 rounded-xl p-3 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-bold text-navy">AI 큐레이션 자동화</span>
          <span className="text-[10px] text-gray-500 leading-relaxed">
            유료 식당마다 요일·시간대·날씨·특정일에 맞춰 AI가 주제와 문구를 정하고, 큐레이션 양식에 얹어 기획전 세로 배너로 만듭니다.
            {" "}
            <b>{sendTimeLabel(data.week_start)}</b>에 슬랙으로 식당 수만큼 발송되고, 통과한 배너만 이 주에 걸립니다.
          </span>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-navy shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={busy === "save"}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          사용
        </label>
      </div>

      {err && <p className="text-[10px] text-rose-500">{err}</p>}

      {data.enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[10px] text-gray-500">
              양식
              <select
                value={data.template_id ?? ""}
                onChange={(e) => patch({ template_id: e.target.value ? Number(e.target.value) : null })}
                className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white"
              >
                <option value="">기본 양식 (스튜디오 일반 배너 프리셋)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-gray-500">
              캐러셀에 한 번에 보여줄 장수 (0 = 전부, 요청마다 섞어서)
              <input
                type="number"
                min={0}
                max={30}
                value={data.max_items}
                onChange={(e) => setData({ ...data, max_items: Number(e.target.value) })}
                onBlur={(e) => patch({ max_items: Number(e.target.value) })}
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white w-24"
              />
            </label>
          </div>
          {data.template_id && templates.find((t) => t.id === data.template_id) && (
            <TemplateSettings
              key={data.template_id}
              template={templates.find((t) => t.id === data.template_id)!}
              onSaved={load}
              onDeleted={async () => {
                await patch({ template_id: null });
                load();
              }}
            />
          )}
          <p className="text-[10px] text-gray-400 leading-relaxed">
            양식은 아래 배너 스튜디오 → 일반 배너에서 텍스트 레이어에 <code>{"{{태그}}"}</code> <code>{"{{카피}}"}</code>{" "}
            <code>{"{{가게명}}"}</code> <code>{"{{혜택}}"}</code>을 넣고 &quot;큐레이션 양식으로 저장&quot;을 누르면 여기 목록에 생깁니다.
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={runPreview} disabled={!!busy} className="text-[10px] font-semibold text-gray-600 border border-gray-200 bg-white rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-30">
              {busy === "preview" ? "그리는 중…" : "양식 미리보기"}
            </button>
            <button onClick={() => run("generate")} disabled={!!busy} className="text-[10px] font-semibold text-periwinkle border border-periwinkle/30 bg-white rounded-lg px-2.5 py-1 hover:bg-periwinkle/5 disabled:opacity-30">
              {busy === "generate" ? "시작하는 중…" : "지금 만들기 (슬랙 발송 안 함)"}
            </button>
            <button
              onClick={() => {
                if (confirm("남은 배너를 만들고 바로 슬랙으로 보낼까요? (금요일 20시 자동 발송을 기다리지 않음)")) run("generate", { send_slack: true });
              }}
              disabled={!!busy}
              className="text-[10px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1 hover:bg-periwinkle disabled:opacity-30"
            >
              지금 만들고 슬랙 발송
            </button>
            {(counts.ready ?? 0) > 0 && (
              <button onClick={() => run("send-slack")} disabled={!!busy} className="text-[10px] font-semibold text-navy border border-navy/30 bg-white rounded-lg px-2.5 py-1 hover:bg-navy/5 disabled:opacity-30">
                만들어진 {counts.ready}건 슬랙 발송
              </button>
            )}
            {banners.some((b) => !b.slack_sent && (b.status === "ready" || b.status === "failed")) && (
              <button
                onClick={() => {
                  if (confirm("슬랙에 안 나간 배너를 처음부터 다시 만들까요?")) run("generate", { reset: true });
                }}
                disabled={!!busy}
                className="text-[10px] text-gray-400 underline underline-offset-2 disabled:opacity-30"
              >
                안 나간 것 전부 다시 만들기
              </button>
            )}
          </div>

          {preview && (
            <div className="flex items-start gap-2">
              <PreviewableImg src={preview.image} alt="양식 미리보기" className="w-40 rounded-lg border border-gray-100" />
              <div className="text-[10px] text-gray-500 leading-relaxed">
                예시 문구로 서버가 실제로 그린 결과예요.
                {preview.overflow.length > 0 && (
                  <p className="text-rose-500 mt-1">⚠️ {preview.overflow.join(", ")} 칸이 좁아 줄이 넘칩니다 — 레이어 폭을 넓혀 주세요.</p>
                )}
                <button onClick={() => setPreview(null)} className="block mt-1 text-gray-400 underline">닫기</button>
              </div>
            </div>
          )}

          {ctx && (
            <div className="bg-white rounded-lg border border-gray-100 px-2.5 py-2 text-[10px] text-gray-500 flex flex-col gap-1">
              <span className="font-semibold text-gray-600">
                {md(ctx.week_start)} ~ {md(ctx.week_end)} 컨텍스트 <span className="font-normal text-gray-400">({new Date(ctx.built_at).toLocaleString("ko-KR")} 기준)</span>
              </span>
              <span>특정일: {ctx.special_days.length ? ctx.special_days.map((s) => `${s.name} ${s.dates.map(md).join("·")}`).join(", ") : "없음"}</span>
              <span>
                날씨 전망:{" "}
                {!ctx.weather_available
                  ? "기상청 키(KMA_SERVICE_KEY) 미설정 — 날씨 주제 없이 진행"
                  : ctx.weather.length
                    ? ctx.weather.map((w) => `${md(w.date)} ${w.pop}%${w.flags.length ? `(${w.flags.map((f) => WEATHER_LABEL[f] ?? f).join(",")})` : ""}`).join(" · ")
                    : "예보 없음"}
              </span>
            </div>
          )}

          {banners.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1 text-[10px]">
                {Object.entries(counts).map(([s, n]) => (
                  <span key={s} className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[s as CurationBanner["status"]]}`}>
                    {banners.find((b) => b.status === s)?.status_label} {n}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {banners.map((b) => (
                  <BannerCard key={b.id} banner={b} onChanged={() => { setPolling(true); load(); }} />
                ))}
              </div>
            </>
          )}

          <button onClick={() => setShowDays((v) => !v)} className="self-start text-[10px] text-navy font-semibold underline underline-offset-2">
            {showDays ? "특정일 관리 닫기" : "특정일 관리 (명절·기념일·학사일정)"}
          </button>
          {showDays && <SpecialDaysEditor />}

          <button onClick={() => setShowTrends((v) => !v)} className="self-start text-[10px] text-navy font-semibold underline underline-offset-2">
            {showTrends ? "유행어 관리 닫기" : "유행어 관리 (인스타·SNS 말투·밈)"}
          </button>
          {showTrends && <TrendPhrasesEditor />}
        </>
      )}
    </div>
  );
}

function BannerCard({ banner: b, onChanged }: { banner: CurationBanner; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showFb, setShowFb] = useState(false);
  const working = b.status === "pending" || b.status === "generating";

  async function act(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await api(`/api/bannerlab/curation/banners/${b.id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const redo = (mode: RedoMode, extra: Record<string, unknown> = {}) => act("regenerate", { mode, ...extra });

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2 flex gap-2">
      <div className="w-24 shrink-0 flex flex-col gap-1">
        {b.image_url ? (
          <PreviewableImg src={b.image_url} alt={b.restaurant_name} className="w-24 rounded-md border border-gray-100" />
        ) : (
          <div className="w-24 aspect-[1080/1250] rounded-md bg-gray-50 flex items-center justify-center text-[9px] text-gray-400">
            {working ? "만드는 중…" : "이미지 없음"}
          </div>
        )}
        {b.fallback?.image_url && (
          <PreviewableImg src={b.fallback.image_url} alt="대체안" className="w-12 rounded border border-gray-100 opacity-80" />
        )}
      </div>
      <div className="flex flex-col gap-1 min-w-0 flex-1 text-[10px] text-gray-500">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-gray-700 truncate">{b.restaurant_name}</span>
          <span className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[b.status]}`}>{b.status_label}</span>
          {b.topic && <span className="px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">{KIND_LABEL[b.topic_kind]}</span>}
        </div>
        {b.topic && <span className="text-gray-600">{b.topic}</span>}
        {b.copy_text && (
          <span className="text-gray-700">
            <b>{b.tag_text}</b> · {b.copy_text.replace(/\n/g, " / ")}
          </span>
        )}
        {b.topic && <span>노출: {describeConditions(b)}</span>}
        {b.reason && <span className="text-gray-400">{b.reason}</span>}
        {b.ai_meta?.fallback_used && <span className="text-amber-600">⚠️ AI 문구가 검수를 통과 못 해 기본 문구 사용</span>}
        {b.ai_meta?.trend_used && <span className="text-fuchsia-600">✨ 유행어 · {b.ai_meta.trend_used}</span>}
        {(b.ai_meta?.photo_count ?? 3) < 3 && <span className="text-amber-600">⚠️ 등록 사진 {b.ai_meta?.photo_count ?? 0}장 (3장 이상 권장)</span>}
        {b.generation_error && <span className="text-rose-500">{b.generation_error}</span>}
        {b.approved_by && <span className="text-emerald-600">✅ {b.approved_by} 통과</span>}

        {!working && b.image_url && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {b.status !== "approved" && (
              <button onClick={() => act("approve")} disabled={busy} className="text-[10px] font-semibold text-white bg-emerald-500 rounded px-2 py-0.5 disabled:opacity-30">
                통과
              </button>
            )}
            <button onClick={() => redo("topic")} disabled={busy} className="text-[10px] border border-gray-200 rounded px-2 py-0.5 disabled:opacity-30">
              주제 바꾸기
            </button>
            <button onClick={() => redo("copy")} disabled={busy} className="text-[10px] border border-gray-200 rounded px-2 py-0.5 disabled:opacity-30">
              문구만
            </button>
            <button onClick={() => redo("photo")} disabled={busy} className="text-[10px] border border-gray-200 rounded px-2 py-0.5 disabled:opacity-30">
              사진 바꾸기
            </button>
            <button onClick={() => setShowFb((v) => !v)} disabled={busy} className="text-[10px] border border-gray-200 rounded px-2 py-0.5 disabled:opacity-30">
              피드백
            </button>
            {b.status !== "excluded" && (
              <button
                onClick={() => {
                  if (confirm(`${b.restaurant_name}을(를) 이번 주 제외할까요?`)) act("exclude");
                }}
                disabled={busy}
                className="text-[10px] text-rose-500 border border-rose-100 rounded px-2 py-0.5 disabled:opacity-30"
              >
                제외
              </button>
            )}
          </div>
        )}
        {!working && !b.image_url && b.status === "failed" && (
          <button onClick={() => redo("topic")} disabled={busy} className="self-start text-[10px] border border-gray-200 rounded px-2 py-0.5 disabled:opacity-30">
            다시 만들기
          </button>
        )}
        {showFb && (
          <div className="flex gap-1">
            <input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="예: 시험기간 느낌으로, 혜택을 강조해 주세요"
              className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-1"
            />
            <button
              onClick={() => {
                redo("feedback", { feedback });
                setShowFb(false);
                setFeedback("");
              }}
              disabled={busy || !feedback.trim()}
              className="text-[10px] font-semibold text-white bg-navy rounded px-2 disabled:opacity-30"
            >
              반영
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateSettings({
  template: t,
  onSaved,
  onDeleted,
}: {
  template: CurationTemplate;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [guide, setGuide] = useState(t.copy_guide);
  const [tagMax, setTagMax] = useState(t.tag_max_chars);
  const [lineMax, setLineMax] = useState(t.copy_max_chars_per_line);
  const [lines, setLines] = useState(t.copy_max_lines);
  const [trendMode, setTrendMode] = useState(t.trend_mode ?? "some");
  const [busy, setBusy] = useState(false);
  const dirty =
    guide !== t.copy_guide || tagMax !== t.tag_max_chars || lineMax !== t.copy_max_chars_per_line || lines !== t.copy_max_lines ||
    trendMode !== (t.trend_mode ?? "some");

  async function save() {
    setBusy(true);
    try {
      await api(`/api/bannerlab/curation/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ copy_guide: guide, tag_max_chars: tagMax, copy_max_chars_per_line: lineMax, copy_max_lines: lines, trend_mode: trendMode }),
      });
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`'${t.name}' 양식을 지울까요?`)) return;
    await fetch(`/api/bannerlab/curation/templates/${t.id}`, { method: "DELETE" });
    onDeleted();
  }

  const num = "text-[11px] border border-gray-200 rounded px-1.5 py-1 w-14 bg-white";
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2 flex flex-col gap-1.5 text-[10px] text-gray-500">
      <span>
        자리표시자: {t.tokens.length ? t.tokens.map((x) => `{{${x}}}`).join(" ") : "없음"}
      </span>
      <textarea
        value={guide}
        onChange={(e) => setGuide(e.target.value)}
        rows={2}
        placeholder="AI 말투 가이드 (예: 대학생 친구에게 말하듯 해요체, 명사형 마무리, 느낌표는 한 번까지)"
        className="text-[11px] border border-gray-200 rounded px-2 py-1 resize-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">태그 최대 <input type="number" min={4} max={30} value={tagMax} onChange={(e) => setTagMax(Number(e.target.value))} className={num} />자</label>
        <label className="flex items-center gap-1">카피 <input type="number" min={1} max={3} value={lines} onChange={(e) => setLines(Number(e.target.value))} className={num} />줄</label>
        <label className="flex items-center gap-1">한 줄 최대 <input type="number" min={4} max={30} value={lineMax} onChange={(e) => setLineMax(Number(e.target.value))} className={num} />자</label>
        <label className="flex items-center gap-1">
          유행어
          <select value={trendMode} onChange={(e) => setTrendMode(e.target.value as CurationTemplate["trend_mode"])} className="text-[11px] border border-gray-200 rounded px-1 py-1 bg-white">
            <option value="off">쓰지 않음</option>
            <option value="some">가끔 — 딱 맞을 때만, 주 20% 이내 (기본)</option>
            <option value="more">조금 더 — 주 35% 이내</option>
          </select>
        </label>
        <button onClick={save} disabled={busy || !dirty} className="font-semibold text-white bg-navy rounded px-2 py-1 disabled:opacity-30">저장</button>
        <button onClick={remove} className="text-gray-300 hover:text-rose-500 ml-auto">양식 삭제</button>
      </div>
    </div>
  );
}

const KIND_OPTIONS: { value: SpecialDay["kind"]; label: string }[] = [
  { value: "holiday", label: "공휴일·명절" },
  { value: "event", label: "기념일·이벤트" },
  { value: "academic", label: "학사일정" },
];

function SpecialDaysEditor() {
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [draft, setDraft] = useState({ date: "", end_date: "", name: "", kind: "event" as SpecialDay["kind"], hint: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDays((await api<{ special_days: SpecialDay[] }>(`/api/bannerlab/curation/special-days`)).special_days);
    } catch (e) {
      alert((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(id: number | null, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/api/bannerlab/curation/special-days${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (e) {
      alert((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: SpecialDay) {
    if (!confirm(`${d.name}을(를) 지울까요?`)) return;
    await fetch(`/api/bannerlab/curation/special-days/${d.id}`, { method: "DELETE" });
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2.5 flex flex-col gap-2 text-[10px]">
      <p className="text-gray-400 leading-relaxed">
        AI는 켜져 있는 특정일만 주제로 씁니다. 음력·학사일정처럼 해마다 바뀌는 날은 꺼진 채로 들어 있으니 날짜를 확인하고 켜 주세요.
      </p>
      <div className="flex flex-wrap gap-1 items-end">
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="border border-gray-200 rounded px-1 py-1" />
        <span className="text-gray-400">~</span>
        <input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} className="border border-gray-200 rounded px-1 py-1" title="기간이면 끝 날짜 (선택)" />
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="이름 (예: 중간고사)" className="border border-gray-200 rounded px-1.5 py-1 w-28" />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as SpecialDay["kind"] })} className="border border-gray-200 rounded px-1 py-1">
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <input value={draft.hint} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} placeholder="AI 참고 (예: 도서관 앞 카페 수요↑)" className="border border-gray-200 rounded px-1.5 py-1 flex-1 min-w-[140px]" />
        <button
          disabled={busy || !draft.date || !draft.name.trim()}
          onClick={async () => {
            if (await save(null, { ...draft, end_date: draft.end_date || null, active: true })) {
              setDraft({ date: "", end_date: "", name: "", kind: "event", hint: "" });
            }
          }}
          className="font-semibold text-white bg-navy rounded px-2 py-1 disabled:opacity-30"
        >
          추가
        </button>
      </div>
      <div className="flex flex-col divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {days.map((d) => (
          <div key={d.id} className={`flex items-center gap-2 py-1 ${(d.end_date ?? d.date) < today ? "opacity-40" : ""}`}>
            <input type="checkbox" checked={d.active} disabled={busy} onChange={(e) => save(d.id, { active: e.target.checked })} title="켜진 것만 AI가 씀" />
            <span className="w-28 shrink-0 text-gray-600">{d.date}{d.end_date ? ` ~ ${d.end_date.slice(5)}` : ""}</span>
            <span className="font-semibold text-gray-700 w-24 shrink-0 truncate">{d.name}</span>
            <span className="text-gray-400 truncate flex-1">{d.hint}</span>
            <button onClick={() => remove(d)} className="text-gray-300 hover:text-rose-500 shrink-0">삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 유행어 관리 — 매주 목요일 18시에 AI 가 웹을 검색해 요즘 인스타·SNS 표현을 근거 URL 과 함께
 * 자동으로 채운다(3주 뒤 만료, 다시 찾히면 연장). 사람은 이상한 걸 끄기만 하면 되고, 끈 건 다시
 * 켜지지 않는다. 직접 넣을 수도 있다. 문구에는 딱 맞을 때만, 한 주 20% 이내로 섞인다.
 */
function TrendPhrasesEditor() {
  const [rows, setRows] = useState<TrendPhrase[]>([]);
  const [draft, setDraft] = useState({ phrase: "", meaning: "", example: "", expires_on: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ trend_phrases: TrendPhrase[] }>(`/api/bannerlab/curation/trend-phrases`)).trend_phrases);
    } catch (e) {
      alert((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(id: number | null, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/api/bannerlab/curation/trend-phrases${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (e) {
      alert((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TrendPhrase) {
    if (!confirm(`'${t.phrase}'을(를) 지울까요?`)) return;
    await fetch(`/api/bannerlab/curation/trend-phrases/${t.id}`, { method: "DELETE" });
    load();
  }

  const [scouting, setScouting] = useState(false);

  async function scoutNow() {
    setScouting(true);
    try {
      await api(`/api/bannerlab/curation/trend-phrases/refresh`, { method: "POST", body: "{}" });
      alert("AI가 웹에서 요즘 유행어를 찾고 있어요. 1분쯤 뒤 목록이 채워지고 슬랙에도 올라옵니다.");
      setTimeout(load, 60_000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setScouting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2.5 flex flex-col gap-2 text-[10px]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-gray-400 leading-relaxed">
          <b>매주 목요일 18시</b>에 AI가 웹을 검색해 요즘 인스타·SNS 표현을 근거와 함께 자동으로 채웁니다(3주 뒤 만료). 이상한 표현은
          체크를 꺼 주세요 — 끈 표현은 다시 찾혀도 켜지지 않습니다. 문구에는 <b>딱 맞을 때만</b> 섞이고, 한 주 배너의 20% 이내 ·
          같은 표현은 한 번만 쓰입니다.
        </p>
        <button onClick={scoutNow} disabled={scouting} className="shrink-0 font-semibold text-periwinkle border border-periwinkle/30 rounded px-2 py-1 disabled:opacity-30">
          {scouting ? "요청 중…" : "AI로 지금 찾기"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1 items-end">
        <input value={draft.phrase} onChange={(e) => setDraft({ ...draft, phrase: e.target.value })} placeholder="유행어 (예: ~하는 사람 손)" maxLength={40} className="border border-gray-200 rounded px-1.5 py-1 w-36" />
        <input value={draft.meaning} onChange={(e) => setDraft({ ...draft, meaning: e.target.value })} placeholder="뜻·쓰는 상황" maxLength={200} className="border border-gray-200 rounded px-1.5 py-1 flex-1 min-w-[120px]" />
        <input value={draft.example} onChange={(e) => setDraft({ ...draft, example: e.target.value })} placeholder="예시 문장" maxLength={120} className="border border-gray-200 rounded px-1.5 py-1 flex-1 min-w-[120px]" />
        <input type="date" value={draft.expires_on} onChange={(e) => setDraft({ ...draft, expires_on: e.target.value })} title="만료일 (선택)" className="border border-gray-200 rounded px-1 py-1" />
        <button
          disabled={busy || !draft.phrase.trim()}
          onClick={async () => {
            if (await save(null, { ...draft, expires_on: draft.expires_on || null, active: true })) {
              setDraft({ phrase: "", meaning: "", example: "", expires_on: "" });
            }
          }}
          className="font-semibold text-white bg-navy rounded px-2 py-1 disabled:opacity-30"
        >
          추가
        </button>
      </div>
      {rows.length === 0 && <p className="text-gray-300">아직 유행어가 없어요 — 목요일에 자동으로 찾거나, &quot;AI로 지금 찾기&quot;를 눌러 보세요.</p>}
      <div className="flex flex-col divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {rows.map((t) => {
          const expired = !!t.expires_on && t.expires_on < today;
          return (
            <div key={t.id} className={`flex items-center gap-2 py-1 ${!t.active || expired ? "opacity-40" : ""}`}>
              <input type="checkbox" checked={t.active} disabled={busy} onChange={(e) => save(t.id, { active: e.target.checked })} title="켜진 것만 AI가 씀" />
              <span className={`shrink-0 px-1 rounded ${t.source === "ai" ? "bg-fuchsia-50 text-fuchsia-600" : "bg-gray-100 text-gray-500"}`}>
                {t.source === "ai" ? "AI" : "직접"}
              </span>
              <span className="font-semibold text-gray-700 w-28 shrink-0 truncate">{t.phrase}</span>
              <span className="text-gray-500 truncate flex-1">{t.meaning}{t.example ? ` · "${t.example}"` : ""}</span>
              {t.source_urls?.[0] && (
                <a href={t.source_urls[0]} target="_blank" rel="noreferrer" className="text-periwinkle underline shrink-0">근거</a>
              )}
              <span className="text-gray-400 shrink-0">{t.expires_on ? `~${t.expires_on.slice(5)}${expired ? " 만료" : ""}` : ""}</span>
              <button onClick={() => remove(t)} className="text-gray-300 hover:text-rose-500 shrink-0">삭제</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
