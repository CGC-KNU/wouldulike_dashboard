"use client";

import { useMemo, useRef, useState } from "react";
import type { AppGraph, RefItem, RefsDoc } from "@/lib/castor/app";
import { Empty, Field, Input, Notice, PageHeader, Select, Skeleton, Textarea } from "../_shared/ui";
import { useCastorDoc } from "./useCastor";

/**
 * Castor · 레퍼런스 (기획안 Castor 절 C2 · 레퍼런스 시안, 1008). 다른 앱 화면을 갈래별로 모으고, '가져올 것' 한 줄 + 우리 화면 ID 를 붙인다.
 * 이미지는 S3 castor/ 폴더(관리자만 올림)에 두고 주소만 문서에 — 공개 저장소에는 안 둔다. 내부 참고용, 대외 자료에 쓰지 않는다.
 */
export default function CastorRefs() {
  const doc = useCastorDoc<RefsDoc>("refs");
  const graph = useCastorDoc<AppGraph>("app_graph");
  const [cat, setCat] = useState<string>("all");
  const [onlyTake, setOnlyTake] = useState(false);
  const [edit, setEdit] = useState<RefItem | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = doc.data?.items ?? [];
  const cats = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const shown = items.filter((i) => (cat === "all" || i.category === cat) && (!onlyTake || i.take));

  async function upload(files: FileList) {
    if (!edit) return;
    setUpErr(null); setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const pr = await fetch("/api/dashboard/images/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: f.name, content_type: f.type || "image/jpeg", upload_type: "castor" }) });
        if (!pr.ok) throw new Error("presign");
        const { upload_url, public_url } = await pr.json();
        const put = await fetch(upload_url, { method: "PUT", body: f, headers: { "Content-Type": f.type || "image/jpeg" } });
        if (!put.ok) throw new Error("put");
        urls.push(public_url);
      }
      setEdit({ ...edit, shots: [...edit.shots, ...urls] });
    } catch { setUpErr("이미지를 올리지 못했습니다 — 관리자 계정인지 확인해 주세요."); }
    finally { setBusy(false); }
  }

  async function save(r: RefItem) {
    const exists = items.some((x) => x.id === r.id);
    if (await doc.save({ items: exists ? items.map((x) => (x.id === r.id ? r : x)) : [...items, r] })) setEdit(null);
  }

  return (
    <div className="cx">
      <PageHeader title="레퍼런스" description="다른 앱 화면을 갈래별로 모으고, 가져올 것 한 줄과 우리 화면을 붙입니다. 내부 참고용입니다."
        actions={<button type="button" className="cx-btn pri" onClick={() => setEdit({ id: `ref-${Date.now()}`, app: "", category: cat !== "all" ? cat : cats[0] ?? "일반", shots: [], take: "", screen: "" })}>+ 레퍼런스</button>} />
      {doc.error && <div className="mb-3"><Notice tone="red" title={doc.error} /></div>}
      <div className="cx-chips mb-3">
        <button type="button" className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>전체 {items.length}</button>
        {cats.map((c) => <button key={c} type="button" className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c} {items.filter((i) => i.category === c).length}</button>)}
        <button type="button" className={onlyTake ? "on" : "dash"} onClick={() => setOnlyTake((v) => !v)}>가져올 것 적힌 것만</button>
      </div>

      {edit && (
        <div className="cx-card flex flex-col gap-2.5 mb-3">
          <div className="cx-card-h"><b>{items.some((x) => x.id === edit.id) ? edit.app : "새 레퍼런스"}</b><span className="cx-cap">이미지는 S3 castor/ 에 올라갑니다</span></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Field label="앱" required><Input value={edit.app} onChange={(e) => setEdit({ ...edit, app: e.target.value })} /></Field>
            <Field label="갈래"><Input list="cx-cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /><datalist id="cx-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
            <Field label="우리 화면"><Select value={edit.screen} onChange={(e) => setEdit({ ...edit, screen: e.target.value })}><option value="">—</option>{(graph.data?.screens ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          </div>
          <Field label="가져올 것" hint="한 줄 — 무엇을 어느 화면에"><Textarea rows={2} value={edit.take} onChange={(e) => setEdit({ ...edit, take: e.target.value })} /></Field>
          <div className="r-shots" style={{ maxWidth: 420 }}>
            {edit.shots.map((u) => <span key={u} style={{ backgroundImage: `url(${u})`, position: "relative" }}><button type="button" className="cx-btn" style={{ position: "absolute", top: 4, right: 4, padding: "0 6px" }} aria-label="이 이미지 빼기" onClick={() => setEdit({ ...edit, shots: edit.shots.filter((x) => x !== u) })}>×</button></span>)}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
          {upErr && <Notice tone="red" title={upErr} />}
          <div className="flex gap-2">
            <button type="button" className="cx-btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "올리는 중…" : "이미지 올리기"}</button>
            <button type="button" className="cx-btn pri" disabled={!edit.app.trim() || doc.saving} onClick={() => save({ ...edit, app: edit.app.trim() })}>{doc.saving ? "저장 중…" : "저장"}</button>
            <button type="button" className="cx-btn" onClick={() => setEdit(null)}>취소</button>
          </div>
        </div>
      )}

      {!doc.loaded ? <Skeleton rows={4} cols={4} /> : shown.length === 0 ? <Empty title="레퍼런스가 없습니다" detail="[+ 레퍼런스]로 다른 앱 화면을 모으세요." /> : (
        <div className="r-cards">
          {shown.map((r) => (
            <button key={r.id} type="button" className="r-card text-left" onClick={() => setEdit(r)} style={{ cursor: "pointer" }}>
              <div className="r-shots">{r.shots.slice(0, 3).map((u) => <span key={u} style={{ backgroundImage: `url(${u})` }} />)}{r.shots.length === 0 && <span />}</div>
              <span className="cx-cap">{r.category}{r.dev && ` · ${r.dev}`}</span>
              <b>{r.app}</b>
              {r.take ? <p>{r.take}</p> : <p className="cx-cap">가져올 것 — 아직</p>}
              {r.screen && <code style={{ alignSelf: "flex-start" }}>{r.screen}</code>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
