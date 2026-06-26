import BottomNav from "@/components/BottomNav";
import DevModeBanner from "@/components/DevModeBanner";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DevModeBanner currentMode="owner" />
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
