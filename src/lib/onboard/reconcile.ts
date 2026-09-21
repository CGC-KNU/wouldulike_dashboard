import { sheetRead } from "./records";

/**
 * 온보딩 결과 → **매장 파이프라인 반영.**
 *
 * ## 왜 점주 쪽에서 못 하나
 * 백엔드 `astro/*` 는 읽기를 빼고 전부 `_is_admin` 이다 (wouldulike_backend astro/views.py).
 * 점주 JWT 에는 그 클레임이 없으므로, 완료 라우트가 아무리 PATCH 를 보내도 403 이다.
 * 거기서 쓰는 코드는 재민이 경로를 열어 줄 때까지 헛것이다.
 *
 * ## 그래서 관리자 쪽에서 맞춘다
 * 완료 기록은 우리가 통제하는 시트(`온보딩기록`)에 이미 남는다. 담당자가 세틀라이트를 열고 있을 때
 * 그 원장을 읽어 매장 운영 행과 대조하고, 비어 있는 칸을 채운다. 백엔드가 열리면 이 경로는
 * 그냥 할 일이 없어질 뿐 — 지워야 할 코드가 되지 않는다.
 *
 * ## 덮어쓰지 않는다
 * 사람이 이미 적어 둔 값은 건드리지 않는다. 다르면 **다르다고 말만 한다**(`conflicts`).
 * 온보딩이 맞고 손으로 적은 게 틀린 경우도, 그 반대도 있다 — 기계가 고를 일이 아니다.
 * 이 원칙은 매장 패널의 `Mismatch` 와 같다.
 */

/** 시트 한 줄 → 우리가 쓰는 모양. 열 순서는 records.ts 의 sheetAppend 와 1:1 이다. */
export interface LedgerRow {
  at: string; kind: string; short_id: string; rid: number; lid: string;
  name: string; campus: string; plan: string; fee: number;
  owner_name: string; biz_no: string; phone: string; phone_verified: string;
  email: string; kakao_id: string; signature: string;
  terms_version: string; terms_hash: string; checks: string; ip: string; ua: string;
  stamp_ok: string; kit_address: string; starts_on: string;
}

const COLS = ["at", "kind", "short_id", "rid", "lid", "name", "campus", "plan", "fee", "owner_name", "biz_no", "phone", "phone_verified", "email", "kakao_id", "signature", "terms_version", "terms_hash", "checks", "ip", "ua", "stamp_ok", "kit_address", "starts_on"] as const;

export async function readLedger(): Promise<LedgerRow[]> {
  const values = await sheetRead(`A2:X10000`);
  const out: LedgerRow[] = [];
  for (const r of values) {
    const o = {} as Record<string, unknown>;
    COLS.forEach((c, i) => (o[c] = r[i] ?? ""));
    const rid = Number(o.rid);
    if (!rid || !o.at) continue;
    o.rid = rid; o.fee = Number(o.fee) || 0;
    out.push(o as unknown as LedgerRow);
  }
  return out;
}

/** 매장별로 접는다 — 마지막 consent 와 마지막 complete/revise 가 현재 상태다. */
export interface Folded { rid: number; name: string; consent: LedgerRow | null; done: LedgerRow | null }
export function foldByStore(rows: LedgerRow[]): Folded[] {
  const m = new Map<number, Folded>();
  for (const r of rows) {
    const f = m.get(r.rid) ?? { rid: r.rid, name: r.name, consent: null, done: null };
    if (r.kind === "consent") f.consent = r;
    else if (r.kind === "complete" || r.kind === "revise") f.done = r;
    f.name = r.name || f.name;
    m.set(r.rid, f);
  }
  return [...m.values()];
}

/* ── 대조 ───────────────────────────────────────────────────────── */

export interface OpsLike {
  owner_name?: string | null; owner_phone?: string | null; owner_email?: string | null; biz_no?: string | null;
  monthly_fee?: number | null; pay_cycle?: string | null;
  contract_started_on?: string | null; contract_signed_on?: string | null; billing_start_period?: string | null;
  kit_note?: string | null;
}

export interface Diff {
  rid: number; name: string;
  /** 비어 있어서 채울 값 */
  fill: Record<string, string | number>;
  /** 이미 다른 값이 있어 건드리지 않은 것 — 사람이 판단한다 */
  conflicts: { field: string; label: string; ours: string; theirs: string }[];
  /** 후보 단계를 옮겨야 하는가 */
  lead: { lid: string; to: string } | null;
  /** 매장 본체(제휴·플랜) */
  store: { tier?: string; is_affiliate?: boolean };
}

const LABEL: Record<string, string> = {
  owner_name: "대표자", owner_phone: "대표자 연락처", owner_email: "세금계산서 이메일", biz_no: "사업자등록번호",
  monthly_fee: "월 이용료", pay_cycle: "납부 방식",
  contract_started_on: "계약 시작일", contract_signed_on: "계약일", billing_start_period: "청구 시작 월",
  kit_note: "홍보물 수령",
};

const digits = (s: string) => (s ?? "").replace(/\D/g, "");

/**
 * 한 매장의 온보딩 기록과 현재 운영 행을 대조한다.
 * 비교는 **정규화해서** 한다 — 시트에는 하이픈이 들어간 문자열이, 툴에는 숫자만 있을 수 있다.
 */
export function diffStore(f: Folded, ops: OpsLike | null, tier: string | null, is_affiliate: boolean): Diff | null {
  const done = f.done;
  if (!done) return null; // 아직 완료하지 않은 매장 — 반영할 것이 없다

  const want: Record<string, string | number> = {};
  const add = (k: string, v: string | number | null | undefined) => { if (v !== null && v !== undefined && v !== "") want[k] = v; };

  add("owner_name", done.owner_name);
  add("owner_phone", done.phone);
  add("owner_email", done.email);
  add("biz_no", done.biz_no);
  add("contract_started_on", done.starts_on);
  add("contract_signed_on", (f.consent?.at ?? done.at).slice(0, 10));
  add("kit_note", done.kit_address);
  if (done.fee > 0) { add("monthly_fee", done.fee); add("pay_cycle", "MONTHLY"); }
  if (done.fee > 0 && done.starts_on) add("billing_start_period", done.starts_on.slice(0, 7));

  const fill: Diff["fill"] = {};
  const conflicts: Diff["conflicts"] = [];
  for (const [k, v] of Object.entries(want)) {
    const cur = (ops as Record<string, unknown> | null)?.[k];
    const curStr = cur === null || cur === undefined ? "" : String(cur);
    if (!curStr) { fill[k] = v; continue; }
    const same = k === "biz_no" || k === "owner_phone"
      ? digits(curStr) === digits(String(v))
      : curStr === String(v);
    if (!same) conflicts.push({ field: k, label: LABEL[k] ?? k, ours: String(v), theirs: curStr });
  }

  // 후보 단계 — 계약을 마쳤으면 파이프라인에서도 끝난 자리에 있어야 한다
  const lead = done.lid ? { lid: done.lid, to: "계약 완료" } : null;

  // 매장 본체 — 제휴 켜기 + 플랜 맞추기. FREE 도 제휴 매장이다(앱에 나간다).
  const wantTier = done.plan === "BOOST" ? "BOOST" : done.plan === "PREMIUM" ? "CONTENT" : "FREE";
  const store: Diff["store"] = {};
  if (!is_affiliate) store.is_affiliate = true;
  if ((tier ?? "") !== wantTier) store.tier = wantTier;

  if (!Object.keys(fill).length && !conflicts.length && !lead && !Object.keys(store).length) return null;
  return { rid: f.rid, name: f.name, fill, conflicts, lead, store };
}

/** 사람이 읽을 한 줄 — 화면과 슬랙이 같은 문장을 쓴다. */
export function describe(d: Diff): string {
  const bits: string[] = [];
  const n = Object.keys(d.fill).length;
  if (n) bits.push(`${Object.keys(d.fill).map((k) => LABEL[k] ?? k).join(" · ")} 채움`);
  if (d.store.is_affiliate) bits.push("제휴 켜기");
  if (d.store.tier) bits.push(`플랜 ${d.store.tier}`);
  if (d.lead) bits.push("후보 → 계약 완료");
  if (d.conflicts.length) bits.push(`값이 다른 칸 ${d.conflicts.length}개(그대로 둠)`);
  return bits.join(" · ");
}
