"use client";

import { useEffect, useState } from "react";

/**
 * 담당자 미리보기에서 리포트를 **파일로** 내려받는다 — 링크 대신 파일로 보내야 할 때(카톡 파일 전송, 인쇄해서 매장에 전달).
 *  · PDF: 브라우저 인쇄(저장 → PDF). 인쇄 CSS 가 상단 바·이 버튼줄을 숨기고 배경색을 살린다. `?print=1` 이면 자동으로 인쇄창.
 *  · HTML: 지금 화면을 **한 파일로** 굳힌다 — 스타일시트와 이미지를 안에 넣어 어디서 열어도 같게 보인다. 스크립트는 뺀다(열람 비콘 없음).
 * 공개(점주) 페이지에는 안 붙는다 — 점주는 링크로 본다.
 */
export default function DownloadBar({ filename }: { filename: string }) {
  const [busy, setBusy] = useState<"pdf" | "html" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try { if (new URL(window.location.href).searchParams.get("print") === "1") setTimeout(() => window.print(), 600); } catch { /* 무시 */ }
  }, []);

  function pdf() {
    setBusy("pdf");
    const prev = document.title;
    document.title = filename; // 저장 파일명 제안
    window.print();
    setTimeout(() => { document.title = prev; setBusy(null); }, 1000);
  }

  async function html() {
    setBusy("html"); setMsg(null);
    try {
      const doc = document.documentElement.cloneNode(true) as HTMLElement;
      doc.querySelectorAll("script, link[rel=preload], link[rel=modulepreload], [data-download-bar]").forEach((n) => n.remove());
      // 스타일시트 → 인라인
      for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"))) {
        try { const css = await (await fetch(link.href)).text(); const st = doc.ownerDocument.createElement("style"); st.textContent = css; link.replaceWith(st); } catch { /* 못 읽으면 링크 그대로 */ }
      }
      // 이미지 → data URI (같은 출처는 확실히, 다른 출처는 되면)
      const toData = async (url: string) => { const b = await (await fetch(url)).blob(); return await new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.onerror = no; fr.readAsDataURL(b); }); };
      for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img[src]"))) { try { img.src = await toData(img.getAttribute("src")!); img.removeAttribute("srcset"); } catch { /* 원래 URL 유지 */ } }
      for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[style*='mask-image']"))) {
        const m = el.getAttribute("style")!.match(/url\(([^)]+)\)/); if (!m) continue;
        try { const d = await toData(m[1].replace(/["']/g, "")); el.setAttribute("style", el.getAttribute("style")!.split(m[1]).join(d)); } catch { /* 유지 */ }
      }
      const title = doc.querySelector("title"); if (title) title.textContent = filename;
      const out = `<!doctype html>\n${doc.outerHTML}`;
      const blob = new Blob([out], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${filename}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMsg(`HTML ${(blob.size / 1024).toFixed(0)}KB 저장`);
    } catch { setMsg("HTML 을 만들지 못했습니다."); } finally { setBusy(null); }
  }

  return (
    <div data-download-bar className="print:hidden max-w-[520px] mx-auto px-4 pt-3 flex items-center gap-2 text-[12px]">
      <span className="text-gray-500">파일로 내려받기</span>
      <button type="button" onClick={pdf} disabled={busy !== null} className="rounded-full bg-navy text-white font-semibold px-3 py-1.5 active:scale-[0.97] transition-transform disabled:opacity-50">PDF</button>
      <button type="button" onClick={html} disabled={busy !== null} className="rounded-full bg-white border border-black/[0.1] text-navy font-semibold px-3 py-1.5 active:scale-[0.97] transition-transform disabled:opacity-50">{busy === "html" ? "만드는 중…" : "HTML"}</button>
      <span className="text-gray-400 ml-auto text-right">{msg ?? "PDF 는 인쇄창에서 'PDF로 저장'"}</span>
    </div>
  );
}
