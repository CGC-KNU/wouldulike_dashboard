"use client";

import { useEffect, useState } from "react";
import { Button, Chip, Field, Input, Notice, SlideOver, Textarea } from "../_shared/ui";

/**
 * Probe · 설문 조사 — 설문 내용 고치기 / 새 설문 만들기 (SurveyOps 에서 SlideOver 로 연다).
 *
 * 규칙은 백엔드(surveys/editor.py)가 지킨다. 여기서는 같은 규칙을 미리 보여 줄 뿐이다.
 *  - 문구(질문 · 선택지)는 언제든 고칠 수 있다. 문항 내용이 바뀌면 version 이 올라 이전 응답과 집계가 나뉜다.
 *  - 이미 답이 있는 문항 · 선택지는 지울 수 없다.
 *  - 새 문항 · 선택지의 코드(code · value)는 비워 두면 서버가 정한다.
 *  - 한 설문에 문항 1~10개, 문항마다 선택지 2~8개, 단일 선택.
 */

export interface OptionEdit { label: string; value?: string; answers?: number }
export interface QuestionEdit { code?: string; badge: string; text: string; required: boolean; answers?: number; options: OptionEdit[] }
export interface SurveyContent {
  code: string; title: string; headline: string; description: string;
  promo: Record<string, string>; exclude_campuses: string[];
  reward_coupon_type_code: string; version: number; questions: QuestionEdit[];
}

const emptyQuestion = (): QuestionEdit => ({ badge: "", text: "", required: true, options: [{ label: "" }, { label: "" }] });
const splitCampuses = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

async function send<T>(method: string, body: unknown): Promise<{ ok: boolean; data: T & { detail?: string } }> {
  const r = await fetch("/api/probe/surveys/content", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

/* ─── 문항 편집기 ─── */
function QuestionsEditor({ value, onChange }: { value: QuestionEdit[]; onChange: (q: QuestionEdit[]) => void }) {
  const setQ = (i: number, patch: Partial<QuestionEdit>) => onChange(value.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {value.map((q, i) => {
        const locked = (q.answers ?? 0) > 0;
        return (
          <div key={q.code ?? `new-${i}`} className="rounded-[14px] border border-black/[0.07] p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-gray-900">문항 {i + 1}</span>
              {q.code && <span className="text-[11px] text-gray-400">{q.code}</span>}
              {locked && <Chip tone="amber">답 {q.answers}건 · 삭제 불가</Chip>}
              <span className="ml-auto flex gap-1">
                <Button size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</Button>
                <Button size="sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="아래로">↓</Button>
                <Button size="sm" onClick={() => onChange(value.filter((_, k) => k !== i))} disabled={locked || value.length <= 1}>삭제</Button>
              </span>
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Input placeholder="표지" maxLength={20} value={q.badge} onChange={(e) => setQ(i, { badge: e.target.value })} aria-label="표지" />
              <Textarea rows={2} maxLength={200} placeholder="질문 (줄바꿈 가능)" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} aria-label="질문" />
            </div>
            <ul className="space-y-1.5">
              {q.options.map((o, k) => {
                const optLocked = (o.answers ?? 0) > 0;
                return (
                  <li key={o.value ?? `n-${k}`} className="flex items-center gap-2">
                    <span className="w-4 text-[11px] text-gray-400 tabular-nums">{k + 1}</span>
                    <Input placeholder="선택지" maxLength={60} value={o.label} aria-label={`선택지 ${k + 1}`}
                      onChange={(e) => setQ(i, { options: q.options.map((x, n) => (n === k ? { ...x, label: e.target.value } : x)) })} />
                    {optLocked && <span className="text-[11px] text-amber-700 whitespace-nowrap">{o.answers}건</span>}
                    <Button size="sm" disabled={optLocked || q.options.length <= 2} aria-label="선택지 삭제"
                      onClick={() => setQ(i, { options: q.options.filter((_, n) => n !== k) })}>×</Button>
                  </li>
                );
              })}
            </ul>
            {q.options.length < 8 && (
              <Button size="sm" variant="ghost" onClick={() => setQ(i, { options: [...q.options, { label: "" }] })}>+ 선택지 추가</Button>
            )}
          </div>
        );
      })}
      {value.length < 10 && <Button onClick={() => onChange([...value, emptyQuestion()])}>+ 문항 추가</Button>}
    </div>
  );
}

/* ─── 내용 고치기 ─── */
export function SurveyEditSlideOver({ code, open, onClose, onSaved }: {
  code: string | null; open: boolean; onClose: () => void; onSaved: (note: string) => void;
}) {
  const [form, setForm] = useState<SurveyContent | null>(null);
  const [campuses, setCampuses] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !code) return;
    setForm(null); setErr(null);
    void (async () => {
      const r = await fetch(`/api/probe/surveys/content?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.detail ?? `응답 ${r.status}`); return; }
      const c = j.content as SurveyContent;
      setForm(c); setCampuses(c.exclude_campuses.join(", "));
    })();
  }, [open, code]);

  const hasAnswers = !!form?.questions.some((q) => (q.answers ?? 0) > 0);
  const promo = (k: string) => form?.promo?.[k] ?? "";

  async function save() {
    if (!form || saving) return;
    setSaving(true); setErr(null);
    const { ok, data } = await send<{ version_bumped: boolean }>("PATCH", {
      code: form.code, title: form.title, headline: form.headline, description: form.description,
      promo: form.promo, exclude_campuses: splitCampuses(campuses), questions: form.questions,
    });
    setSaving(false);
    if (!ok) { setErr(data.detail ?? "저장하지 못했습니다."); return; }
    onSaved(data.version_bumped ? "저장했습니다 — 문항이 바뀌어 판(version)이 올라갔습니다" : "저장했습니다");
    onClose();
  }

  return (
    <SlideOver open={open} onClose={onClose} width="lg" title="설문 내용 고치기" subtitle={form ? `${form.code} · v${form.version}` : code ?? undefined}
      footer={<><Button variant="primary" onClick={save} disabled={!form || saving}>{saving ? "저장 중…" : "저장"}</Button><Button onClick={onClose}>닫기</Button></>}>
      {err && <Notice tone="red" title="확인해 주세요">{err}</Notice>}
      {!form && !err && <p className="text-[13px] text-gray-500">불러오는 중…</p>}
      {form && (
        <>
          {hasAnswers && (
            <Notice tone="amber" title="이미 응답이 있습니다">
              문구는 고칠 수 있고, 답이 있는 문항 · 선택지는 지울 수 없습니다. 문항이 바뀌면 판(version)이 올라가 이전 응답과 집계가 나뉩니다. 앱에서 지금 답하는 중인 사람에게도 바로 적용됩니다.
            </Notice>
          )}
          <div className="space-y-3">
            <Field label="관리용 제목"><Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="시작 화면 제목" hint="줄바꿈 가능"><Textarea rows={2} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></Field>
            <Field label="시작 화면 설명"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              {([["note", "홈 프로모 작은 글씨"], ["title", "홈 프로모 제목"], ["subtitle", "홈 프로모 부제"], ["cta_text", "버튼 문구"]] as const).map(([k, label]) => (
                <Field key={k} label={label}><Input value={promo(k)} maxLength={120} onChange={(e) => setForm({ ...form, promo: { ...form.promo, [k]: e.target.value } })} /></Field>
              ))}
            </div>
            <Field label="제외할 대학가" hint="쉼표로 구분 — 예: 계명대, 영남대"><Input value={campuses} onChange={(e) => setCampuses(e.target.value)} /></Field>
          </div>
          <QuestionsEditor value={form.questions} onChange={(questions) => setForm({ ...form, questions })} />
        </>
      )}
    </SlideOver>
  );
}

/* ─── 새 설문 ─── */
export function SurveyCreateSlideOver({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (code: string) => void;
}) {
  const blank = { code: "", title: "", headline: "", description: "", rewardTitle: "설문 참여 감사 쿠폰", validDays: 7, banner_url: "", campuses: "" };
  const [f, setF] = useState(blank);
  const [questions, setQuestions] = useState<QuestionEdit[]>([emptyQuestion()]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setF(blank); setQuestions([emptyQuestion()]); setErr(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  async function create() {
    if (saving) return;
    setSaving(true); setErr(null);
    const { ok, data } = await send<{ survey: { code: string } }>("POST", {
      code: f.code.trim(), title: f.title, headline: f.headline, description: f.description,
      reward: { title: f.rewardTitle, valid_days: f.validDays },
      banner_url: f.banner_url.trim() || undefined,
      exclude_campuses: splitCampuses(f.campuses), questions,
    });
    setSaving(false);
    if (!ok) { setErr(data.detail ?? "만들지 못했습니다."); return; }
    onCreated(data.survey.code);
    onClose();
  }

  return (
    <SlideOver open={open} onClose={onClose} width="lg" title="새 설문 만들기" subtitle="만든 직후에는 꺼져 있습니다 — 목록에서 켜면 앱에 열립니다"
      footer={<><Button variant="primary" onClick={create} disabled={saving}>{saving ? "만드는 중…" : "설문 만들기"}</Button><Button onClick={onClose}>취소</Button></>}>
      {err && <Notice tone="red" title="확인해 주세요">{err}</Notice>}
      <div className="space-y-3">
        <Field label="설문 코드" required hint="영문 소문자로 시작, 소문자 · 숫자 · _ 3~24자. 링크가 wouldulike.com/survey/<코드> 가 됩니다. 만든 뒤에는 못 바꿉니다.">
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="summer_taste" />
        </Field>
        <Field label="관리용 제목" required><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="시작 화면 제목" hint="줄바꿈 가능"><Textarea rows={2} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
        <Field label="시작 화면 설명"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="보상 쿠폰 이름"><Input value={f.rewardTitle} maxLength={60} onChange={(e) => setF({ ...f, rewardTitle: e.target.value })} /></Field>
          <Field label="쿠폰 유효일수" hint="받은 날 포함"><Input type="number" min={1} max={90} value={f.validDays} onChange={(e) => setF({ ...f, validDays: Number(e.target.value) })} /></Field>
        </div>
        <Field label="홈 세로배너 이미지 주소" hint="https:// 로 시작. 비우면 배너 없이 만듭니다."><Input value={f.banner_url} onChange={(e) => setF({ ...f, banner_url: e.target.value })} /></Field>
        <Field label="제외할 대학가" hint="쉼표로 구분 — 비워 두면 모두 참여"><Input value={f.campuses} onChange={(e) => setF({ ...f, campuses: e.target.value })} /></Field>
        <p className="text-[12px] text-gray-500">보상 쿠폰은 설문마다 새로 만들어집니다(식당 선택형 일반쿠폰). 같은 쿠폰을 다른 설문과 나눠 쓰지 않습니다.</p>
      </div>
      <QuestionsEditor value={questions} onChange={setQuestions} />
    </SlideOver>
  );
}
