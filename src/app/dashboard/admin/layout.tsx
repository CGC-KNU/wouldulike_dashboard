import AdminHeader from "@/components/AdminHeader";
import ThemeClock from "@/components/ThemeClock";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 18시부터 다크 — 관리자 화면만. 점주 화면은 흰색 고정이다. */}
      <ThemeClock />
      <AdminHeader />
      <main className="flex-1 pb-8">{children}</main>
    </div>
  );
}
