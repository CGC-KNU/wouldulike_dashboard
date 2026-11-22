"use client";

import { useCallback, useEffect, useState } from "react";
import Polaris from "./Polaris";

/**
 * Polaris 방향 지도 — 세틀라이트 탭 (1122 민열님 「세틀라이트에 적용」).
 *
 * 지도는 리브라 본체에 있다(core/polaris.py · 1122_폴라리스_부활/template.html). 리브라가 화면 틀(html)과
 * 데이터를 백엔드(AdminConfig polaris:map)에 통째로 올리고, 여기는 그걸 iframe 에 그대로 띄운다 — 틀 복사본을
 * 이 저장소에 두지 않는다(한 곳만 고치면 되게). 템플릿은 window.POLARIS_API 가 있으면 생각 · 메모 · 「지금 갱신」을
 * 세틀라이트 API(/api/polaris/*)로 보내고, 그건 리브라 요청함에 쌓였다가 90초 안에 반영된다.
 * 서체는 템플릿의 fonts/ 를 /polaris-fonts/ 로 바꿔 끼운다(OFL).
 *
 * 0919 의 옛 현황 판(Polaris.tsx — 우주선 · 게이트 · 성장률)은 「예전 현황 판」 토글로 남긴다.
 */
type Doc = { html: string; data: unknown; pushed_at: string | null };

function build(doc: Doc): string {
  const blob = JSON.stringify(doc.data).replace(/</g, "\\u003c");
  return doc.html
    .replace("/*__DATA__*/null", blob)
    .replace(/url\(fonts\//g, "url(/polaris-fonts/")
    .replace("<head>", '<head><script>window.POLARIS_API="/api/polaris"</script>');
}

export default function PolarisMap() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState("");
  const [old, setOld] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/polaris", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || `HTTP ${r.status}`);
      setDoc(j); setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.data === "polaris:reload") load(); };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [load]);

  return (
    <div className="relative">
      <div className="flex items-center justify-end gap-3 mb-2 text-[12px] text-gray-500">
        {doc?.pushed_at && !old && <span>리브라가 올린 시각 {new Date(doc.pushed_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
        <button type="button" onClick={() => setOld((v) => !v)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold">
          {old ? "방향 지도로" : "예전 현황 판"}
        </button>
      </div>
      {old ? <Polaris /> : err ? (
        <p className="text-sm text-red-600 py-10 text-center">지도를 읽지 못했습니다 — {err}</p>
      ) : !doc ? (
        <p className="text-sm text-gray-400 py-10 text-center">불러오는 중…</p>
      ) : !doc.html ? (
        <p className="text-sm text-gray-500 py-10 text-center">아직 리브라가 지도를 올리지 않았습니다.</p>
      ) : (
        <iframe title="Polaris 방향 지도" srcDoc={build(doc)}
          className="w-full rounded-xl border border-gray-200 bg-white" style={{ height: "calc(100vh - 150px)", minHeight: 560 }} />
      )}
    </div>
  );
}
