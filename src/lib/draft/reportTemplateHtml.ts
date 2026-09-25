/**
 * 우주라이크 매장 성과 리포트 양식 v0.9.1 (마케팅_퍼포먼스/인스타그램_게시물_보고서_양식.html, 0925) — 원문 그대로.
 *
 * 이 파일은 손으로 고치지 않는다. 양식이 바뀌면 원본 HTML 을 통째로 다시 붙여 넣는다.
 * 채우는 건 `fillReportTemplate()`(reportTemplate.ts) 가 `id="report-data"` JSON 블록만 갈아 끼워서 한다 —
 * 계산·문장·숨김 규칙은 전부 양식 안의 스크립트가 한다(양식 머리말의 데이터 규칙 참고).
 */
// prettier-ignore
const REPORT_TEMPLATE_HTML = String.raw`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>매장 성과 리포트</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<!--
  ▣ 우주라이크 매장 성과 리포트 양식 v0.9.1 — 자동화용 (0925: 「지난 보고 이후」 표 · 「게시물 전체의 숫자」 문장 삭제)
  ──────────────────────────────────────────────
  사용법: 자동화 툴은 아래 id="report-data" 인 JSON 스크립트 블록의 **내용(JSON)만** 교체한다.
          나머지(HTML·CSS·JS)는 건드리지 않는다. 결과물은 파일 하나 — 카톡 링크/첨부로 보내 폰에서 연다.
  계산은 양식이 한다: 증감(%·명), 막대 길이, 저장률, 순위 문장, 「솔직하게 말씀드리는 부분」 지표 선택,
          카드 표시 여부(값이 없으면 그 줄·카드를 숨김). 툴은 원본 숫자만 넣는다.
  발송 전 검사: 렌더 후 <body data-report-status="ok|error">. error면 화면 맨 위에 빠진 필드가 빨갛게 뜬다
          (헤드리스 브라우저로 열어 status를 확인한 뒤 보낼 것). 경고는 data-report-warnings 에 남는다(화면엔 안 보임).

  ── 데이터 규칙 (JSON) ──
  store.name*            가게 이름. 문장 속 {store} 가 이 값으로 바뀐다.
  store.order            게시물 안에서 몇 번째로 소개됐는지(숫자)
  post.title* / post.type_label   h1 = 「title」 type_label (type_label 없으면 형식명)
  post.format*           "feed" | "reels"  (캐러셀도 API상 feed)
  post.posted_at*        "YYYY-MM-DD"
  post.duration_sec      릴스 길이(초)
  post.permalink*        인스타그램 게시물 URL
  post.image / account.avatar   data URI 권장(파일 하나로 보내기 위해). 비우면 자리표시.
  post.caption           캡션 발췌. 줄바꿈은 

  post.store_count       함께 소개된 가게 수. 2 이상(또는 null+multi_store:true)이면 「혼자 받은 숫자 아님」 문단 자동
  report.day*            7 | 14  (게시 후 N일차)
  report.measured_at*    "YYYY-MM-DD" 측정일(= 게시일 + N일)
  metrics.*              Graph API /{media-id}/insights 값 그대로
     views* reach* saved* shares* likes* comments*   (필수)
     profile_visits follows   (피드만 — API가 릴스엔 안 줌)
     avg_watch_sec            (릴스만 — ig_reels_avg_watch_time ÷ 1000)
     interactions             넣으면 「반응 합계」에 그대로 사용, 없으면 좋아요+댓글+저장+공유 합.
                              ※ API total_interactions 는 리포스트 등이 섞여 네 항목 합과 다를 수 있음 → 경고로 기록
  app.store_views        우리 앱 로그: 인스타그램 링크로 들어와 이 가게 화면을 연 횟수. 없으면 앱 카드 자체를 숨김(추정 금지)
  previous               지난 보고 값(14일차 보고에만). 앱 카드의 "지난 보고에서 N회 더" 문장에만 쓴다.
     day measured_at + metrics와 같은 키 + app_store_views
                         (0925: 「지난 보고 이후」 표는 뺐다 — 마케팅 결정)
  benchmarks             같은 형식끼리만 비교(피드는 피드, 릴스는 릴스)
     total_posts         비교군 게시물 수(이 게시물 제외)
     prev_dates          직전 5건 날짜 ["8/20", …]
     saved  {prev5_avg, median, rate_median(도달 대비 저장률 %, 평소 중간값)}
     views  {median, p75, rank(이 게시물 포함 순위)}
     shares / reach / likes / comments / follows / avg_watch_sec  {prev5_avg}
                         → 직전 5건 평균 대비 가장 낮은 지표가 95% 미만이면 「솔직하게 말씀드리는 부분」으로 자동 표시
  notes.saved / notes.views / notes.honest   (notes.change 는 표와 함께 없어졌다)
                         사람이 쓴 문장. 있으면 자동 문장 **대신** 쓴다(honest 는 자동 문장 **뒤에** 붙는다).
  insight.headline / insight.paragraphs[] / insight.limitation
                         「이번 편이 알려준 것」. limitation 이 있으면 자동 「혼자 받은 숫자 아님」 문단 대신 사용.
  upsell.enabled / upsell.formats[] {title, subtitle, image, stats:[{k,v}], body, link, link_label} / upsell.close
  contact.url            있으면 「담당자에게 문의하기」 버튼
  문장 필드 문법: **굵게**, ==강조색==, 줄바꿈 
, {store}. 그 외 HTML은 이스케이프된다.

  넣지 않는 것(결정 사항): 다른 가게 이름·숫자, 앱 방문 적립, 가게 화면 CTA(길찾기 등), 추정치.
-->
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    /* 우주라이크 앱 프로토타입 팔레트 */
    --navy:#0C1030; --navy3:#1B2150; --pri:#312E81; --acc:#6366F1; --peri:#A5B0FC; --peri2:#C7CCFB;
    --soft:#EEF1FF; --soft2:#F6F7FF; --gold:#E1B53E;
    --ink:#191F28; --tx:#4E5968; --sub:#8B95A1; --line:#E7E9EF; --bg:#F1F2F7; --up:#15803D; --dn:#E11D48;
    --me:#4B47C4;
  }
  body{background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;
    font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;
    -webkit-text-size-adjust:100%;word-break:keep-all;overflow-wrap:break-word}
  img{max-width:100%;display:block}
  a{color:inherit}

  .bar{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    border-bottom:1px solid var(--line);padding:13px 16px;padding-top:calc(13px + env(safe-area-inset-top,0px));
    display:flex;align-items:center;justify-content:center;gap:8px;font-size:13.5px;font-weight:700;letter-spacing:-.2px}
  .dot{width:14px;height:14px;border-radius:50%;background:linear-gradient(145deg,var(--peri),var(--acc) 50%,var(--pri));flex:none}
  .bar span{color:var(--sub);font-weight:600}

  .wrap{max-width:640px;margin:0 auto;padding:22px 16px calc(36px + env(safe-area-inset-bottom,0px))}
  .head{padding:2px 4px 18px}
  .head .store{display:inline-block;font-size:12px;font-weight:700;color:var(--me);background:var(--soft);padding:4px 10px;border-radius:999px}
  h1{font-size:21px;font-weight:800;letter-spacing:-.6px;line-height:1.4;margin-top:10px}
  .head .sub{margin-top:4px;font-size:13px;color:var(--sub)}

  .card{background:#fff;border-radius:16px;margin-bottom:12px;overflow:hidden}
  .pad{padding:20px 20px}
  h2{font-size:13px;font-weight:700;color:var(--sub);margin-bottom:14px;letter-spacing:-.1px}
  .note{margin-top:12px;font-size:12px;color:var(--sub);line-height:1.6}

  /* 게시물 */
  .post .who{display:flex;align-items:center;gap:10px;padding:16px 18px 12px}
  .post .av{width:34px;height:34px;border-radius:50%;background:var(--navy);display:flex;align-items:center;justify-content:center;flex:none}
  .post .av .dot{width:16px;height:16px}
  .post .n{font-size:13.5px;font-weight:700}
  .post .d{font-size:12px;color:var(--sub)}
  .post .shot{width:100%;aspect-ratio:4/5;background:var(--soft2);display:flex;align-items:center;justify-content:center;
    flex-direction:column;gap:4px;color:var(--sub);font-size:13px;text-align:center}
  .post .shot b{color:var(--tx)}
  .post .cap{padding:14px 18px 0;font-size:13.5px;color:var(--tx);line-height:1.7}
  .post .cap b{color:var(--ink)}
  .post .cap .more{color:var(--sub)}
  .post .go{display:flex;align-items:center;justify-content:center;gap:6px;margin:14px 18px 18px;min-height:46px;
    border-radius:12px;background:var(--soft);font-size:14px;font-weight:700;color:var(--me);text-decoration:none}

  /* 성과 목록 */
  .kv{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:13px 0;border-top:1px solid var(--line)}
  .kv:first-of-type{border-top:0;padding-top:0}
  .kv .k{font-size:14.5px;color:var(--tx)}
  .kv .k small{display:block;font-size:11.5px;color:var(--sub);margin-top:1px}
  .kv .v{font-size:22px;font-weight:800;letter-spacing:-.6px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .kv .v small{font-size:13px;font-weight:600;color:var(--sub);margin-left:2px;letter-spacing:0}
  .kv.hl .k{font-weight:700;color:var(--ink)}
  .kv.hl .v{color:var(--me)}

  /* 앱 카드 */
  .app{background:var(--pri);color:var(--peri2)}
  .app h2{color:var(--peri)}
  .app .big{display:flex;align-items:baseline;gap:6px}
  .app .big b{font-size:40px;font-weight:800;color:#fff;letter-spacing:-1.2px;line-height:1.1}
  .app .big span{font-size:15px;font-weight:600}
  .app .t{font-size:15px;font-weight:700;color:#fff;margin-bottom:6px}
  .app .d{margin-top:10px;font-size:13px;line-height:1.7}
  .app .d b{color:var(--gold)}

  /* 변화표 */
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{font-size:11.5px;color:var(--sub);font-weight:600;text-align:right;padding-bottom:9px;white-space:nowrap}
  th:first-child{text-align:left}
  td{padding:11px 0;border-top:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums}
  td:first-child{text-align:left;font-weight:600}
  td.up{color:var(--up);font-weight:700}
  td.flat{color:var(--sub)}
  .read{margin-top:12px;font-size:13.5px;line-height:1.75;color:var(--tx)}
  .read b{color:var(--ink)}

  /* 비교 막대 */
  .cmp{background:var(--soft2);border-radius:12px;padding:16px 16px;margin-bottom:10px}
  .cmp .hd{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--sub);margin-bottom:12px}
  .cmp .hd b{color:var(--ink);font-size:13px}
  .cmp .hd .honest{color:var(--dn);font-weight:700}
  .row{display:grid;grid-template-columns:96px 1fr 64px;align-items:center;gap:10px;margin-bottom:8px}
  .row .lb{font-size:12.5px;color:var(--tx)}
  .row.me .lb{font-weight:700;color:var(--ink)}
  .bg{height:8px;background:#E3E6F0;border-radius:4px;overflow:hidden}
  .bg i{display:block;height:100%;background:#C3C8D6;border-radius:4px}
  .row.me .bg i{background:var(--acc)}
  .row .nm{text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--sub)}
  .row.me .nm{color:var(--me);font-weight:800}
  .cmp .read{margin-top:8px;font-size:13px}
  .src{font-size:11.5px;color:var(--sub);line-height:1.65;margin-top:6px}

  /* 이번 편이 알려준 것 */
  .pitch{background:linear-gradient(165deg,var(--navy3),var(--navy));color:#fff;border-radius:16px;margin-bottom:12px}
  .pitch .pad{padding:24px 20px}
  .pitch .lead{font-size:12.5px;color:var(--peri);font-weight:600;margin-bottom:10px}
  .pitch h3{font-size:19px;font-weight:800;letter-spacing:-.5px;line-height:1.5}
  .pitch h3 em{font-style:normal;color:var(--gold)}
  .pitch p{margin-top:12px;font-size:14px;line-height:1.8;color:#C9CDEA}
  .pitch p b{color:#fff}

  /* 단독 제안 */
  .fmt{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:10px}
  .fmt .t{display:flex;gap:12px;padding:14px 16px;align-items:center}
  .fmt .th{width:56px;height:56px;border-radius:10px;background:var(--soft);flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--sub);text-align:center;line-height:1.3}
  .fmt .nm{font-size:15px;font-weight:700;letter-spacing:-.3px}
  .fmt .sc{font-size:12px;color:var(--sub);margin-top:2px}
  .fmt .num{display:flex;border-top:1px solid var(--line);background:var(--soft2)}
  .fmt .num > div{flex:1;padding:11px 6px;text-align:center;border-left:1px solid var(--line)}
  .fmt .num > div:first-child{border-left:0}
  .fmt .num .k{font-size:11px;color:var(--sub)}
  .fmt .num .v{font-size:16px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums}
  .fmt .ex{padding:13px 16px;font-size:13px;line-height:1.75;color:var(--tx);border-top:1px solid var(--line)}
  .fmt .ex b{color:var(--ink)}
  .close{background:var(--soft);border-radius:12px;padding:18px 18px;font-size:14px;line-height:1.8;color:var(--tx)}
  .close b{color:var(--ink)}
  .cta{display:flex;align-items:center;justify-content:center;margin-top:12px;min-height:48px;border-radius:12px;
    background:var(--pri);color:#fff;font-size:14.5px;font-weight:700;text-decoration:none}

  /* v0.9 자동화용 */
  td.dn{color:var(--dn);font-weight:700}
  .errbox{background:#FFF1F3;border:1.5px solid var(--dn);color:var(--dn);border-radius:12px;padding:14px 16px;margin-bottom:12px;font-size:13px;line-height:1.7}
  .post .av-img{width:34px;height:34px;border-radius:50%;object-fit:cover;background:var(--navy);flex:none}
  .post .shot-img{width:100%;display:block;background:var(--soft2)}
  .fmt .th-img{width:56px;height:56px;border-radius:10px;object-fit:cover;flex:none;background:var(--soft)}
  .fmt .lk{display:block;padding:0 16px 14px;font-size:12.5px;font-weight:600;color:var(--me);text-decoration:none}
  .foot{padding:10px 4px 0;font-size:12px;color:var(--sub);line-height:1.7}

  /* 좁은 화면 — 카톡 내장 브라우저·소형 안드로이드 */
  @media (max-width:380px){
    .wrap{padding:16px 12px 32px}
    .pad{padding:18px 16px}
    h1{font-size:19px}
    .kv .v{font-size:20px}
    .row{grid-template-columns:78px 1fr 54px;gap:8px}
    table{font-size:13px}
  }
  @media print{
    body{background:#fff}
    .bar{position:static}
    .card,.pitch,.cmp,.fmt{break-inside:avoid}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style>
</head>
<body data-report-status="loading">
<div class="bar"><span class="dot"></span>우주라이크 <span>· 매장 성과 리포트</span></div>
<div class="wrap">
  <div id="r-errors" class="errbox" hidden></div>
  <div class="head" id="r-head"></div>
  <div id="r-post"></div>
  <div id="r-metrics"></div>
  <div id="r-app"></div>
  <div id="r-change"></div>
  <div id="r-compare"></div>
  <div id="r-insight"></div>
  <div id="r-upsell"></div>
  <div class="foot" id="r-foot"></div>
  <noscript><div class="errbox">이 리포트는 브라우저에서 열어야 보입니다.</div></noscript>
</div>

<!-- ▼▼▼ 자동화 툴은 이 블록만 교체한다 ▼▼▼  (예시값 = 라라더 14일차 실제 발송본) -->
<script type="application/json" id="report-data">
{
  "store": { "name": "라라더", "order": 1 },
  "account": { "handle": "@w_ouldulike", "name": "우주라이크", "avatar": "" },
  "post": {
    "title": "대구 면 요리 맛집",
    "type_label": "큐레이션",
    "format": "feed",
    "posted_at": "2026-09-04",
    "duration_sec": null,
    "permalink": "https://www.instagram.com/p/Dc2_5H-Hbf-/",
    "image": "",
    "caption": "📢면 덕후들 주목\n대구 면 요리 맛집을 모아봤습니다😍\n\n사진 찍고 싶어지는 **아메리칸 차이니즈**부터 자가제면 라멘, 칼국수까지!",
    "store_count": null,
    "multi_store": true
  },
  "report": { "day": 14, "measured_at": "2026-09-18" },
  "metrics": {
    "views": 32657, "reach": 18702, "saved": 644, "shares": 528, "likes": 258, "comments": 2,
    "profile_visits": 165, "follows": 27, "avg_watch_sec": null,
    "interactions": 1454
  },
  "app": { "store_views": null },
  "previous": {
    "day": 7, "measured_at": "2026-09-11",
    "reach": 15503, "saved": 538, "shares": 417, "comments": 2, "follows": 21,
    "interactions": 1188, "app_store_views": null
  },
  "benchmarks": {
    "total_posts": 45,
    "prev_dates": ["8/20", "8/22", "8/26", "8/28", "8/31"],
    "saved":  { "prev5_avg": 272, "median": 244, "rate_median": 2.0 },
    "views":  { "median": 17085, "p75": 27828, "rank": 10 },
    "shares": { "prev5_avg": 604 }
  },
  "notes": {
    "change": "약속드린 2주차 재측정입니다. 올린 지 2주가 지났는데도 **아직 멈추지 않았습니다.** 지난주보다 도달이 3,199명 더 늘었습니다. 특히 **팔로우가 27명**인데, 저희가 최근 60건을 같이 재봤을 때 이 게시물이 가장 많았습니다.",
    "honest": "지난주에는 19% 낮았으니 **격차가 좁아졌습니다.** 지난 일주일 사이 늘어난 폭만 보면 공유가 27%로 가장 컸습니다. 다만 여전히 평균 아래입니다 — 여러 가게가 함께 실린 글이라 “이 집 가자”고 콕 집어 보내기 어려운 형식이라고 봅니다."
  },
  "insight": {
    "headline": "{store}는 ==메뉴를 보고 끌리는 가게==입니다.\n그런데 이번엔 메뉴를 한 장밖에 못 썼습니다.",
    "paragraphs": [
      "저장이 평소의 두 배로 걸렸다는 건, 사람들이 사진을 보고 “여기 가봐야지” 하고 담아뒀다는 뜻입니다. 분위기도 위치도 아닌 **메뉴가 끌어당겼습니다.**"
    ],
    "limitation": "다만 **이번 도달 18,702명은 {store} 혼자 받은 숫자가 아닙니다.** 한 장에 여러 가게가 함께 실렸습니다. 캡션에서는 “사진 찍고 싶어지는 아메리칸 차이니즈”로 **가장 먼저** 소개됐지만, **상호는 카드 안에만** 있었습니다. 도달한 18,702명 중 “{store}”라는 이름을 본 분은 카드를 넘겨본 분들입니다."
  },
  "upsell": {
    "enabled": true,
    "formats": [
      { "title": "카드뉴스 · 담아두게 만든다", "subtitle": "저희 채널 8/26 편 실측", "image": "",
        "stats": [ {"k":"도달","v":"36,134"}, {"k":"저장","v":"636"}, {"k":"공유","v":"1,998"} ],
        "body": "메뉴 사진을 여러 장으로 펼치는 형식입니다. **저장과 공유가 크게 걸립니다.** 같은 형식으로 이번 {store} 편의 두 배 넘게 간 적도 있습니다. {store}는 저장이 이미 검증됐으니, **카드 9장을 전부 {store} 메뉴로 채우는 것**이 이 형식의 단독판입니다.",
        "link": "https://www.instagram.com/p/DcfZIMPEd3C/", "link_label": "8/26 편 보기" },
      { "title": "릴스 · 머무르게 만든다", "subtitle": "최근 단독 릴스 실측 (다른 매장)", "image": "",
        "stats": [ {"k":"평균 시청","v":"5.1초"}, {"k":"총 시청","v":"5.1시간"}, {"k":"도달","v":"2,950"} ],
        "body": "도달은 카드뉴스보다 작습니다. 대신 **사람들이 그 가게를 본 시간이 다 합쳐 5.1시간**입니다. 메뉴가 아니라 가게의 공기 — 요리가 만들어지는 장면, 자리에 앉은 사람들, 저녁의 조명 — 를 전합니다. 사진으로는 안 넘어가는 것이 영상으로는 넘어갑니다.",
        "link": "https://www.instagram.com/reel/Dcx3ou0gRHx/", "link_label": "릴스 보기" }
    ],
    "close": "두 형식은 서로 대신하지 못합니다. **카드뉴스는 담아두게 하고, 릴스는 머무르게 합니다.** {store}는 메뉴가 이미 검증됐으니 카드뉴스로 끌어오고, 릴스로 매장 안을 보여주는 조합이 잘 맞습니다.\n\n단독 콘텐츠는 구독과 별개라 견적을 따로 잡습니다. 촬영이 필요한지, 몇 컷으로 갈지에 따라 달라져서 — **관심 있으시면 {store} 기준으로 정리해 보내드리겠습니다.** 보시고 결정하셔도 됩니다."
  },
  "contact": { "url": "" },
  "company": "우주라이크(코끼리) · 268-11-03292"
}
</script>
<!-- ▲▲▲ 여기까지 ▲▲▲ -->

<script>
(function () {
  "use strict";
  var errors = [], warnings = [];
  var D;
  try { D = JSON.parse(document.getElementById("report-data").textContent); }
  catch (e) { D = {}; errors.push("report-data JSON 파싱 실패: " + e.message); }

  // ── 도구 ──
  function has(v) { return v !== null && v !== undefined && v !== ""; }
  function get(path) { return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, D); }
  var STORE = get("store.name") || "";
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function md(s) {
    return esc(String(s).replace(/\{store\}/g, STORE))
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/==(.+?)==/g, "<em>$1</em>").replace(/\n/g, "<br>");
  }
  function n(v) { return Number(v).toLocaleString("ko-KR"); }
  function d(s) { return has(s) ? String(s).replace(/-/g, ".") : ""; }
  function md2(s) { var p = String(s).split("-"); return (+p[1]) + "/" + (+p[2]); }
  function pct(a, b) { return Math.round((a / b - 1) * 100); }
  function put(id, html) { document.getElementById(id).innerHTML = html; }
  function url(u) { return /^(https?:|data:image\/)/.test(u || "") ? esc(u) : ""; }

  // ── 필수 필드 검사 ──
  ["store.name", "post.title", "post.format", "post.posted_at", "post.permalink", "report.day", "report.measured_at",
   "metrics.views", "metrics.reach", "metrics.saved", "metrics.shares", "metrics.likes", "metrics.comments"]
    .forEach(function (k) { if (!has(get(k))) errors.push(k); });
  if (has(get("post.format")) && ["feed", "reels"].indexOf(get("post.format")) < 0) errors.push('post.format 은 "feed" 또는 "reels"');

  if (errors.length) {
    var box = document.getElementById("r-errors");
    box.hidden = false;
    box.innerHTML = "<b>보내기 전에 채워야 할 값</b><br>" + errors.map(esc).join("<br>");
    document.body.setAttribute("data-report-status", "error");
    return;
  }

  var P = D.post, M = D.metrics, R = D.report, PV = D.previous || null, B = D.benchmarks || {};
  var isReels = P.format === "reels";
  var FMT = isReels ? "릴스" : "피드";
  var interactions = has(M.interactions) ? M.interactions : M.likes + M.comments + M.saved + M.shares;
  var sum4 = M.likes + M.comments + M.saved + M.shares;
  if (has(M.interactions) && M.interactions !== sum4)
    warnings.push("반응 합계 " + M.interactions + " ≠ 좋아요+댓글+저장+공유 " + sum4);
  var multi = (P.store_count || 0) > 1 || P.multi_store === true;
  var appViews = get("app.store_views");
  document.title = STORE + " 성과 리포트 · " + R.day + "일차";

  // ── 머리 ──
  put("r-head",
    '<span class="store">' + esc(STORE) + ' 사장님께</span>' +
    "<h1>「" + esc(P.title) + "」 " + esc(P.type_label || FMT) + "</h1>" +
    '<div class="sub">게시 ' + R.day + "일차 · " + d(R.measured_at) + " 측정</div>");

  // ── 게시물 ──
  var av = url(get("account.avatar"));
  var img = url(P.image);
  put("r-post",
    '<div class="card post"><div class="who">' +
      (av ? '<img class="av-img" src="' + av + '" alt="">' : '<div class="av"><span class="dot"></span></div>') +
      '<div><div class="n">' + esc(get("account.name") || "우주라이크") + " · " + esc(get("account.handle") || "@w_ouldulike") + "</div>" +
      '<div class="d">' + d(P.posted_at) + " 게시 · " + FMT + (isReels && has(P.duration_sec) ? " " + P.duration_sec + "초" : "") + "</div></div></div>" +
    (img ? '<img class="shot-img" src="' + img + '" alt="게시물">' : '<div class="shot"><b>게시물 이미지</b>post.image</div>') +
    (has(P.caption) ? '<div class="cap">' + md(P.caption) + '<br><span class="more">… 본문 더보기</span></div>' : "") +
    '<a class="go" href="' + url(P.permalink) + '">↗ Instagram에서 보기</a></div>');

  // ── 게시물 성과 ──
  function kv(k, v, hl, sub) {
    return '<div class="kv' + (hl ? " hl" : "") + '"><div class="k">' + k + (sub ? "<small>" + sub + "</small>" : "") + '</div><div class="v">' + v + "</div></div>";
  }
  var rows = kv("조회수", n(M.views)) + kv("도달", n(M.reach), false, isReels ? "영상을 본 사람 수" : "게시물을 본 사람 수") +
    kv("저장", n(M.saved), true) + kv("공유", n(M.shares)) + kv("좋아요", n(M.likes)) + kv("댓글", n(M.comments));
  if (!isReels && has(M.profile_visits) && has(M.follows)) rows += kv("프로필 방문 · 팔로우", n(M.profile_visits) + " · " + n(M.follows));
  else if (!isReels && has(M.follows)) rows += kv("팔로우", n(M.follows));
  if (isReels && has(M.avg_watch_sec)) rows += kv("평균 시청 시간", (Math.round(M.avg_watch_sec * 10) / 10) + "<small>초</small>");
  put("r-metrics", '<div class="card"><div class="pad"><h2>게시물 성과</h2>' + rows +
    '<div class="note">' + d(R.measured_at) + " 기준 인스타그램 수치예요.</div></div></div>");

  // ── 앱 카드 (값이 있을 때만) ──
  if (has(appViews)) {
    var ap = PV && has(PV.app_store_views) ? PV.app_store_views : null;
    put("r-app", '<div class="card app"><div class="pad"><h2>우주라이크 앱에서</h2>' +
      '<div class="t">인스타그램을 보고 ' + esc(STORE) + " 화면을 연 횟수</div>" +
      '<div class="big"><b>' + n(appViews) + "</b><span>회</span></div>" +
      '<div class="d">' + (ap !== null ? "지난 보고(" + PV.day + "일차) <b>" + n(ap) + "회</b>에서 " + n(appViews - ap) + "회 더 늘었습니다. " : "") +
      "인스타그램 링크로 앱에 들어와 <b>" + esc(STORE) + " 화면을 직접 연 경우만</b> 셌습니다.</div></div></div>");
  }

  // ── 지난 보고 이후: 0925 에 뺐다(마케팅 결정). r-change 자리는 PNG 나누기가 참조해서 비워 둔다 ──

  // ── 다른 게시물과 비교 ──
  function bars(list) {
    var max = Math.max.apply(null, list.map(function (x) { return x[1]; }));
    return list.map(function (x, i) {
      return '<div class="row' + (i === 0 ? " me" : "") + '"><div class="lb">' + x[0] + '</div><div class="bg"><i style="width:' +
        Math.max(2, Math.round(x[1] / max * 100)) + '%"></i></div><div class="nm">' + x[2] + "</div></div>";
    }).join("");
  }
  var blocks = [];
  var bs = B.saved || {}, bv = B.views || {};
  if (has(bs.prev5_avg)) {
    var r = M.saved / bs.prev5_avg, t;
    if (r >= 1.15) t = "저장이 직전 5건 평균의 **" + (Math.round(r * 10) / 10) + "배**입니다.";
    else if (r >= 0.9) t = "저장이 직전 5건 평균과 비슷합니다.";
    else t = "저장이 직전 5건 평균보다 **" + Math.round((1 - r) * 100) + "% 낮습니다.**";
    if (has(bs.rate_median)) {
      var rate = M.saved / M.reach * 100;
      t += " 도달 대비 저장률로 봐도 " + rate.toFixed(1) + "%로 평소 " + Number(bs.rate_median).toFixed(1) + "%보다 " + (rate >= bs.rate_median ? "높습니다." : "낮습니다.");
    }
    t += " 저장은 “나중에 가봐야지” 하고 담아두는 행동이라, 맛집 콘텐츠에서 방문 의향에 가장 가까운 신호로 봅니다.";
    var L = [["이번 게시물", M.saved, n(M.saved)], ["직전 5건 평균", bs.prev5_avg, n(bs.prev5_avg)]];
    if (has(bs.median)) L.push(["평소 중간값", bs.median, n(bs.median)]);
    blocks.push('<div class="cmp"><div class="hd"><b>저장</b><span>직전 ' + FMT + " 5건</span></div>" + bars(L) +
      '<div class="read">' + md(get("notes.saved") || t) + "</div></div>");
  }
  if (has(bv.median)) {
    var tv = (M.views >= bv.median ? "평소 게시물보다 많이 조회됐습니다." : "평소 게시물보다 적게 조회됐습니다.");
    if (has(bv.rank) && has(B.total_posts)) {
      tv += " " + (B.total_posts + 1) + "건 중 위에서 **" + bv.rank + "번째**";
      tv += bv.rank === 1 ? "로 **최고 기록**입니다." : (has(bv.p75) && M.views >= bv.p75 ? "로 상위권이지만, 저희 최고 기록은 아닙니다." : "입니다.");
    }
    var LV = [["이번 게시물", M.views, n(M.views)], ["평소 중간값", bv.median, n(bv.median)]];
    if (has(bv.p75)) LV.push(["상위 25%", bv.p75, n(bv.p75)]);
    blocks.push('<div class="cmp"><div class="hd"><b>조회수</b><span>이 계정의 평소 ' + FMT + (has(B.total_posts) ? " " + B.total_posts + "건" : "") + "</span></div>" +
      bars(LV) + '<div class="read">' + md(get("notes.views") || tv) + "</div></div>");
  }
  // 솔직하게: 직전 5건 평균 대비 가장 낮은 지표(95% 미만일 때만)
  var cand = { shares: ["공유", "공유는", "회"], reach: ["도달", "도달은", "명"], likes: ["좋아요", "좋아요는", "개"],
               comments: ["댓글", "댓글은", "개"], follows: ["팔로우", "팔로우는", "명"], avg_watch_sec: ["평균 시청 시간", "평균 시청 시간은", "초"] };
  var worst = null;
  Object.keys(cand).forEach(function (k) {
    var b = B[k]; if (!b || !has(b.prev5_avg) || !has(M[k])) return;
    var rr = M[k] / b.prev5_avg; if (!worst || rr < worst.r) worst = { k: k, r: rr, avg: b.prev5_avg };
  });
  if (worst && worst.r < 0.95) {
    var c = cand[worst.k], fx = function (v) { return worst.k === "avg_watch_sec" ? (Math.round(v * 10) / 10) + "초" : n(v); };
    var th = c[1] + " 직전 5건 평균보다 **" + Math.round((1 - worst.r) * 100) + "% 낮습니다.**";
    if (has(get("notes.honest"))) th += " " + get("notes.honest");
    blocks.push('<div class="cmp"><div class="hd"><b>' + c[0] + '</b><span class="honest">솔직하게 말씀드리는 부분</span></div>' +
      bars([["이번 게시물", M[worst.k], fx(M[worst.k])], ["직전 5건 평균", worst.avg, fx(worst.avg)]]) +
      '<div class="read">' + md(th) + "</div></div>");
  }
  if (blocks.length) {
    var srcTxt = "근거 · " + d(R.measured_at) + " 기준 인스타그램 인사이트. 비교군은 " + esc(get("account.handle") || "@w_ouldulike") +
      " 가 이 게시물 이전에 올린 " + FMT + (has(B.total_posts) ? " " + B.total_posts + "건" : "") +
      (B.prev_dates && B.prev_dates.length ? ", 그중 직전 5건(" + B.prev_dates.map(esc).join(" · ") + ")의 평균" : "") +
      ". " + (isReels ? "피드는" : "릴스는") + " 성격이 달라 제외했습니다.";
    put("r-compare", '<div class="card"><div class="pad"><h2>다른 게시물과 비교</h2>' + blocks.join("") + '<div class="src">' + srcTxt + "</div></div></div>");
  }

  // ── 이번 편이 알려준 것 ──
  var ins = D.insight || {}, paras = (ins.paragraphs || []).slice();
  if (has(ins.limitation)) paras.push(ins.limitation);
  else if (multi) paras.push("다만 **이번 도달 " + n(M.reach) + "명은 {store} 혼자 받은 숫자가 아닙니다.** 한 게시물에 " +
    (P.store_count > 1 ? "가게 " + P.store_count + "곳이" : "여러 가게가") + " 함께 실렸" +
    (has(get("store.order")) ? "고, {store}는 **" + get("store.order") + "번째**로 소개됐습니다." : "습니다."));
  if (multi && get("upsell.enabled")) paras.push("단독으로 가면 캡션도, 해시태그도, 지도 링크도 전부 {store}입니다. 같은 반응을 **한 가게가 전부 가져가면** 어떻게 되는지는 아직 해보지 않았습니다.");
  if (has(ins.headline) || paras.length) {
    put("r-insight", '<div class="pitch"><div class="pad"><div class="lead">이번 편이 알려준 것</div>' +
      (has(ins.headline) ? "<h3>" + md(ins.headline) + "</h3>" : "") +
      paras.map(function (p) { return "<p>" + md(p) + "</p>"; }).join("") + "</div></div>");
  }

  // ── 단독 콘텐츠 제안 ──
  var U = D.upsell || {};
  if (U.enabled && U.formats && U.formats.length) {
    var fm = U.formats.map(function (f) {
      var im = url(f.image);
      return '<div class="fmt"><div class="t">' + (im ? '<img class="th-img" src="' + im + '" alt="">' : '<div class="th">썸네일</div>') +
        '<div><div class="nm">' + esc(f.title || "") + '</div><div class="sc">' + esc(f.subtitle || "") + "</div></div></div>" +
        (f.stats && f.stats.length ? '<div class="num">' + f.stats.map(function (s) { return '<div><div class="k">' + esc(s.k) + '</div><div class="v">' + esc(s.v) + "</div></div>"; }).join("") + "</div>" : "") +
        (has(f.body) ? '<div class="ex">' + md(f.body) + "</div>" : "") +
        (url(f.link) ? '<a class="lk" href="' + url(f.link) + '">↗ ' + esc(f.link_label || "게시물 보기") + "</a>" : "") + "</div>";
    }).join("");
    var closeTxt = U.close || "두 형식은 서로 대신하지 못합니다. **카드뉴스는 담아두게 하고, 릴스는 머무르게 합니다.**\n\n단독 콘텐츠는 구독과 별개라 견적을 따로 잡습니다. **관심 있으시면 {store} 기준으로 정리해 보내드리겠습니다.** 보시고 결정하셔도 됩니다.";
    var cu = url(get("contact.url"));
    put("r-upsell", '<div class="card"><div class="pad"><h2>단독으로 만든다면 — 두 가지 형식</h2>' + fm +
      '<div class="close">' + md(closeTxt) + (cu ? '<a class="cta" href="' + cu + '">담당자에게 문의하기</a>' : "") + "</div></div></div>");
  }

  // ── 바닥글 ──
  put("r-foot", (has(appViews)
      ? "인스타그램 수치와 우주라이크 앱 안에서 가게 화면을 연 횟수까지만 셉니다. 실제 방문·매출로 이어졌는지는 저희 지표로 알 수 없습니다."
      : "위 수치는 모두 인스타그램 안에서 일어난 일입니다. 실제 방문·매출로 이어졌는지는 저희 지표로 알 수 없습니다.") +
    "<br>" + esc(D.company || "우주라이크(코끼리) · 268-11-03292"));

  if (warnings.length) { document.body.setAttribute("data-report-warnings", warnings.join(" | ")); warnings.forEach(function (w) { console.warn("[report]", w); }); }
  document.body.setAttribute("data-report-status", "ok");
})();
</script>
</body>
</html>
`;
export default REPORT_TEMPLATE_HTML;
