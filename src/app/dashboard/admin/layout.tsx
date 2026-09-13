import AdminViewBanner from "@/components/DevModeBanner";
import AdminHeader from "@/components/AdminHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminViewBanner currentMode="admin" />
      <AdminHeader />
      <main className="flex-1 pb-8">{children}</main>
    </div>
  );
}
