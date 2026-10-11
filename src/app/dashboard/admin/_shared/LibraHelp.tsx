"use client";

import { useEffect, useRef } from "react";
import { IconBrandSlack, IconX } from "@tabler/icons-react";
import { focusRing } from "./ui";

/**
 * 런처의 Libra 를 누르면 뜨는 사용법 (1011 민열님: 슬랙으로 넘기지 말고 사용법을 팝업으로, X 로 닫기).
 * 명령은 리브라 기능 명세서(비서/docs/리브라_기능명세서.html 7절)에 있는 것만 적는다.
 */
const ASK: [string, string][] = [["@Libra 질문", "원장 · 슬랙 기록을 보고 답합니다. 답한 스레드에서는 30분 동안 @ 없이 이어 물어도 됩니다."]];
const READ: [string, string][] = [
  ["?현황", "계약 · 유료 · 월 매출 · 입금 · 계산서 · 후보 단계 · 미팅 예정 · 막힌 것"],
  ["?매장 진미식당", "그 한 곳의 후보 정보와 계약 운영값"],
  ["?내것", "내가 담당한 것만"],
  ["?큰일", "Orbit — 여러 팀이 걸친 큰 일 현황"],
  ["?멤버 · ?용어 · ?도움", "팀원 목록 · 용어 뜻 · 알아듣는 말 전부"],
];
const WRITE: [string, string][] = [
  ["?단계 매장 미팅완료", "세틀라이트 후보 단계를 바꿉니다"],
  ["?메모 매장 내용", "후보에 한 줄 메모"],
  ["?설정 매장 담당 이름", "정해진 칸만 고칩니다"],
  ["?별칭", "매장을 부르는 다른 이름 등록"],
];
const AUTO = [
  "아침 브리핑 — 막힌 것(멈춘 후보 · 미입금)을 담당자별로 멘션 · #sat-astro",
  "오전 9시 어제 진행 정리 · #bot-daily",
  "월말 구독료 · 재계약 알림 · 묵은 할 일",
  "Orbit 큰 일이 슬랙에서 언급되면 그 건의 「최근 소식」에 모음",
];

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => [
        <dt key={`${k}t`} className="font-mono text-[12px] font-bold text-gray-900 bg-black/[0.04] rounded-md px-1.5 py-0.5 self-start break-keep">{k}</dt>,
        <dd key={`${k}d`} className="text-gray-600">{v}</dd>,
      ])}
    </dl>
  );
}

export default function LibraHelp({ open, onClose, channelUrl }: { open: boolean; onClose: () => void; channelUrl: string }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,10,30,0.45)]" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="libra-help-title" className="relative w-full max-w-[560px] max-h-[86vh] flex flex-col bg-white rounded-[20px] border border-black/[0.06] shadow-[0_30px_60px_-20px_rgba(6,0,115,0.45)]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="w-9 h-9 rounded-[11px] bg-[linear-gradient(135deg,#7FE9CB,#2BBE9B)] flex items-center justify-center">
              <span className="block w-6 h-6 bg-white" style={{ WebkitMaskImage: "url(/satellite/libra.svg)", maskImage: "url(/satellite/libra.svg)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }} />
            </span>
            <div><h2 id="libra-help-title" className="text-[15px] font-bold text-gray-900">슬랙에서 리브라 쓰는 법</h2><p className="text-[11.5px] text-gray-500">리브라가 들어가 있는 채널이면 어디서든</p></div>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="닫기" className={`w-8 h-8 rounded-full bg-black/[0.05] grid place-items-center hover:bg-black/10 ${focusRing}`}><IconX size={16} /></button>
        </div>
        <div className="overflow-auto px-5 py-4 space-y-4">
          <div><p className="text-[11.5px] font-bold text-navy mb-1.5">물어보기</p><Rows rows={ASK} /></div>
          <div><p className="text-[11.5px] font-bold text-navy mb-1.5">바로 보기</p><Rows rows={READ} /></div>
          <div><p className="text-[11.5px] font-bold text-navy mb-1.5">슬랙에서 바로 고치기</p><Rows rows={WRITE} /></div>
          <div><p className="text-[11.5px] font-bold text-navy mb-1.5">알아서 오는 것</p><ul className="list-disc pl-5 text-[13px] text-gray-600 space-y-0.5">{AUTO.map((a) => <li key={a}>{a}</li>)}</ul></div>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-black/[0.06]">
          <a href={channelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"><IconBrandSlack size={14} /> 더 궁금한 건 #sat-libra</a>
          <button type="button" onClick={onClose} className={`px-3.5 py-1.5 rounded-lg border border-black/10 text-[13px] ${focusRing}`}>닫기</button>
        </div>
      </div>
    </div>
  );
}
