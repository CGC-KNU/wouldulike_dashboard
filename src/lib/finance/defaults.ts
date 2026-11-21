import type { ExpenseItem } from "./types";

/**
 * 기본 출금 항목 — 처음 화면을 열면 깔리는 반복 항목 목록.
 *
 * **금액은 비워 둔다.** 실제로 얼마가 나가는지 이 저장소 어디에도 적혀 있지 않다. 지어낸 숫자를 넣으면
 * 합계가 그 숫자에 끌려간다 — 「모름」은 모름으로 두고 사람이 채운다(pricing.ts 와 같은 규칙).
 * 항목 이름은 저장소가 실제로 쓰는 것에서 왔다: 식사권 대금(계약 제6조) · Koyeb/Vercel/GCP(배포·지표) · 알림톡(alimtalk.ts) · 볼타(세금계산서).
 *
 * 깔리는 것도 백엔드 DB 다. `key` 가 같은 항목은 두 번 만들어지지 않는다.
 *
 * 행동 방식 · 회계 위치는 설계 04절 분류 기준표대로 매긴다 —
 * 식사권 = 유료 매장 수에 비례하는 변동비 · 판촉(S&M) / 서버 = 기본료 + 사용량(준변동) · COGS(권장) /
 * 알림톡 = 발송 건수 변동 · 점주 알림이라 COGS / 볼타 = 발행 건수 준변동 · G&A.
 */
export type DefaultItem = Pick<ExpenseItem, "key" | "name" | "category" | "cycle" | "pay_day" | "memo" | "behavior" | "account">;

export const DEFAULT_ITEMS: DefaultItem[] = [
  {
    key: "default:meal-voucher",
    behavior: "VARIABLE",
    account: "S&M",
    name: "당첨 식사권 대금 정산",
    category: "식사권",
    cycle: "MONTHLY",
    pay_day: 10,
    memo: "계약 제6조 — 말일 매장별 통지, 다음 달 10일까지 지급. 사용 장수는 Probe › 마일리지 추첨에서 확인합니다.",
  },
  {
    key: "default:infra",
    behavior: "SEMI_VARIABLE",
    account: "COGS",
    name: "서버 · 인프라",
    category: "인프라",
    cycle: "MONTHLY",
    pay_day: null,
    memo: "Koyeb · Vercel · GCP(BigQuery) · AWS(S3) 등. 서비스별로 나누려면 항목을 추가하세요.",
  },
  {
    key: "default:messaging",
    behavior: "VARIABLE",
    account: "COGS",
    name: "알림톡 · 문자 발송",
    category: "도구·구독",
    cycle: "MONTHLY",
    pay_day: null,
    memo: null,
  },
  {
    key: "default:tax-invoice",
    behavior: "SEMI_VARIABLE",
    account: "G&A",
    name: "세금계산서 발행(볼타)",
    category: "세금·수수료",
    cycle: "MONTHLY",
    pay_day: null,
    memo: null,
  },
];
