"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDownload, IconExternalLink, IconPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { DOC_KINDS, LEAD_STAGES, type DocKind, type SalesDoc } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Field, FilterPills, Input, PageHeader, Select, Skeleton, SlideOver, Textarea, focusRing, type ChipTone } from "../_shared/ui";

/**
 * Astro · 자료실 (Pitchr 자료실 차용).
 *
 * 계약서 · 제안서 · 견적서 · 안내문 · 전단을 영업 단계별로 늘어놓고 바로 내려받는다.
 * "미팅 나가는데 제안서 어디 있지"가 카톡 검색이 아니라 여기 한 번이어야 한다.
 *
 * 파일 본체는 여기 없다. 이 레포는 공개 GitHub 라 계약서 PDF 를 커밋하지 않는다.
 * 로컬은 `public/astro-docs/`(gitignore), 운영은 드라이브/S3 링크로 바꾼다. 화면은 링크가 없는 항목을 숨기지 않고
 * "링크 등록 필요"로 보여준다. 없는데 있는 척하는 게 제일 나쁘다.
 */

const KIND_TONE: Record<DocKind, ChipTone> = { 계약서: "navy", 제안서: "blue", 소개서: "blue", 견적서: "amber", 안내문: "green", 전단: "gray", 포스터: "gray", 기타: "gray" };

/** "언제 쓰나"를 파이프라인 순서로 정렬하기 위한 단계 인덱스. */
function stageIndex(when: string | null): number {
  if (!when) return 99;
  const i = LEAD_STAGES.findIndex((s) => when.startsWith(s));
  return i === -1 ? 50 : i;
}

/**
 * 자료를 **쓰는 때** 로 묶는다 (민열님 0913: 번잡하다).
 * 종류(계약서·제안서…)로 묶으면 "지금 뭘 들고 나가지"에 답하지 못한다. 영업 흐름이 곧 목차다.
 */
const GROUPS = [
  { key: "visit", label: "첫 방문 · 컨택", hint: "문 앞에서 건네는 것" },
  { key: "meeting", label: "미팅", hint: "앉아서 보여 주는 것" },
  { key: "contract", label: "합의 · 계약", hint: "서명 받는 것" },
  { key: "after", label: "계약 후 · 운영", hint: "입금·비치물·보고" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

function groupOf(d: SalesDoc): GroupKey {
  const w = d.when ?? "";
  if (d.kind === "전단" || w.includes("미컨택") || w.includes("첫 방문")) return "visit";
  if (d.kind === "제안서" || d.kind === "소개서" || w.includes("미팅")) return "meeting";
  if (d.kind === "계약서" || d.kind === "견적서" || w.includes("합의") || w.includes("계약 완료")) return "contract";
  return "after";
}

export default function AstroDocs({ actor }: { actor: string }) {
  const [docs, setDocs] = useState<SalesDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<DocKind | "all">("all");
  const [editing, setEditing] = useState<SalesDoc | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/astro/docs")
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const [onlyReady, setOnlyReady] = useState(false);
  const list = useMemo(
    () => docs
      .filter((d) => kind === "all" || d.kind === kind)
      .filter((d) => !onlyReady || d.url)
      .sort((a, b) => stageIndex(a.when) - stageIndex(b.when) || a.title.localeCompare(b.title, "ko")),
    [docs, kind, onlyReady]
  );
  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: list.filter((d) => groupOf(d) === g.key) })).filter((g) => g.items.length), [list]);
  const missing = docs.filter((d) => !d.url).length;

  async function remove(d: SalesDoc) {
    if (!confirm(`'${d.title}' 항목을 지웁니다. 파일 자체는 지워지지 않습니다.`)) return;
    await fetch(`/api/astro/docs/${d.id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <PageHeader
        title="자료실"
        description="계약·영업 과정에서 쓰는 파일. 영업 단계 순서로 놓여 있습니다. 링크가 없는 항목은 등록이 필요합니다."
        actions={
          <>
            <DraftBadge note="로컬은 public/astro-docs, 운영은 드라이브/S3 링크" />
            <Button variant="primary" icon={<IconPlus />} onClick={() => setEditing("new")}>자료 추가</Button>
          </>
        }
      >
        <FilterPills
          label="종류"
          value={kind}
          onChange={setKind}
          options={[{ key: "all" as const, label: "전체", count: docs.length }, ...DOC_KINDS.map((k) => ({ key: k, label: k, count: docs.filter((d) => d.kind === k).length })).filter((o) => o.count)]}
        />
        {/* 링크 없는 항목이 섞여 보이면 고르기 어렵다 — 필요할 때만 숨긴다 */}
        <button type="button" onClick={() => setOnlyReady((v) => !v)} aria-pressed={onlyReady}
          className={`ml-2 inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-semibold border ${focusRing} ${onlyReady ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-black/[0.1]"}`}>
          바로 쓸 수 있는 것만
        </button>
      </PageHeader>

      {missing > 0 && !loading && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          링크가 없는 자료 {missing}건. 드라이브에 올린 뒤 항목의 연필 버튼으로 링크를 넣으세요.
        </p>
      )}

      <Card flush>
        {loading ? (
          <Skeleton rows={6} cols={3} />
        ) : list.length === 0 ? (
          <Empty title="자료가 없습니다" detail="오른쪽 위 '자료 추가'로 링크를 등록하세요." />
        ) : (
          <div className="divide-y divide-gray-100">
            {grouped.map((g) => (
              <section key={g.key}>
                <p className="px-4 pt-3 pb-1 flex items-baseline gap-2">
                  <span className="text-[12px] font-bold text-navy">{g.label}</span>
                  <span className="text-[11px] text-gray-400">{g.hint}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums ml-auto">{g.items.length}</span>
                </p>
                <ul className="divide-y divide-gray-100">
            {g.items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Chip tone={KIND_TONE[d.kind]}>{d.kind}</Chip>
                <div className="flex-1 min-w-[14rem]">
                  <p className="text-[13px] font-semibold text-gray-900">
                    {d.title}
                    {d.version && <span className="ml-1.5 text-[12px] font-medium text-gray-400">{d.version}</span>}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {d.when && <span className="text-navy font-medium">{d.when}</span>}
                    {d.when && d.note && " · "}
                    {d.note}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {d.url ? (
                    <a href={d.url} download={d.url.startsWith("/") ? "" : undefined} target={d.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-navy text-white text-[12px] font-semibold hover:bg-[#0a0a8a] ${focusRing}`}>
                      {d.url.startsWith("/") ? <IconDownload size={14} aria-hidden="true" /> : <IconExternalLink size={14} aria-hidden="true" />}
                      {d.url.startsWith("/") ? "내려받기" : "열기"}
                    </a>
                  ) : (
                    <Chip tone="amber">링크 등록 필요</Chip>
                  )}
                  <Button size="sm" variant="ghost" aria-label={`${d.title} 수정`} icon={<IconPencil />} onClick={() => setEditing(d)} />
                  <Button size="sm" variant="ghost" aria-label={`${d.title} 삭제`} icon={<IconTrash />} onClick={() => remove(d)} />
                </div>
              </li>
            ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        매장별 견적서는 아직 자동 생성이 없습니다. <span className="font-semibold text-gray-700">0830_매장별_견적서</span> 스크립트로 만들고 링크를 등록하세요. 다음 단계에서 매장 상세의 "견적서 만들기" 버튼으로 붙입니다.
      </p>

      {editing && <DocEditor doc={editing === "new" ? null : editing} actor={actor} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

function DocEditor({ doc, actor, onClose, onSaved }: { doc: SalesDoc | null; actor: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ kind: doc?.kind ?? "기타", title: doc?.title ?? "", version: doc?.version ?? "", url: doc?.url ?? "", when: doc?.when ?? "", note: doc?.note ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.title.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(doc ? `/api/astro/docs/${doc.id}` : "/api/astro/docs", {
        method: doc ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, updated_by: actor }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail ?? "저장하지 못했습니다."); return; }
      onSaved(); onClose();
    } catch { setError("서버에 연결하지 못했습니다."); }
    finally { setSaving(false); }
  }

  return (
    <SlideOver open onClose={onClose} title={doc ? "자료 수정" : "자료 추가"} subtitle="파일은 드라이브·S3 에 두고 링크만 등록합니다."
      footer={<><Button variant="primary" onClick={submit} disabled={!form.title.trim() || saving}>{saving ? "저장하는 중…" : "저장"}</Button><Button variant="ghost" onClick={onClose}>취소</Button>{error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}</>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="종류"><Select value={form.kind} onChange={set("kind")}>{DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="버전"><Input value={form.version} onChange={set("version")} placeholder="v6 · 0901 · 11P" /></Field>
      </div>
      <Field label="제목" required><Input value={form.title} onChange={set("title")} placeholder="예: 파트너매장 계약서 26-2 (정본)" autoFocus /></Field>
      <Field label="링크" hint="드라이브 공유 링크 또는 S3 URL. 로컬 파일은 /astro-docs/파일명"><Input value={form.url} onChange={set("url")} type="url" inputMode="url" placeholder="https://drive.google.com/…" /></Field>
      <Field label="언제 쓰나" hint="영업 단계 이름으로 시작하면 그 순서로 정렬됩니다"><Input value={form.when} onChange={set("when")} placeholder="예: 구두 합의 → 계약 완료" /></Field>
      <Field label="메모"><Textarea rows={3} value={form.note} onChange={set("note")} placeholder="어떤 버전이 정본인지, 주의할 점" /></Field>
    </SlideOver>
  );
}
