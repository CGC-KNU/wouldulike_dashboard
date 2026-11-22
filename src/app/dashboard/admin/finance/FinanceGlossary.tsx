"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Card, Chip, FilterPills, Input, PageHeader } from "../_shared/ui";

/**
 * 재무 · 용어 정리 (1122 민열님: "재무 현황 밑에 용어 정리 탭 — CAC, MRR 등 중요한 용어").
 *
 * 재무 현황 화면에 나오는 말과, 앞으로 넣을 유닛 이코노믹스 · 시장 규모 말을 한곳에.
 * 산식은 설계 보고서(CGC/02_전략_회의/리서치/1121_에테르_재무장표_개선_설계) 부록 A 와 같다 — 화면 계산(lib/finance/calc.ts)도 이걸 따른다.
 * 「우리 기준」은 우주라이크에서 어떻게 세는지, 「주의」는 흔히 틀리는 곳. 숫자(실적)는 여기 두지 않는다 — 공개 저장소다.
 */

type Group = "현금 · 런웨이" | "매출" | "비용" | "유닛 이코노믹스" | "시장 · 계획";
interface Term { term: string; en?: string; group: Group; def: string; formula?: string; ours?: string; caution?: string; onScreen?: boolean }

const TERMS: Term[] = [
  // ── 현금 · 런웨이
  { term: "가용 현금", en: "Available cash", group: "현금 · 런웨이", onScreen: true,
    def: "지금 당장 운영에 쓸 수 있는 돈. 통장에 있다고 다 쓸 수 있는 돈이 아니다.",
    formula: "월말 통장 잔고 합 − 부가세 예수금 − 지원금 전용 잔액 − 묶인 돈(보증금 등)",
    ours: "달마다 마지막 날 통장 잔고를 「월말 잔고」에 적으면 계산된다.",
    caution: "부가세로 받은 돈은 나중에 낼 돈이라 빼야 한다. 지원금은 정해진 데만 쓸 수 있어 뺀다." },
  { term: "총번", en: "Gross burn", group: "현금 · 런웨이", onScreen: true,
    def: "한 달 동안 나간 돈 전부.", formula: "그달 현금 유출 합계 (자금 조달 상환 제외)" },
  { term: "순번", en: "Net burn", group: "현금 · 런웨이", onScreen: true,
    def: "한 달에 실제로 줄어드는 돈. 런웨이는 이걸로 계산한다.",
    formula: "영업으로 나간 돈 − 영업으로 들어온 돈",
    ours: "기본은 최근 3개 마감월 평균. 화면에서 지난달 · 6개월로 바꿀 수 있다.",
    caution: "SAFE · 지원금 · 상금 · 대출로 들어온 돈은 넣지 않는다. 넣으면 그달만 번이 0처럼 보인다." },
  { term: "운영 번", en: "Operating burn", group: "현금 · 런웨이", onScreen: true,
    def: "한 번만 나간 돈(장비 · 상권 진입 출장비 등)을 뺀 순번. 평소 체력을 본다.",
    formula: "순번 − 일회성 지출", caution: "일회성으로 빼려면 그 지출을 「일회성」 반복 항목에서 기록해야 한다." },
  { term: "런웨이", en: "Runway", group: "현금 · 런웨이", onScreen: true,
    def: "지금 속도로 돈을 쓰면 몇 개월 버티는가.",
    formula: "가용 현금 ÷ 순번(선택한 기준) · 순번 ≤ 0 이면 흑자 — 해당 없음",
    ours: "12개월 이상 초록 · 6~12개월 노랑(조달 착수) · 6개월 미만 빨강.",
    caution: "평균 기간에 따라 숫자가 달라진다(지난달 · 3개월 · 6개월). 어떤 기준인지 같이 읽는다." },
  { term: "소진 예상월", en: "Cash zero date", group: "현금 · 런웨이", onScreen: true,
    def: "런웨이가 끝나는 달. 개월 수보다 날짜로 보면 마일스톤과 비교하기 쉽다.",
    formula: "기준월 + 런웨이(개월)" },
  { term: "조달 착수 마감선", group: "현금 · 런웨이",
    def: "늦어도 이때는 투자 · 지원금 준비를 시작해야 하는 날.",
    formula: "소진 예상월 − 조달에 걸리는 기간(기본 4개월, 3~6개월)",
    caution: "조달은 보통 3~6개월 걸린다. 런웨이 12개월이 남았을 때 시작하는 게 안전하다." },
  { term: "Default alive", group: "현금 · 런웨이",
    def: "지금 비용을 그대로 두고 매출이 지금 속도로 늘면, 돈이 떨어지기 전에 흑자가 되는가. 예/아니오로 답한다.",
    formula: "최근 3개월 MRR 성장률이 이어질 때, 소진 예상월 전에 MRR ≥ 월 비용인가 (Paul Graham, 2015)" },
  { term: "대사", en: "Reconciliation", group: "현금 · 런웨이", onScreen: true,
    def: "통장 실제 잔고와 장부로 계산한 잔고를 맞춰 보는 일.",
    ours: "1만 원 넘게 다르면 「대사 필요」. 장부에 안 적힌 입출금이 있다는 뜻이다." },
  { term: "자금 조달 이벤트", group: "현금 · 런웨이", onScreen: true,
    def: "SAFE · 지원금 · 상금 · 대출로 돈이 들어오는 일. 예정 → 확정 → 입금으로 상태를 바꾼다.",
    caution: "「입금」만 잔고에 들어간 돈으로 본다. 예정 · 확정은 아직 없는 돈이다." },
  // ── 매출
  { term: "공급가", en: "Supply value", group: "매출", onScreen: true,
    def: "부가세를 뺀 값. 매출은 공급가로 센다.", formula: "세금계산서 합계 ÷ 1.1 (= 합계 − 세액)",
    caution: "통장에 들어온 돈(합계)을 매출로 보면 10% 크게 보인다." },
  { term: "부가세 예수금", en: "VAT payable", group: "매출", onScreen: true,
    def: "손님(점주)에게 받아 두었다가 나라에 내야 하는 부가세.",
    ours: "1 · 7월 25일 확정신고에 낸다. 지금 화면은 매입세액을 아직 빼지 않아 실제보다 크게 잡힌다." },
  { term: "MRR", en: "Monthly Recurring Revenue", group: "매출", onScreen: true,
    def: "매달 반복해서 들어오는 구독 매출.", formula: "그달에 귀속되는 구독료 공급가 합 (스팟 · 셋업 제외)",
    ours: "Boost · Premium 월 이용료. 스팟 제작은 반복이 아니라 따로 센다." },
  { term: "ARR", en: "Annual Recurring Revenue", group: "매출", def: "MRR × 12. 1년치 반복 매출 환산." },
  { term: "ARPA", en: "Average Revenue Per Account", group: "매출", onScreen: true,
    def: "유료 매장 한 곳이 한 달에 내는 평균 금액.", formula: "MRR ÷ 월말 유료 매장 수" },
  { term: "이탈률", en: "Churn rate", group: "매출",
    def: "한 달 동안 유료를 그만둔 매장 비율.", formula: "그달 해지 매장 ÷ 월초 유료 매장 (그달 가입 · 해지 제외)",
    ours: "해지 사유를 폐업 · 자발 · 결제 실패로 나눠 적어야 원인이 보인다.",
    caution: "방학 0원(학기 운영)은 해지가 아니라 쉬는 것 — 따로 센다." },
  { term: "3개월 유지율", group: "매출",
    def: "유료로 시작한 매장 중 3개월 뒤에도 유료인 비율. 학기 숫자 표의 목표가 80%+.",
    formula: "시작 후 3개월째 유료 매장 ÷ 같은 달 시작한 유료 매장" },
  { term: "NRR", en: "Net Revenue Retention", group: "매출",
    def: "작년(또는 지난 기간) 매장들이 지금 내는 매출 ÷ 그때 낸 매출. 업셀이 해지를 넘으면 100% 이상.",
    ours: "무료 → 유료 · Boost → Premium 업셀이 이 숫자를 올린다." },
  // ── 비용
  { term: "고정비 · 변동비", group: "비용", onScreen: true,
    def: "매출과 상관없이 나가는 돈(고정)과 매장 · 사용량에 따라 늘어나는 돈(변동).",
    ours: "반복 항목마다 고정 / 변동 / 준변동 / 일회성을 매긴다. 거래 한 건에서는 못 바꾼다.",
    caution: "판정 질문: 매출이 0이면 이 비용도 0인가? 매출이 두 배면 두 배인가?" },
  { term: "준변동비", group: "비용", def: "기본료 + 쓴 만큼. 서버 · 세금계산서 발행처럼.", ours: "기본료와 단가 × 수량 두 줄로 나눠 본다." },
  { term: "COGS", en: "매출원가", group: "비용", onScreen: true,
    def: "서비스를 점주에게 주는 데 직접 드는 비용.", ours: "서버 · 알림톡 · 유지용 스팟 외주 · PG 수수료.",
    caution: "판정 질문: 이 비용을 안 쓰면 점주가 서비스를 못 받는가?" },
  { term: "S&M · R&D · G&A", group: "비용", onScreen: true,
    def: "영업 · 마케팅(S&M), 개발(R&D), 일반 관리(G&A) 비용.", ours: "식사권 · 경품 · 마케팅 집행 · 상권 진입 출장비는 S&M, 세무 · 도구 구독은 G&A." },
  { term: "매출총이익률", en: "Gross margin", group: "비용",
    def: "매출에서 매출원가를 뺀 비율. 높을수록 매장이 늘 때 남는 돈이 많다.", formula: "(매출 − COGS) ÷ 매출" },
  { term: "공헌이익", en: "Contribution margin", group: "비용",
    def: "매장 한 곳에서 받는 돈 − 그 매장 때문에 나가는 변동비. 고정비를 갚는 데 쓰이는 몫.",
    formula: "ARPA − 매장당 변동비(식사권 · 알림톡 · 서버 몫 · PG 등)" },
  { term: "손익분기 매장 수", en: "Break-even", group: "비용",
    def: "몇 곳이 유료면 한 달 비용을 다 덮는가.", formula: "월 고정비 ÷ 매장당 공헌이익" },
  // ── 유닛 이코노믹스
  { term: "CAC", en: "Customer Acquisition Cost", group: "유닛 이코노믹스",
    def: "유료 매장 한 곳을 데려오는 데 든 돈.",
    formula: "(영업 시간 × 시간 단가 + S&M 현금 지출 + 적자 스팟 손실) ÷ 신규 유료 매장",
    ours: "영업은 사람이 찾아가서 하므로 시간 비용이 크다 — 영업 시간을 기록해야 한다.",
    caution: "시간을 안 세면 CAC 가 0원에 가깝게 나와 착각한다." },
  { term: "CAC 회수기간", en: "Payback period", group: "유닛 이코노믹스",
    def: "데려온 매장이 낸 돈으로 CAC 를 되찾는 데 걸리는 개월 수.", formula: "CAC ÷ (ARPA × 매출총이익률)",
    caution: "참고: Toast 22개월(2019) → 14개월(2023). 12개월 안이면 건강하다는 게 보통 기준." },
  { term: "LTV", en: "Lifetime Value", group: "유닛 이코노믹스",
    def: "매장 한 곳이 머무는 동안 남기는 총이익.", formula: "ARPA × 매출총이익률 ÷ 월 이탈률" },
  { term: "LTV/CAC", group: "유닛 이코노믹스",
    def: "한 곳 데려오는 데 쓴 돈의 몇 배를 버는가.", caution: "3배 이상이 흔한 기준. 이탈률이 작게 잡히면 LTV 가 부풀려진다." },
  { term: "코호트", en: "Cohort", group: "유닛 이코노믹스",
    def: "같은 달에 시작한 매장 묶음. 묶음별로 몇 달 뒤 남는지 보면 유지가 좋아지는지 보인다." },
  // ── 시장 · 계획
  { term: "TAM", en: "Total Addressable Market", group: "시장 · 계획",
    def: "이론상 전체 시장 — 우리 서비스를 쓸 수 있는 모든 매장이 다 쓴다면.",
    ours: "허블 대학 상권 1km 식당 수 × Boost 연간 금액 (10-12 확정 기준). 서울은 TAM 에만." },
  { term: "SAM", en: "Serviceable Available Market", group: "시장 · 계획",
    def: "그중 우리가 실제로 갈 수 있는 시장.", ours: "로드맵 권역(대구 · 경북 → 부산 → 충청)의 실제 식당 수로 센다. 비율(예: 10%)로 내지 않는다." },
  { term: "SOM", en: "Serviceable Obtainable Market", group: "시장 · 계획",
    def: "가까운 기간에 실제로 가져올 수 있는 몫.", ours: "대구 3상권(경북대 · 영남대 · 계명대) 목표 매장 수 기준." },
  { term: "계획 대비 실적", en: "BvA · Budget vs Actual", group: "시장 · 계획",
    def: "런웨이 모델(계획)과 실제 숫자의 차이.", ours: "항목별 ±10% 넘으면 노랑, ±20% 빨강. 차이 10만 원 미만은 무시.",
    caution: "결제가 한 달 밀린 「시점 차이」와 진짜 「금액 차이」를 나눠 본다." },
  { term: "마일스톤", group: "시장 · 계획",
    def: "다음 단계를 여는 숫자(학기 숫자 표). 소진 예상월보다 먼저 와야 한다.",
    ours: "메인 「목표 보기」 표가 정본. 마일스톤 도달일이 조달 착수 마감선보다 늦으면 위험." },
];

const GROUPS: Group[] = ["현금 · 런웨이", "매출", "비용", "유닛 이코노믹스", "시장 · 계획"];

export default function FinanceGlossary() {
  const [q, setQ] = useState("");
  const [g, setG] = useState<Group | "all">("all");
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return TERMS.filter((t) => (g === "all" || t.group === g) && (!k || [t.term, t.en, t.def, t.formula, t.ours].some((x) => x?.toLowerCase().includes(k))));
  }, [q, g]);

  return (
    <>
      <PageHeader title="용어 정리" description="재무 현황에 나오는 말과 앞으로 볼 지표. 산식 · 우주라이크에서 세는 법 · 흔히 틀리는 곳을 같이 적었습니다." />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative w-full sm:w-72">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="CAC, 런웨이, 공급가…" aria-label="용어 찾기" className="pl-8" />
        </div>
        <FilterPills<Group | "all"> label="묶음" soft value={g} onChange={setG}
          options={[{ key: "all", label: "전체", count: TERMS.length }, ...GROUPS.map((x) => ({ key: x, label: x, count: TERMS.filter((t) => t.group === x).length }))]} />
      </div>
      {list.length === 0 ? <p className="text-[13px] text-gray-500 py-8 text-center">찾는 용어가 없습니다.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((t) => (
            <Card key={t.term}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] font-bold text-gray-900 tracking-[-0.01em]">{t.term}{t.en && <span className="ml-1.5 text-[12px] font-medium text-gray-400">{t.en}</span>}</h3>
                <div className="flex gap-1 shrink-0">{t.onScreen && <Chip tone="navy">화면에 있음</Chip>}<Chip tone="gray">{t.group}</Chip></div>
              </div>
              <p className="mt-1.5 text-[13.5px] text-gray-800 leading-relaxed">{t.def}</p>
              {t.formula && <p className="mt-2 rounded-[10px] bg-black/[0.04] px-3 py-2 text-[12.5px] text-gray-800 font-medium tabular-nums">{t.formula}</p>}
              {t.ours && <p className="mt-2 text-[12.5px] text-gray-600 leading-relaxed"><b className="text-navy">우리 기준</b> · {t.ours}</p>}
              {t.caution && <p className="mt-1 text-[12.5px] text-gray-600 leading-relaxed"><b className="text-amber-700">주의</b> · {t.caution}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
