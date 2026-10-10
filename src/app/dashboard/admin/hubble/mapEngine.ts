/**
 * 허블 지도 엔진 (1011) — 카카오맵이 되면 카카오, 안 되면 OpenStreetMap(Leaflet).
 *
 * 카카오 JS 키는 도메인을 묶는 공개 키다(`NEXT_PUBLIC_KAKAO_JS_KEY`). 키가 없거나, 카카오 개발자 콘솔
 * 「JavaScript SDK 도메인」에 지금 주소가 등록돼 있지 않으면 sdk.js 가 401 로 거절된다 — 그때는 조용히 OSM 으로 연다.
 * 화면(HubbleMap)은 이 인터페이스만 쓴다. 점 · 원 · 이동 · 비우기 다섯 가지면 충분하다.
 */

export type Group = "campus" | "store";
export interface DotStyle { r: number; stroke: string; weight: number; fill: string; title?: string; label?: string; onClick?: () => void }
export interface Engine {
  kind: "kakao" | "osm";
  view(lat: number, lng: number, zoom: number, animate?: boolean): void;
  pan(lat: number, lng: number): void;
  clear(g: Group): void;
  dot(g: Group, lat: number, lng: number, s: DotStyle): void;
  ring(g: Group, lat: number, lng: number, meters: number, fillOpacity: number): void;
  destroy(): void;
}

const NAVY = "#060073";
// Leaflet 줌(7 = 전국 · 15 = 골목) ↔ 카카오 레벨(1 = 가장 가까이 · 14)
const level = (zoom: number) => Math.max(1, Math.min(14, zoom <= 7 ? 13 : 19 - zoom));   // 전국(7)은 13 — 12 면 남해안 · 수도권이 잘림

type Kakao = { maps: { load: (cb: () => void) => void } & Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
declare global { interface Window { kakao?: Kakao } }

function loadKakao(key: string): Promise<Kakao> {
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao);
  return new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.async = true;
    s.onload = () => (window.kakao ? window.kakao.maps.load(() => ok(window.kakao!)) : no(new Error("kakao 없음")));
    s.onerror = () => no(new Error("카카오맵 SDK 거절(도메인 미등록 또는 키 오류)"));
    document.head.appendChild(s);
    setTimeout(() => no(new Error("카카오맵 SDK 시간 초과")), 8000);
  });
}

async function kakaoEngine(el: HTMLElement, key: string): Promise<Engine> {
  const k = await loadKakao(key);
  const M = k.maps;
  const map = new M.Map(el, { center: new M.LatLng(36.2, 127.9), level: level(7) });
  map.addControl(new M.ZoomControl(), M.ControlPosition.TOPRIGHT);
  const items: Record<Group, { setMap: (m: unknown) => void }[]> = { campus: [], store: [] };
  const ro = new ResizeObserver(() => map.relayout());
  ro.observe(el);
  return {
    kind: "kakao",
    view(lat, lng, zoom, animate) {
      const c = new M.LatLng(lat, lng);
      // 카카오는 레벨 차이가 크면 애니메이션 확대가 멈춰 화면이 빈다(1011 실측) — 같은 레벨 안 이동만 부드럽게
      if (animate && map.getLevel() === level(zoom)) map.panTo(c);
      else { map.setCenter(c); map.setLevel(level(zoom)); }
    },
    pan(lat, lng) { map.panTo(new M.LatLng(lat, lng)); },
    clear(g) { items[g].forEach((x) => x.setMap(null)); items[g] = []; },
    dot(g, lat, lng, s) {
      const box = document.createElement("div");
      box.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;transform:translateY(-50%)";
      if (s.label) {
        const t = document.createElement("span");
        t.textContent = s.label;
        t.style.cssText = `font:600 11px/1.2 Pretendard,system-ui,sans-serif;color:${NAVY};background:#fff;border:1px solid rgba(6,0,115,.25);border-radius:6px;padding:1px 5px;margin-bottom:3px;white-space:nowrap`;
        box.appendChild(t);
      }
      const d = document.createElement("i");
      d.style.cssText = `display:block;width:${s.r * 2}px;height:${s.r * 2}px;border-radius:50%;background:${s.fill};border:${s.weight}px solid ${s.stroke};box-sizing:content-box;cursor:${s.onClick ? "pointer" : "default"}`;
      if (s.title) d.title = s.title;
      if (s.onClick) d.addEventListener("click", (e) => { e.stopPropagation(); s.onClick!(); });
      box.appendChild(d);
      const o = new M.CustomOverlay({ position: new M.LatLng(lat, lng), content: box, xAnchor: 0.5, yAnchor: s.label ? 0.75 : 0.5, clickable: true, zIndex: g === "store" ? 3 : 2 });
      o.setMap(map);
      items[g].push(o);
    },
    ring(g, lat, lng, meters, fillOpacity) {
      const c = new M.Circle({ center: new M.LatLng(lat, lng), radius: meters, strokeWeight: 1.2, strokeColor: NAVY, strokeOpacity: 0.9, fillColor: NAVY, fillOpacity });
      c.setMap(map);
      items[g].push(c);
    },
    destroy() { ro.disconnect(); items.campus.concat(items.store).forEach((x) => x.setMap(null)); el.innerHTML = ""; },
  };
}

async function osmEngine(el: HTMLElement): Promise<Engine> {
  const L = await import("leaflet");
  const map = L.map(el, { zoomControl: false, minZoom: 6, maxZoom: 19, attributionControl: true }).setView([36.2, 127.9], 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map);
  const layers: Record<Group, ReturnType<typeof L.layerGroup>> = { campus: L.layerGroup().addTo(map), store: L.layerGroup().addTo(map) };
  setTimeout(() => map.invalidateSize(), 50);
  return {
    kind: "osm",
    view(lat, lng, zoom, animate) { if (animate) map.flyTo([lat, lng], zoom, { duration: 0.6 }); else map.setView([lat, lng], zoom); },
    pan(lat, lng) { map.panTo([lat, lng]); },
    clear(g) { layers[g].clearLayers(); },
    dot(g, lat, lng, s) {
      const mk = L.circleMarker([lat, lng], { radius: s.r, color: s.stroke, weight: s.weight, fillColor: s.fill, fillOpacity: 1 });
      if (s.label) mk.bindTooltip(s.label, { permanent: true, direction: "top" });
      else if (s.title) mk.bindTooltip(s.title, { direction: "top" });
      if (s.onClick) mk.on("click", s.onClick);
      mk.addTo(layers[g]);
    },
    ring(g, lat, lng, meters, fillOpacity) {
      L.circle([lat, lng], { radius: meters, color: NAVY, weight: 1.2, fillColor: NAVY, fillOpacity }).addTo(layers[g]);
    },
    destroy() { map.remove(); },
  };
}

/** 카카오 먼저, 실패하면 OSM. 어느 쪽으로 열렸는지와 실패 이유를 돌려준다. */
export async function openMap(el: HTMLElement): Promise<{ engine: Engine; note: string | null }> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (key) {
    try {
      return { engine: await kakaoEngine(el, key), note: null };
    } catch (e) {
      el.innerHTML = "";
      return { engine: await osmEngine(el), note: `${(e as Error).message} — OpenStreetMap 으로 열었습니다.` };
    }
  }
  return { engine: await osmEngine(el), note: null };
}
