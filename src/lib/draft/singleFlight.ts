/**
 * 같은 일이 진행 중이면 새로 시작하지 않고 그 약속을 같이 기다린다 (1027).
 *
 * Probe 화면은 처음 열릴 때 런처 현황 · Probe 홈 · 그 화면이 같은 라우트를 거의 동시에 부른다. 라우트의 기억(cached)은
 * 다 만든 **뒤에야** 생겨서, 그 사이 들어온 요청은 처음부터 한 벌씩 더 만들었다. `/api/probe/insights` 는 한 벌에
 * 기획마다 백엔드를 부르는 일이라 겹친 만큼 백엔드 일꾼(4개)을 서로 붙잡았다.
 *
 * 합쳐지는 건 **같은 서버 인스턴스 안**에서뿐이다 — 브라우저 쪽은 `_shared/fetchJson` 이 같은 일을 한다.
 * 실패해도 다음 호출은 새로 시작한다(실패를 기억하지 않는다).
 */
export function singleFlight<T>(fn: () => Promise<T>): (join?: boolean) => Promise<T> {
  let going: Promise<T> | null = null;
  /** join=false 면 진행 중인 것을 기다리지 않고 새로 시작한다 — 방금 고친 것을 모르고 시작했을 수 있는 자리(「다시 읽기」) */
  return (join = true) => {
    if (join && going) return going;
    const p: Promise<T> = fn().finally(() => {
      if (going === p) going = null;
    });
    going = p;
    return p;
  };
}
