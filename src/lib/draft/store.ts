/**
 * 초안(draft) 데이터 저장소.
 *
 * Astro 확장·Probe·Castor 는 백엔드(Django)에 아직 테이블이 없다. 그렇다고 화면을
 * 하드코딩된 더미로 채우면 "눌러도 아무 일도 안 일어나는 목업"이 되어 검증이 안 된다.
 * 그래서 이 파일이 **백엔드가 생기기 전까지만 쓰는 임시 저장소** 역할을 한다.
 *
 *   1. `NEXT_PUBLIC_API_URL` 백엔드에 실제 엔드포인트가 있으면 그쪽을 쓴다 (toolProxy.ts).
 *   2. 없으면(404/501/502) 여기 데이터를 쓰고, 응답에 `draft: true` 를 붙인다.
 *   3. 화면은 `draft` 플래그를 보고 "초안 데이터" 배지를 띄운다 — 실측과 절대 섞이지 않게.
 *
 * 저장은 JSON 파일(`.draft-data/`)에 하고, 파일을 못 쓰는 환경(Vercel 등 읽기전용 FS)이면
 * 프로세스 메모리로 조용히 떨어진다. 어차피 백엔드가 붙으면 통째로 지울 코드다.
 *
 * ⚠️ 이 저장소를 실사용 데이터의 원본으로 삼지 말 것. 배포 환경에서는 재시작하면 날아간다.
 */

import fs from "node:fs";
import path from "node:path";

const DIR = process.env.DRAFT_DATA_DIR ?? path.join(process.cwd(), ".draft-data");

const memory = new Map<string, unknown>();

function filePath(key: string) {
  return path.join(DIR, `${key}.json`);
}

/** 초안 컬렉션을 읽는다. 파일이 없으면 `seed()` 결과로 초기화하고 그대로 돌려준다. */
export function readDraft<T>(key: string, seed: () => T): T {
  if (memory.has(key)) return memory.get(key) as T;

  try {
    const raw = fs.readFileSync(filePath(key), "utf8");
    const parsed = JSON.parse(raw) as T;
    memory.set(key, parsed);
    return parsed;
  } catch (e) {
    // 파일이 없으면 시드로 시작한다. 그런데 **있는데 깨진** 거면 조용히 넘어가면 안 된다 —
    // 백엔드가 붙기 전까지 이 파일이 입금 확인 기록의 유일한 원본이다.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[draft] ${filePath(key)} 을 읽지 못해 시드로 대체합니다:`, (e as Error).message);
    }
  }

  const fresh = seed();
  memory.set(key, fresh);
  writeDraft(key, fresh);
  return fresh;
}

/** 초안 컬렉션을 쓴다. 파일 쓰기에 실패해도 메모리에는 남아 요청 사이 상태가 유지된다. */
export function writeDraft<T>(key: string, value: T): T {
  memory.set(key, value);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    // 임시 파일에 쓰고 rename — 쓰는 도중 죽어도 잘린 JSON 이 남지 않는다
    const tmp = `${filePath(key)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, filePath(key));
  } catch {
    // 읽기 전용 파일시스템 — 메모리만으로 동작
  }
  return value;
}

/** 컬렉션 안의 한 항목을 부분 수정한다. 없으면 null. */
export function patchDraftItem<T extends { id: string | number }>(
  key: string,
  seed: () => T[],
  id: string | number,
  patch: Partial<T>
): T | null {
  const list = readDraft<T[]>(key, seed);
  const idx = list.findIndex((it) => String(it.id) === String(id));
  if (idx === -1) return null;
  const next = { ...list[idx], ...patch };
  // 캐시 배열을 제자리에서 바꾸지 않는다 — 같은 참조를 들고 있는 다른 요청이 중간 상태를 본다
  const copy = [...list];
  copy[idx] = next;
  writeDraft(key, copy);
  return next;
}

/** 컬렉션에 항목을 추가한다. id 는 호출자가 넣거나, 없으면 타임스탬프 기반으로 만든다. */
export function appendDraftItem<T extends { id: string | number }>(
  key: string,
  seed: () => T[],
  item: Omit<T, "id"> & { id?: string | number }
): T {
  const list = readDraft<T[]>(key, seed);
  const created = { ...item, id: item.id ?? `d${Date.now()}${Math.floor(Math.random() * 100)}` } as T;
  writeDraft(key, [created, ...list]);
  return created;
}
