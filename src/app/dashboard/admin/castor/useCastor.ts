"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CastorDoc, CastorHealth, DocEnvelope } from "@/lib/castor/app";

/**
 * Castor 문서 하나를 읽고 쓴다. 저장할 때 읽어 온 시각(base)을 같이 보내서, 그사이 다른 사람이
 * 고쳤으면 백엔드가 409 를 낸다 — 그때는 덮어쓰지 않고 새로 읽어 오라고 알린다.
 */
export function useCastorDoc<T>(doc: CastorDoc) {
  const [env, setEnv] = useState<DocEnvelope<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const base = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/castor/doc/${doc}`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as DocEnvelope<T> & { detail?: string };
      if (!r.ok) { setError(d.detail ?? `불러오지 못했습니다 (${r.status}).`); setEnv({ doc, data: null, updated_at: null, updated_by: null }); return; }
      base.current = d.updated_at;
      setEnv(d);
    } catch { setError("서버에 연결하지 못했습니다."); }
  }, [doc]);

  useEffect(() => { load(); }, [load]);

  /** 저장 — 성공하면 true. 409 면 최신을 다시 읽고 false. */
  const save = useCallback(async (data: T): Promise<boolean> => {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/castor/doc/${doc}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, base_updated_at: base.current }) });
      const d = (await r.json().catch(() => ({}))) as DocEnvelope<T> & { detail?: string };
      if (r.status === 409) { setError(d.detail ?? "그사이 다른 사람이 고쳤습니다. 최신으로 다시 불러왔습니다."); await load(); return false; }
      if (!r.ok) { setError(d.detail ?? `저장하지 못했습니다 (${r.status}).`); return false; }
      base.current = d.updated_at;
      setEnv(d);
      return true;
    } catch { setError("서버에 연결하지 못했습니다."); return false; }
    finally { setSaving(false); }
  }, [doc, load]);

  return { data: env?.data ?? null, loaded: env !== null, updatedAt: env?.updated_at ?? null, updatedBy: env?.updated_by ?? null, error, saving, save, reload: load };
}

/** BigQuery 이벤트 감시 · 흐름 — 6시간 캐시라 화면마다 따로 불러도 싸다 */
export function useCastorHealth() {
  const [h, setH] = useState<CastorHealth | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/castor/health").then((r) => (r.ok ? r.json() : null)).then((d) => setH(d)).catch(() => setH(null));
  }, []);
  return h;
}

export const fmtWhen = (iso: string | null) => (iso ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—");
