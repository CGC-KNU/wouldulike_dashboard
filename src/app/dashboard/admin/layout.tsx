import AdminViewBanner from "@/components/DevModeBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminViewBanner currentMode="admin" />
      {/* 관리자 헤더 */}
      <header className="bg-[#0A0676] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight">우주라이크</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">관리자</span>
        </div>
        <a
          href="/api/auth/logout"
          className="text-xs text-white/60 hover:text-white transition-colors"
        >
          로그아웃
        </a>
      </header>
      <main className="flex-1 pb-8">{children}</main>
    </div>
  );
}
