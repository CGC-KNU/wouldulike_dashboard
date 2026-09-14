"use client";

import { useMemo, useState } from "react";
import type { Campus, Lead, StoreRow } from "@/lib/draft/types";
import { CAMPUSES } from "@/lib/draft/types";
import { Button, Field, Input, Notice, Segmented, Select, SlideOver, periodLocal } from "../_shared/ui";

/**
 * 일정 빠른 등록 — 달력의 날짜 칸에서 '+' 를 누르면 열린다 (민열님 0914).
 *
 * 달력은 지금까지 **읽기 전용**이었다. 미팅 날짜를 잡으려면 파트너 후보 탭으로 가서 카드를 찾아
 * 미팅 일시 칸을 고쳐야 했고, 계약 시작일은 파트너 매장 탭에서 매장을 찾아 고쳐야 했다.
 * 날짜를 보고 있는 자리에서 바로 적을 수 있어야 한다.
 *
 * **어디에 쓰이나 — 새 저장소를 만들지 않는다.** 여기서 적은 값은 전부 기존 원본으로 들어간다.
 *   · 미팅 · 기한 → 파트너 후보의 `meeting_at` · `due` (파트너 후보 탭에서 보이는 그 칸)
 *   · 계약 시작  → 파트너 매장의 `contract_started_on` (파트너 매장 탭 상세의 그 칸)
 *   · 후보를 골라 계약 시작을 적으면 **파트너 전환까지 같이** 한다 — 파트너 매장 탭의 '매장 추가'와 같은 경로로
 *     매장이 만들어지고, 후보 카드는 '계약 완료'로 넘어간다.
 *
 * 그래서 저장한 뒤에는 달력·파트너 후보·파트너 매장·입금 현황이 한꺼번에 같은 값을 본다.
 */

type Kind = "meeting" | "due" | "contract";

const KIND_LABEL: Record<Kind, string> = { meeting: "미팅", due: "기한", contract: "계약 시작" };

/** 라벨 + 설명이 붙은 묶음. Field 는 <label> 이라 버튼 묶음(Segmented)을 넣으면 안 된다. */
function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[12px] font-semibold text-gray-700 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-gray-500 mt-1">{hint}</span>}
    </div>
  );
}

/** "2026-09-16" → "9월 16일 (화)" */
function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}

/** 이름이 겹쳐도 고를 수 있게 — datalist 값은 사람이 읽는 라벨이고, 되찾을 때는 이 지도를 쓴다. */
function labelOf(name: string, extra?: string | null): string {
  return extra ? `${name} · ${extra}` : name;
}

export default function QuickAdd({
  date,
  leads,
  stores,
  actor,
  onClose,
  onSaved,
}: {
  date: string;
  leads: Lead[];
  stores: StoreRow[];
  actor?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<Kind>("meeting");
  /** 미팅·기한: 기존 후보 / 새 후보. 계약 시작: 기존 파트너 매장 / 후보에서 전환. */
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [campus, setCampus] = useState<Campus>(CAMPUSES[0]);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [tier, setTier] = useState("BOOST");
  const [billingStart, setBillingStart] = useState(date.slice(0, 7));
  const [moveStage, setMoveStage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 후보 목록 — 이미 끝난 단계는 미팅·기한을 잡을 일이 없다. */
  const openLeads = useMemo(
    () => leads.filter((l) => !["거절", "계약 완료"].includes(l.stage)),
    [leads]
  );
  const partnerStores = useMemo(
    () => stores.filter((s) => s.is_affiliate && !s.ops?.is_test),
    [stores]
  );

  /** 계약 시작은 후보 중에서도 고를 수 있다 — 고르면 파트너 매장으로 만들어 준다. */
  const options = useMemo(() => {
    if (kind === "contract" && mode === "pick") {
      return partnerStores.map((s) => ({ value: labelOf(s.name, s.ops?.campus), key: `store:${s.restaurant_id}` }));
    }
    if (kind === "contract") {
      return openLeads.map((l) => ({ value: labelOf(l.name, l.campus), key: `lead:${l.id}` }));
    }
    return openLeads.map((l) => ({ value: labelOf(l.name, l.campus), key: `lead:${l.id}` }));
  }, [kind, mode, openLeads, partnerStores]);

  const resolved = useMemo(() => options.find((o) => o.value === pick.trim())?.key ?? null, [options, pick]);

  /** 고른 후보의 지금 단계 — '미팅 예정'으로 옮길지 물어보는 데 쓴다. */
  const pickedLead = useMemo(() => {
    if (!resolved?.startsWith("lead:")) return null;
    return openLeads.find((l) => l.id === resolved.slice(5)) ?? null;
  }, [resolved, openLeads]);
  const stageWouldMove =
    kind === "meeting" && pickedLead != null && ["미컨택", "컨택 중", "미팅 조율"].includes(pickedLead.stage);

  const needsName = (kind !== "contract" && mode === "new");
  const canSave = needsName ? newName.trim().length > 0 : resolved !== null;

  /** 미팅 일시는 "2026-09-16 14:00" 처럼 적는다 — 달력이 읽는 형식이고, 시트 자유 서식과도 섞이지 않는다. */
  const meetingAt = time ? `${date} ${time}` : date;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const json = { "Content-Type": "application/json" };

      // ── 1) 새 후보로 미팅·기한 잡기
      if (needsName) {
        const body: Record<string, unknown> = {
          name: newName.trim(),
          campus,
          owner: actor ?? null,
          stage: kind === "meeting" ? "미팅 예정" : "컨택 중",
        };
        if (kind === "meeting") body.meeting_at = meetingAt;
        else { body.due = date; if (note.trim()) body.next_action = note.trim(); }
        const res = await fetch("/api/astro/leads", { method: "POST", headers: json, body: JSON.stringify(body) });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).detail ?? "후보를 만들지 못했습니다."); return; }
        onSaved(); onClose(); return;
      }

      // ── 2) 기존 후보의 미팅·기한
      if (kind !== "contract") {
        const id = resolved!.slice(5);
        const body: Record<string, unknown> = kind === "meeting"
          ? { meeting_at: meetingAt }
          : { due: date, ...(note.trim() ? { next_action: note.trim() } : {}) };
        if (kind === "meeting" && moveStage && stageWouldMove) body.stage = "미팅 예정";
        const res = await fetch(`/api/astro/leads/${id}`, { method: "PATCH", headers: json, body: JSON.stringify(body) });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).detail ?? "저장하지 못했습니다."); return; }
        onSaved(); onClose(); return;
      }

      // ── 3) 계약 시작 — 이미 파트너 매장이면 날짜만 적는다
      let rid: number | null = null;
      if (resolved!.startsWith("store:")) {
        rid = Number(resolved!.slice(6));
      } else {
        // 후보를 골랐다면 파트너 매장으로 전환한다 (파트너 매장 탭의 '매장 추가'와 같은 경로)
        const res = await fetch("/api/astro/convert", {
          method: "POST", headers: json,
          body: JSON.stringify({ lead_id: resolved!.slice(5), tier, updated_by: actor }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setError(d.detail ?? "파트너 매장으로 전환하지 못했습니다."); return; }
        rid = d.restaurant_id ?? null;
      }
      if (rid === null) { setError("매장 ID 를 받지 못했습니다."); return; }

      const res = await fetch(`/api/astro/stores/${rid}`, {
        method: "PATCH", headers: json,
        body: JSON.stringify({ contract_started_on: date, billing_start_period: billingStart, updated_by: actor }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).detail ?? "계약 시작일을 저장하지 못했습니다."); return; }
      onSaved(); onClose();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const pickLabel =
    kind === "contract"
      ? (mode === "pick" ? "파트너 매장" : "파트너 후보")
      : "파트너 후보";

  return (
    <SlideOver
      open
      onClose={onClose}
      title={`${dayLabel(date)} 등록`}
      subtitle="여기서 적은 값은 파트너 후보·파트너 매장의 같은 칸으로 들어갑니다."
      footer={
        <>
          <Button variant="primary" onClick={save} disabled={!canSave || saving}>
            {saving ? "저장 중…" : `${KIND_LABEL[kind]} 등록`}
          </Button>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          {error && <span className="text-[12px] text-red-600 ml-auto" role="alert">{error}</span>}
        </>
      }
    >
      <Group label="무엇을 잡나">
        <Segmented
          label="일정 종류"
          value={kind}
          onChange={(v) => { setKind(v); setPick(""); setMode("pick"); }}
          options={[
            { key: "meeting" as Kind, label: "미팅" },
            { key: "due" as Kind, label: "기한" },
            { key: "contract" as Kind, label: "계약 시작" },
          ]}
        />
      </Group>

      {kind === "contract" ? (
        <Group
          label="어디에"
          hint={mode === "pick"
            ? "이미 파트너인 매장의 계약 시작일을 적습니다."
            : "후보를 고르면 파트너 매장으로 만들고(파트너 매장 탭 '매장 추가'와 같은 경로) 계약 시작일까지 적습니다."}
        >
          <Segmented
            label="대상 종류"
            value={mode}
            onChange={(v) => { setMode(v); setPick(""); }}
            options={[
              { key: "pick" as const, label: "기존 파트너 매장" },
              { key: "new" as const, label: "후보에서 전환" },
            ]}
          />
        </Group>
      ) : (
        <Group label="누구와" hint="목록에 없으면 새 후보로 바로 만들 수 있습니다.">
          <Segmented
            label="대상 종류"
            value={mode}
            onChange={(v) => { setMode(v); setPick(""); }}
            options={[
              { key: "pick" as const, label: "기존 후보" },
              { key: "new" as const, label: "새 후보" },
            ]}
          />
        </Group>
      )}

      {needsName ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="매장명" required>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 라라더" autoFocus />
          </Field>
          <Field label="캠퍼스">
            <Select value={campus} onChange={(e) => setCampus(e.target.value)}>
              {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      ) : (
        <Field
          label={pickLabel}
          required
          hint={pick.trim() && !resolved ? "목록에서 골라 주세요 — 이름이 정확히 맞아야 저장합니다." : `${options.length}곳`}
        >
          <Input
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            list="quickadd-targets"
            placeholder="이름으로 찾기"
            autoFocus
          />
          <datalist id="quickadd-targets">
            {options.map((o) => <option key={o.key} value={o.value} />)}
          </datalist>
        </Field>
      )}

      {kind === "meeting" && (
        <Field label="시간" hint="비워 두면 날짜만 적습니다.">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
        </Field>
      )}

      {kind === "meeting" && stageWouldMove && (
        <label className="flex items-start gap-2 text-[13px] text-gray-700">
          <input type="checkbox" checked={moveStage} onChange={(e) => setMoveStage(e.target.checked)} className="mt-0.5" />
          <span>단계를 <b>미팅 예정</b>으로 옮깁니다 (지금 {pickedLead?.stage}). 슬랙에도 알립니다.</span>
        </label>
      )}

      {kind === "due" && (
        <Field label="할 일" hint="후보 카드의 '다음 할 일' 칸에 들어갑니다.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 견적서 회신 확인" />
        </Field>
      )}

      {kind === "contract" && (
        <div className="grid grid-cols-2 gap-3">
          {mode === "new" && (
            <Field label="플랜">
              <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="FREE">FREE</option>
                <option value="BOOST">BOOST</option>
                <option value="CONTENT">CONTENT</option>
              </Select>
            </Field>
          )}
          <Field label="청구 시작 월" hint="월 중간에 들어온 매장은 다음 달부터가 보통입니다.">
            <Select value={billingStart} onChange={(e) => setBillingStart(e.target.value)}>
              <option value={date.slice(0, 7)}>이번 달부터 ({Number(date.slice(5, 7))}월)</option>
              <option value={periodLocal(1)}>다음 달부터 ({Number(periodLocal(1).slice(5))}월)</option>
            </Select>
          </Field>
        </div>
      )}

      {kind === "contract" && (
        <Notice tone="blue" title="입금 현황도 같이 움직입니다">
          계약 시작일을 적으면 그 날의 &lsquo;일&rsquo;을 기준으로 매달 입금 예정이 달력에 찍히고, 입금 현황 탭에 행이 생깁니다.
          유료 플랜이고 월납일 때만입니다.
        </Notice>
      )}
    </SlideOver>
  );
}
