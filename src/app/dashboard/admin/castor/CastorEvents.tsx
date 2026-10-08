"use client";

import { useMemo, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { EVENT_PLAN_LABEL, type AppGraph, type EventPlan, type EventRow, type EventsDoc } from "@/lib/castor/app";
import { Button, Chip, Field, FilterPills, Input, Notice, PageHeader, Select, Skeleton, SlideOver, Table, Td, Textarea, Th, rowClickable, type ChipTone } from "../_shared/ui";
import { useCastorDoc, useCastorHealth } from "./useCastor";

/**
 * Castor · 계측 정의서 + 이벤트 감시 (0단계, 1008). 기획안 "기반 과제"와 Castor 절 C3-C.
 *
 * 줄 = 앱 코드에 있는 이벤트(지도에서 자동) ∪ 아직 없는 이벤트(사람이 '새로 추가'로 적음).
 * 상태는 사람이 고르지 않는다 — 코드 · GA4 최근 7일로 정한다. 사람은 계획(유지 · 고칠 것 · 새로 추가 · 안 씀)과 담당 · 이유만 적는다.
 */
type Live = "collecting" | "silent" | "yesterday0" | "missing" | "nodata";
const LIVE: Record<Live, { label: string; tone: ChipTone }> = {
  collecting: { label: "수집 중", tone: "green" },
  yesterday0: { label: "마지막 날 0건", tone: "amber" },
  silent: { label: "코드엔 있음 · 7일 0건", tone: "red" },
  missing: { label: "코드에 없음", tone: "gray" },
  nodata: { label: "GA4 연결 전", tone: "gray" },
};
type Filter = "all" | "alert" | "add" | "fix";

interface Line { name: string; code: number; screens: string[]; d7: number | null; last: number | null; live: Live; row?: EventRow }

export default function CastorEvents() {
  const graph = useCastorDoc<AppGraph>("app_graph");
  const doc = useCastorDoc<EventsDoc>("events");
  const h = useCastorHealth();
  const [filter, setFilter] = useState<Filter>("all");
  const [edit, setEdit] = useState<EventRow | null>(null);

  const lines = useMemo<Line[]>(() => {
    const live = new Map((h?.ok ? h.events : []).map((e) => [e.name, e]));
    const rows = new Map((doc.data?.rows ?? []).map((r) => [r.name, r]));
    const names = new Set<string>([...(graph.data?.events ?? []).map((e) => e.name), ...rows.keys()]);
    return [...names].map((name) => {
      const ev = graph.data?.events.find((e) => e.name === name);
      const code = ev?.used.length ?? 0;
      const l = live.get(name);
      const d7 = h?.ok ? l?.d7 ?? 0 : null;
      const last = h?.ok ? l?.last_day ?? 0 : null;
      const st: Live = !code ? "missing" : !h?.ok ? "nodata" : !d7 ? "silent" : !last ? "yesterday0" : "collecting";
      return { name, code, screens: rows.get(name)?.screen ? [rows.get(name)!.screen!] : ev?.screens ?? [], d7, last, live: st, row: rows.get(name) };
    }).sort((a, b) => (order(a) - order(b)) || a.name.localeCompare(b.name));
  }, [graph.data, doc.data, h]);

  const shown = lines.filter((l) => filter === "all" || (filter === "alert" ? l.live === "silent" || l.live === "yesterday0" : l.row?.plan === filter));
  const n = (f: Filter) => lines.filter((l) => f === "all" || (f === "alert" ? l.live === "silent" || l.live === "yesterday0" : l.row?.plan === f)).length;

  async function saveRow(r: EventRow) {
    const rows = (doc.data?.rows ?? []).filter((x) => x.name !== r.name);
    if (await doc.save({ rows: [...rows, r] })) setEdit(null);
  }

  return (
    <>
      <PageHeader title="계측" description="앱이 보내는 이벤트와 아직 없는 이벤트. 상태는 코드와 GA4 최근 7일이 정합니다."
        actions={<Button icon={<IconPlus size={15} />} onClick={() => setEdit({ name: "", plan: "add" })}>새 이벤트</Button>} />
      {doc.error && <div className="mb-3"><Notice tone="red" title={doc.error} /></div>}
      <div className="mb-3"><FilterPills label="보기" value={filter} onChange={setFilter} options={[{ key: "all", label: "전체", count: n("all") }, { key: "alert", label: "끊김 경고", count: n("alert") }, { key: "fix", label: "고칠 것", count: n("fix") }, { key: "add", label: "새로 추가", count: n("add") }]} /></div>
      {!graph.loaded || h === undefined ? <Skeleton rows={8} cols={6} /> : (
        <Table minWidth="54rem">
          <thead><tr><Th>이벤트</Th><Th>화면</Th><Th align="right">코드 위치</Th><Th align="right">7일</Th><Th align="right">마지막 날</Th><Th>상태</Th><Th>계획 · 담당</Th></tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.name} className={rowClickable} onClick={() => setEdit(l.row ?? { name: l.name, plan: "keep" })}>
                <Td><span className="font-mono text-[12.5px] text-gray-900">{l.name}</span>{l.row?.why && <span className="block text-[11.5px] text-gray-500 line-clamp-1">{l.row.why}</span>}</Td>
                <Td><span className="font-mono text-[11.5px] text-gray-500">{l.screens.join(" · ") || "—"}</span></Td>
                <Td align="right"><span className="tabular-nums">{l.code || "—"}</span></Td>
                <Td align="right"><span className="tabular-nums">{l.d7 === null ? "—" : l.d7.toLocaleString()}</span></Td>
                <Td align="right"><span className="tabular-nums">{l.last === null ? "—" : l.last.toLocaleString()}</span></Td>
                <Td><Chip tone={LIVE[l.live].tone}>{LIVE[l.live].label}</Chip></Td>
                <Td>{l.row ? <span className="text-[12.5px] text-gray-700">{EVENT_PLAN_LABEL[l.row.plan]}{l.row.owner && <span className="text-gray-400"> · {l.row.owner}</span>}</span> : <span className="text-[12px] text-gray-300">—</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {edit && (
        <SlideOver open onClose={() => setEdit(null)} title={edit.name || "새 이벤트"} subtitle="계측 정의서 한 줄 — 이름 규칙은 화면 ID 와 맞춥니다."
          footer={<><Button variant="primary" disabled={!edit.name.trim() || doc.saving} onClick={() => saveRow({ ...edit, name: edit.name.trim() })}>{doc.saving ? "저장 중…" : "저장"}</Button><Button variant="ghost" onClick={() => setEdit(null)}>취소</Button></>}>
          <div className="space-y-3">
            <Field label="이벤트 이름" required><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="예: qr_entry" className="font-mono" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="계획"><Select value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value as EventPlan })}>{(Object.keys(EVENT_PLAN_LABEL) as EventPlan[]).map((k) => <option key={k} value={k}>{EVENT_PLAN_LABEL[k]}</option>)}</Select></Field>
              <Field label="담당"><Input value={edit.owner ?? ""} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} placeholder="재민 · 민찬 …" /></Field>
              <Field label="화면 ID"><Input value={edit.screen ?? ""} onChange={(e) => setEdit({ ...edit, screen: e.target.value })} placeholder="store.detail" className="font-mono" /></Field>
              <Field label="기획안 과제"><Input value={edit.task ?? ""} onChange={(e) => setEdit({ ...edit, task: e.target.value })} placeholder="과제 1" /></Field>
            </div>
            <Field label="파라미터"><Input value={edit.params ?? ""} onChange={(e) => setEdit({ ...edit, params: e.target.value })} placeholder="restaurant_id, src" className="font-mono" /></Field>
            <Field label="왜 · 무엇을 재나"><Textarea rows={3} value={edit.why ?? ""} onChange={(e) => setEdit({ ...edit, why: e.target.value })} /></Field>
          </div>
        </SlideOver>
      )}
    </>
  );
}

function order(l: Line) {
  return { silent: 0, yesterday0: 1, missing: 2, nodata: 3, collecting: 4 }[l.live];
}
