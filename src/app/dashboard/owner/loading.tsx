import { Spinner } from "@/app/dashboard/admin/_shared/ui";

/**
 * 서버에서 화면을 만드는 동안 보이는 것 (0924).
 * 이게 없으면 폰에서 탭을 눌렀을 때 몇 초 동안 아무 반응이 없어 '안 눌렸나' 하고 다시 누른다.
 */
export default function OwnerLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-2.5">
      <Spinner size={20} />
      <p className="text-[12.5px] text-gray-400">불러오는 중…</p>
    </div>
  );
}
