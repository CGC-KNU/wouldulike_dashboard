export default function DashboardHomePage() {
  return (
    <div className="px-4 pt-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">안녕하세요 👋</p>
          <h1 className="text-xl font-bold text-navy">매장 현황</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-periwinkle/20 flex items-center justify-center">
          <span className="text-sm font-bold text-periwinkle">점</span>
        </div>
      </div>

      {/* 핵심 지표 카드 — 재방문·단골 전면 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="이번 달 재방문" value="—" unit="명" accent />
        <StatCard label="누적 단골" value="—" unit="명" />
        <StatCard label="쿠폰 처리" value="—" unit="건" />
        <StatCard label="스탬프 적립" value="—" unit="건" />
      </div>

      {/* 공지 / 온보딩 배너 placeholder */}
      <div className="mt-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
        <p className="text-sm font-semibold text-navy mb-1">시작하기</p>
        <p className="text-xs text-gray-500">
          가게 정보를 등록하고 쿠폰을 설정해보세요.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        accent ? "bg-periwinkle text-white" : "bg-white text-navy"
      } shadow-sm`}
    >
      <p className={`text-xs mb-2 ${accent ? "text-white/70" : "text-gray-400"}`}>
        {label}
      </p>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className={`text-sm mb-0.5 ${accent ? "text-white/70" : "text-gray-400"}`}>
          {unit}
        </span>
      </div>
    </div>
  );
}
