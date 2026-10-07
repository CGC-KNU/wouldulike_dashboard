"use client";
import { Button } from "../_shared/ui";

/** 백엔드가 409 로 돌려주는 비슷한 이름의 매장 (1007) */
export type DupStore = { restaurant_id: number; name: string; is_affiliate?: boolean; hidden_from_app?: boolean; exact?: boolean };

/** 409 응답에서 후보를 꺼낸다. 후보가 없으면 null — 그냥 오류로 보여 주면 된다. */
export function dupsOf(status: number, d: unknown): DupStore[] | null {
  const list = (d as { duplicates?: DupStore[] } | null)?.duplicates;
  return status === 409 && Array.isArray(list) && list.length ? list : null;
}

/**
 * 같은 매장을 두 번 만들지 않게 묻는다 (1007, 수연님 제보 — 랜돌프비어·소를품은연어가 둘씩 생겼다).
 * 후보 전환이면 '이 매장에 잇기', 새 매장 만들기면 잇기 없이 '그래도 새로 만들기'만.
 */
export default function DuplicateStoreChoice({ dups, onLink, onNew, busy }: { dups: DupStore[]; onLink?: (rid: number) => void; onNew: () => void; busy?: boolean }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-1.5" role="alert" onClick={(e) => e.stopPropagation()}>
      <p className="font-semibold">비슷한 이름의 매장이 이미 있습니다. 같은 가게면 새로 만들지 마세요.</p>
      <ul className="space-y-1">
        {dups.map((s) => (
          <li key={s.restaurant_id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {s.name} <span className="text-amber-700">#{s.restaurant_id}{s.hidden_from_app ? " · 앱에서 숨김" : ""}{s.is_affiliate === false ? " · 제휴 꺼짐" : ""}</span>
            </span>
            {onLink && <Button size="sm" variant="primary" disabled={busy} onClick={() => onLink(s.restaurant_id)}>이 매장에 잇기</Button>}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onNew}>다른 가게예요 — 새로 만들기</Button>
      </div>
    </div>
  );
}
