"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronLeft } from "@tabler/icons-react";
import { focusRing } from "../_shared/ui";

/**
 * 세티 놀이방 — 팀이 하나를 같이 키운다 (민열님 0919 승인).
 *
 * 업무 툴이 아니다. 여기서는 매장·입금 숫자를 쓰지 않는다 — 일하다 숨 돌리는 자리다.
 * 그래도 **지어내지 않는 규칙은 같다**: 수치·순위·기록은 전부 백엔드가 준 값이고,
 * 못 읽으면 0 이 아니라 "못 읽었다"고 적는다.
 *
 * 배경은 우주선 안. 둥근 창 너머로 별과 행성이 흐르고, 세티는 그 앞에 떠 있다.
 * 낮에는 선실에 불이 들어오고 밤에는 꺼진다(툴의 18시 다크를 그대로 따른다). **창밖은 늘 어둡다** —
 * 우주니까. 그래서 라이트에서도 창이 또렷하게 보인다.
 * 대화는 B안(규칙 + 기억) — 정해 둔 말에 이름·요일·최근 돌본 사람을 섞는다. 모델을 부르지 않는다.
 */

type Action = "FEED" | "PLAY" | "WASH" | "SLEEP" | "TALK";

interface Pet {
  hunger: number; mood: number; clean: number; bond: number;
  level: number; level_name: string; sleeping: boolean; nickname: string; days: number;
}
interface Data {
  pet: Pet;
  me: { username: string; name: string; left: Record<string, number> };
  ranking: { username: string; name: string; count: number; last_at: string | null; me: boolean }[];
  recent: { name: string; action: Action; at: string | null }[];
  caps: Record<string, number>;
  leveled?: boolean;
  said?: string;
  detail?: string;
}

const ACT_LABEL: Record<Action, string> = { FEED: "밥", PLAY: "놀기", WASH: "씻기", SLEEP: "재우기", TALK: "대화" };
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

const LINES: Record<string, string[]> = {
  FEED: ["잘 먹겠습니다!", "오늘 밥 맛있네요", "배부르면 안테나가 빨라져요"],
  PLAY: ["같이 도니까 재밌어요", "한 바퀴 더!", "우주가 넓어 보여요"],
  WASH: ["반짝반짝해졌어요", "먼지가 우주먼지였나 봐요", "개운해요"],
};

/** 몇 분 전인지. 지어내지 않는다 — 시각이 없으면 빈 문자열. */
function ago(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/**
 * 대화 — 규칙에 **기억**을 섞는다(B안). 기억은 지금 화면이 들고 있는 값뿐이다:
 * 부르는 사람 이름, 요일, 레벨, 방금 돌봐 준 사람, 배고픔. 여기 없는 건 모른다고 말한다.
 */
function reply(text: string, d: Data): string {
  const t = text.trim();
  const me = d.me.name;
  const p = d.pet;
  const last = d.recent[0];
  const top = d.ranking[0];
  const day = ["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()];
  const has = (...ks: string[]) => ks.some((k) => t.includes(k));

  if (has("안녕", "하이", "ㅎㅇ", "반가", "왔어")) {
    const weekend = day === "토" || day === "일";
    return pick([
      `${me}님, 안녕하세요!`,
      weekend ? `${day}요일인데 나오셨네요. 저는 늘 여기 있어요` : `${day}요일이에요. 오늘도 같이 돌아요`,
      last ? `${me}님 안녕하세요! 아까 ${last.name}님도 다녀갔어요` : `${me}님 안녕하세요!`,
    ]);
  }
  if (has("누구", "정체", "소개", "뭐야", "뭐하")) {
    return pick([
      `저는 세티예요. 세틀라이트 위를 도는 작은 위성이요. 지금은 Lv.${p.level} ${p.level_name}이에요`,
      `우주라이크 툴에 같이 살아요. ${p.days}일째 같이 있어요`,
    ]);
  }
  if (has("배고", "밥", "먹")) {
    if (p.hunger < 35) return "사실… 조금 배고파요";
    if (p.hunger > 85) return "지금은 배불러요. 조금 있다 주세요";
    return `오늘 밥은 ${d.caps.FEED}번까지 먹을 수 있어요. ${me}님은 ${d.me.left.FEED}번 남았어요`;
  }
  if (has("심심", "지루", "놀")) return p.mood < 50 ? "저도 심심했어요. 놀아 주실래요?" : "좋아요, 한 바퀴 돌까요?";
  if (has("누가", "순위", "일등", "1등", "많이")) {
    return top ? `요즘은 ${top.name}님이 제일 많이 챙겨 주셨어요 (${top.count}번)` : `아직 아무도 안 왔어요. ${me}님이 처음이에요`;
  }
  if (has("방금", "마지막", "최근")) {
    return last ? `${ago(last.at)}에 ${last.name}님이 ${ACT_LABEL[last.action]} 해 주셨어요` : "최근 기록이 없어요";
  }
  if (has("힘들", "피곤", "지침", "졸려", "바빠")) {
    return pick(["오늘 많이 하셨어요. 조금 쉬어요", "커피 한 잔 하고 오셔도 숫자는 안 도망가요", `${me}님, 무리하지 마세요`]);
  }
  if (has("매장", "입금", "계산서", "후보", "매출", "숫자", "리포트")) {
    return "그 이야기는 밖에서 해요 — 여기선 제가 틀릴 수 있거든요";
  }
  if (has("고마", "고맙", "쌩큐", "ㄱㅅ")) return pick(["저야말로요", "헤헤", `${me}님 덕분이에요`]);
  if (has("사랑", "좋아", "귀여", "예뻐", "최고")) return pick(["부끄러워요…", "저도 좋아해요"]);
  if (has("이름", "별명")) return "세티예요. 세틀라이트에서 따왔어요";
  if (has("잘자", "굿밤", "자자", "퇴근")) return pick(["안녕히 가세요", "내일 봐요", "오늘도 고생하셨어요"]);
  if (has("레벨", "몇 살", "며칠", "얼마나")) return `Lv.${p.level} ${p.level_name}, 같이 있은 지 ${p.days}일이에요`;
  if (t.length <= 2) return "짧네요! 더 말해 주세요";
  if (t.includes("?") || t.endsWith("까") || t.endsWith("니")) return "글쎄요… 저는 도는 것밖에 몰라요";
  return pick(["음… 아직 그 말은 못 배웠어요", "그렇군요!", "저는 아직 배우는 중이에요", `${me}님이 알려 주시면 배울게요`]);
}

export default function Playroom({ onBack }: { onBack?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bubble, setBubble] = useState("");
  const [burst, setBurst] = useState<"" | "happy" | "eat">("");
  const [chat, setChat] = useState<{ who: "s" | "u"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = useCallback((t: string, ms = 2800) => {
    setBubble(t);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(""), ms);
  }, []);

  useEffect(() => {
    fetch("/api/playroom")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setErr(j.detail ?? "세티를 못 불렀어요."); return; }
        setD(j);
        setChat([
          { who: "s", text: `${j.me.name}님, 오셨네요!` },
          { who: "s", text: "밥 주셔도 되고, 그냥 말 걸어도 돼요." },
        ]);
      })
      .catch(() => setErr("세티한테 못 닿았어요."));
    return () => clearTimeout(bubbleTimer.current);
  }, []);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [chat]);

  const care = useCallback(async (action: Action, quiet = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/playroom/care", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = (await r.json()) as Data;
      if (j.pet) setD(j);                       // 상한을 넘겨 거절당해도 지금 상태는 같이 온다
      if (!r.ok) { if (!quiet) say(j.detail ?? "지금은 안 돼요"); return; }
      if (quiet) return;
      if (j.leveled) { say(`Lv.${j.pet.level} ${j.pet.level_name}이(가) 됐어요!`, 4200); setBurst("happy"); }
      else if (j.said) say(j.said);
      else if (LINES[action]) say(pick(LINES[action]));
      setBurst(action === "FEED" ? "eat" : "happy");
      setTimeout(() => setBurst(""), action === "FEED" ? 900 : 1400);
    } catch {
      if (!quiet) say("어… 지금은 안 들려요");
    } finally { setBusy(false); }
  }, [busy, say]);

  function send(text: string) {
    const t = text.trim();
    if (!t || !d) return;
    setChat((c) => [...c, { who: "u", text: t }]);
    setDraft("");
    const answer = reply(t, d);
    setTimeout(() => setChat((c) => [...c, { who: "s", text: answer }]), 380);
    if ((d.me.left.TALK ?? 0) > 0) care("TALK", true);   // 대화도 친밀도가 오른다 (하루 상한 안에서만)
  }

  const pet = d?.pet;
  const mood: string = !pet ? "idle"
    : pet.sleeping ? "sleep"
    : burst === "happy" ? "happy"
    : burst === "eat" ? "eat"
    : pet.mood >= 75 && pet.hunger >= 50 ? "happy"
    : pet.mood < 40 || pet.hunger < 30 || pet.clean < 30 ? "sad"
    : "idle";

  return (
    <div className="playroom relative min-h-screen overflow-hidden bg-[var(--pr-ground)] text-[var(--pr-ink)]">
      {/* 우주선 안 — 창 너머 별, 안쪽은 선체 */}
      <div aria-hidden="true" className="pr-hull" />
      <div aria-hidden="true" className="pr-stars" />

      <div className="relative max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-14">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className={`inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-[13px] font-semibold text-[var(--pr-ink-soft)] hover:text-[var(--pr-ink)] hover:bg-[var(--pr-chip)] ${focusRing}`}>
              <IconChevronLeft size={16} aria-hidden="true" />메인
            </button>
          )}
          <span className="text-[12px] font-semibold tracking-[0.12em] text-[var(--pr-accent)] uppercase">Satellite · 놀이방</span>
          {pet && <span className="ml-auto text-[12px] font-medium text-[var(--pr-ink-faint)] tabular-nums">함께한 지 {pet.days}일</span>}
        </div>

        {err && (
          <p className="mt-8 text-center text-[13.5px] text-[var(--pr-ink-soft)]">{err}<br /><span className="text-[var(--pr-ink-faint)] text-[12px]">새로고침하면 다시 불러 볼게요.</span></p>
        )}

        {d && pet && (
          <div className="mt-4 grid gap-4 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-start">

            {/* ── 무대 */}
            <div className="rounded-[22px] border border-[var(--pr-line)] bg-[var(--pr-panel)] backdrop-blur-xl p-4 md:p-5">
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] font-bold text-[var(--pr-accent)] bg-[var(--pr-chip)] border border-[var(--pr-line)] rounded-full px-2.5 py-1">
                  세티 · Lv.{pet.level} {pet.level_name}
                </span>
                {pet.sleeping && <span className="text-[11.5px] font-semibold text-[var(--pr-ink-faint)]">자는 중</span>}
              </div>

              <div className="relative h-[240px] md:h-[280px] grid place-items-center">
                <div aria-hidden="true" className="pr-port" />
                <svg viewBox="0 0 160 160" data-mood={mood} className="satty-room relative w-[170px] h-[170px] md:w-[200px] md:h-[200px] cursor-pointer"
                  role="img" aria-label={`세티 Lv.${pet.level} ${pet.level_name}`}
                  onClick={() => { if (pet.sleeping) { say("쉿…"); return; } setBurst("happy"); setTimeout(() => setBurst(""), 1200); say("히히, 간지러워요"); }}>
                  <defs><radialGradient id="prBody" cx="40%" cy="30%" r="75%"><stop offset="0" stopColor="#7C7EF0" /><stop offset=".55" stopColor="#4F52DC" /><stop offset="1" stopColor="#2B28B8" /></radialGradient></defs>
                  <g className="satty-wing wl"><ellipse cx="36" cy="98" rx="13" ry="10" fill="#9B9DF4" /></g>
                  <g className="satty-wing wr"><ellipse cx="124" cy="98" rx="13" ry="10" fill="#9B9DF4" /></g>
                  <g className="satty-torso">
                    <rect x="72" y="34" width="16" height="12" rx="5" fill="#4F52DC" />
                    <circle className="satty-beacon" cx="80" cy="30" r="4.5" fill="#C7C9F7" />
                    <circle cx="80" cy="88" r="46" fill="url(#prBody)" />
                    <ellipse cx="52" cy="94" rx="8" ry="5" fill="#B9BBFA" opacity=".85" />
                    <ellipse cx="108" cy="94" rx="8" ry="5" fill="#B9BBFA" opacity=".85" />
                    <g className="eye-open"><circle cx="66" cy="82" r="4.4" fill="#0B0B3A" /><circle cx="94" cy="82" r="4.4" fill="#0B0B3A" /></g>
                    <path className="eye-closed" d="M60 82q6 5 12 0M88 82q6 5 12 0" stroke="#0B0B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
                    <path className="eye-smile" d="M60 84q6-7 12 0M88 84q6-7 12 0" stroke="#0B0B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
                    <path d="M77 98q3 3 6 0" className="satty-mouth2" stroke="#0B0B3A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                  </g>
                  <g className="pr-hearts" fill="#FF8FB1">
                    <path d="M118 46c-2.6-3.4-7.6-2.6-8.6 1.7-1-4.3-6-5.1-8.6-1.7-2.6 3.4 0 7.7 8.6 12.9 8.6-5.2 11.2-9.5 8.6-12.9z" />
                    <path d="M44 40c-1.9-2.5-5.6-1.9-6.3 1.3-.7-3.2-4.4-3.8-6.3-1.3-1.9 2.5 0 5.7 6.3 9.5 6.3-3.8 8.2-7 6.3-9.5z" opacity=".8" />
                  </g>
                  <g className="pr-crumbs" fill="#E8A33D"><circle cx="70" cy="70" r="3" /><circle cx="88" cy="66" r="2.4" /><circle cx="80" cy="60" r="2" /></g>
                  <text className="pr-zzz" aria-hidden="true" x="120" y="48" fontWeight="700" fontSize="14" fill="#8C8EF0">z<tspan fontSize="10" dy="-6">z</tspan></text>
                </svg>
                {bubble && (
                  <div role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[85%] text-center rounded-[14px_14px_4px_14px] bg-[var(--pr-bubble)] text-[var(--pr-bubble-ink)] text-[12.5px] font-semibold px-3 py-1.5 shadow-lg">
                    {bubble}
                  </div>
                )}
              </div>

              <div className="grid gap-2.5 mt-2">
                {([["배고픔", pet.hunger, "linear-gradient(90deg,#E8A33D,#F2C14E)"],
                   ["기분", pet.mood, "linear-gradient(90deg,#6366E0,#9B9DF4)"],
                   ["깨끗함", pet.clean, "linear-gradient(90deg,#2BBE9B,#7FE9CB)"],
                   ["친밀도", pet.bond, "linear-gradient(90deg,#FF8FB1,#FFC2D4)"]] as const).map(([k, v, g]) => (
                  <div key={k} className="grid grid-cols-[58px_1fr_38px] items-center gap-2.5">
                    <span className="text-[12px] font-semibold text-[var(--pr-ink-soft)]">{k}</span>
                    <span className="h-[9px] rounded-full bg-[var(--pr-bar)] overflow-hidden"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: g }} /></span>
                    <b className="text-[12px] font-semibold text-right tabular-nums text-[var(--pr-ink)]">{v}</b>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2 mt-4">
                {([["FEED", "밥 주기"], ["PLAY", "놀아 주기"], ["WASH", "씻기기"], ["SLEEP", pet.sleeping ? "깨우기" : "재우기"]] as const).map(([a, label]) => {
                  const left = a === "SLEEP" ? null : d.me.left[a] ?? 0;
                  return (
                    <button key={a} type="button" disabled={busy || left === 0}
                      onClick={() => care(a as Action)}
                      className={`grid gap-1 justify-items-center py-2.5 px-1 rounded-[14px] border border-[var(--pr-line)] bg-[var(--pr-chip)] text-[12.5px] font-semibold text-[var(--pr-ink)] transition-transform duration-150 enabled:hover:border-[var(--pr-accent)] enabled:active:scale-[0.97] disabled:opacity-40 ${focusRing}`}>
                      {label}
                      <span className="text-[10.5px] font-medium text-[var(--pr-ink-faint)] tabular-nums">
                        {left === null ? (pet.sleeping ? "자는 중" : "언제든") : `오늘 ${left}/${d.caps[a]}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-[var(--pr-ink-faint)] mt-3 leading-relaxed">
                하루 상한은 <b className="text-[var(--pr-ink-soft)]">사람마다</b> 셉니다 — 한 사람이 다 해 버리면 나머지가 구경만 하니까요.
                굶겨도 세티는 죽지 않아요. 시무룩해지고 자라지 않을 뿐이에요.
              </p>
            </div>

            {/* ── 오른쪽: 대화 + 크루 기록 */}
            <div className="grid gap-4">
              <div className="rounded-[22px] border border-[var(--pr-line)] bg-[var(--pr-panel)] backdrop-blur-xl flex flex-col">
                <div className="px-4 pt-4">
                  <h2 className="text-[14px] font-bold">세티랑 대화</h2>
                  <p className="text-[11.5px] text-[var(--pr-ink-faint)] mt-0.5">정해 둔 말에 이름·요일·최근 기록을 섞어서 답해요. 업무 얘기는 밖에서 해요.</p>
                </div>
                <div ref={logRef} className="flex-1 overflow-y-auto max-h-[240px] px-4 py-3 flex flex-col gap-2">
                  {chat.map((m, i) => (
                    <span key={i} className={`max-w-[85%] text-[12.5px] leading-snug px-2.5 py-1.5 rounded-[14px] ${m.who === "u" ? "self-end bg-[#4F52DC] text-white rounded-br-[5px]" : "self-start bg-[var(--pr-chip)] rounded-bl-[5px]"}`}>{m.text}</span>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap px-4 pb-2">
                  {["안녕!", "넌 누구야?", "심심해", "누가 제일 많이 챙겼어?"].map((c) => (
                    <button key={c} type="button" onClick={() => send(c)} className={`text-[11.5px] font-semibold text-[var(--pr-accent)] border border-[var(--pr-line)] rounded-full px-2.5 py-1 hover:border-[var(--pr-accent)] ${focusRing}`}>{c}</button>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex gap-2 px-4 py-3 border-t border-[var(--pr-line)]">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="세티에게 말 걸기…" aria-label="세티에게 보낼 말"
                    className="flex-1 min-w-0 text-[13px] bg-[var(--pr-chip)] border border-[var(--pr-line)] rounded-xl px-3 py-2 placeholder:text-[var(--pr-ink-faint)] focus:outline-none focus:border-[var(--pr-accent)]" />
                  <button type="submit" className={`text-[13px] font-bold bg-[var(--pr-send)] text-[var(--pr-send-ink)] rounded-xl px-4 ${focusRing}`}>보내기</button>
                </form>
              </div>

              <div className="rounded-[22px] border border-[var(--pr-line)] bg-[var(--pr-panel)] backdrop-blur-xl p-4">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[14px] font-bold">잘 챙겨준 팀원</h2>
                  <span className="text-[11.5px] text-[var(--pr-ink-faint)]">최근 30일</span>
                </div>
                {d.ranking.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--pr-ink-faint)] mt-2">아직 아무도 안 왔어요. {d.me.name}님이 처음이에요.</p>
                ) : (
                  <ol className="mt-2.5 grid gap-1.5">
                    {d.ranking.map((r, i) => (
                      <li key={r.username} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl ${r.me ? "bg-[var(--pr-chip)]" : ""}`}>
                        <span className={`w-5 text-[12px] font-bold tabular-nums ${i === 0 ? "text-[#FFC2D4]" : "text-[var(--pr-ink-faint)]"}`}>{i + 1}</span>
                        <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{r.name}{r.me && <span className="text-[11px] font-medium text-[var(--pr-ink-faint)] ml-1.5">나</span>}</span>
                        <span className="text-[11.5px] text-[var(--pr-ink-faint)] tabular-nums">{ago(r.last_at)}</span>
                        <b className="text-[13px] font-bold tabular-nums">{r.count}</b>
                      </li>
                    ))}
                  </ol>
                )}
                {d.recent.length > 0 && (
                  <p className="text-[11.5px] text-[var(--pr-ink-faint)] mt-3 pt-3 border-t border-[var(--pr-line)]">
                    방금 <b className="text-[var(--pr-ink-soft)]">{d.recent[0].name}</b>님이 {ACT_LABEL[d.recent[0].action]} · {ago(d.recent[0].at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!d && !err && <p className="mt-10 text-center text-[13px] text-[var(--pr-ink-faint)]">세티를 깨우는 중…</p>}
      </div>
    </div>
  );
}
