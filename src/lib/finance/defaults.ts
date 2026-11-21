import type { ExpenseItem } from "./types";

/**
 * 기본 출금 항목 — 처음 화면을 열면 깔리는 고정 비용 목록.
 *
 * **금액은 비워 둔다.** 실제로 얼마가 나가는지 이 저장소 어디에도 적혀 있지 않다. 지어낸 숫자를 넣으면
 * 합계가 그 숫자에 끌려간다 — 「모름」은 모름으로 두고 사람이 채운다(pricing.ts 와 같은 규칙).
 * 항목 이름은 저장소가 실제로 쓰는 것에서 왔다: 식사권 대금(계약 제6조) · Koyeb/Vercel/GCP(배포·지표) · 알림톡(alimtalk.ts) · 볼타(세금계산서).
 *
 * 깔리는 것도 백엔드 DB 다. `key` 가 같은 항목은 두 번 만들어지지 않는다.
 */
export type DefaultItem = Pick<ExpenseItem, "key" | "name" | "category" | "cycle" | "pay_day" | "memo">;

export const DEFAULT_ITEMS: DefaultItem[] = [
  {
    key: "default:meal-voucher",
    name: "당첨 식사권 대금 정산",
    category: "식사권",
    cycle: "MONTHLY",
    pay_day: 10,
    memo: "계약 제6조 — 말일 매장별 통지, 다음 달 10일까지 지급. 사용 장수는 Probe › 마일리지 추첨에서 확인합니다.",
  },
  {
    key: "default:infra",
    name: "서버 · 인프라",
    category: "인프라",
    cycle: "MONTHLY",
    pay_day: null,
    memo: "Koyeb · Vercel · GCP(BigQuery) · AWS(S3) 등. 서비스별로 나누려면 항목을 추가하세요.",
  },
  {
    key: "default:messaging",
    name: "알림톡 · 문자 발송",
    category: "도구·구독",
    cycle: "MONTHLY",
    pay_day: null,
    memo: null,
  },
  {
    key: "default:tax-invoice",
    name: "세금계산서 발행(볼타)",
    category: "세금·수수료",
    cycle: "MONTHLY",
    pay_day: null,
    memo: null,
  },
];
