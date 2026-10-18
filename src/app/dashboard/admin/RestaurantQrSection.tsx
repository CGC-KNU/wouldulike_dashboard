"use client";

/**
 * Drive · 매장 QR — 앱 식당 탭에 보이는 제휴 매장마다 테이블 QR 을 만들어 보여 준다.
 * 목록을 열 때마다 새로 받아 QR 을 브라우저에서 그리므로, 매장이 추가되면 바로 여기에 나온다.
 */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";
import {
  QR_PRINT_SOURCES,
  groupByCampus,
  restaurantQrLink,
  type QrPrintSource,
  type QrRestaurant,
} from "@/lib/restaurantQr";

function QrCard({ restaurant, src }: { restaurant: QrRestaurant; src: QrPrintSource }) {
  const link = restaurantQrLink(restaurant.restaurant_id, src);
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 4, width: 1024 })
      .then((url) => alive && setDataUrl(url))
      .catch(() => alive && setDataUrl(""));
    return () => {
      alive = false;
    };
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("링크를 복사하세요", link);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="aspect-square bg-white flex items-center justify-center p-3">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`${restaurant.name} QR`} className="w-full h-full object-contain" />
        ) : (
          <Spinner size={18} />
        )}
      </div>
      <div className="p-3 pt-0">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
          {restaurant.campus} · {restaurant.restaurant_id}
        </span>
        <p className="text-xs font-semibold text-gray-700 mt-1.5 truncate" title={restaurant.name}>
          {restaurant.name}
        </p>
        <div className="mt-2 flex gap-1.5">
          <a
            href={dataUrl || undefined}
            download={`${restaurant.name}_QR_${src}.png`}
            aria-disabled={!dataUrl}
            className="flex-1 py-1.5 rounded-lg bg-periwinkle/10 text-periwinkle text-xs font-bold text-center hover:bg-periwinkle hover:text-white transition-colors"
          >
            PNG 다운로드
          </a>
          <button
            onClick={copy}
            className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition-colors"
          >
            {copied ? "복사됨" : "링크"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantQrSection() {
  const [restaurants, setRestaurants] = useState<QrRestaurant[] | null>(null);
  const [err, setErr] = useState("");
  const [src, setSrc] = useState<QrPrintSource>("sticker");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/drive/restaurant-qr", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { restaurants?: QrRestaurant[] }) => setRestaurants(data.restaurants ?? []))
      .catch(() => {
        setRestaurants([]);
        setErr("매장 목록을 불러오지 못했습니다.");
      });
  }, []);

  const groups = useMemo(() => {
    const q = query.trim();
    const list = (restaurants ?? []).filter(
      (r) => !q || r.name.includes(q) || String(r.restaurant_id) === q,
    );
    return groupByCampus(list);
  }, [restaurants, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5 w-fit">
          {QR_PRINT_SOURCES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSrc(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                src === key ? "bg-white text-navy shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="매장 이름 또는 번호"
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 w-44"
        />
        <a
          href="/api/dashboard/drive/restaurant-qr?format=html"
          className="ml-auto px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-bold hover:opacity-90"
        >
          마케팅 안내문(HTML) 다운로드
        </a>
      </div>
      <p className="text-xs text-gray-400">
        앱 식당 탭에 보이는 매장이 자동으로 올라옵니다. 처음 찍으면 쿠폰, 다음부터는 스탬프 적립 화면이 열립니다.
        {restaurants && restaurants.length > 0 && ` 현재 ${restaurants.length}곳.`}
      </p>

      {err && <p className="text-xs text-red-500">{err}</p>}

      {restaurants === null ? (
        <div className="flex justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <p className="text-sm text-gray-400">표시할 매장이 없습니다.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.campus} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-gray-700 mt-2">
              {g.campus} <span className="text-gray-400 font-medium">{g.restaurants.length}곳</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {g.restaurants.map((r) => (
                <QrCard key={r.restaurant_id} restaurant={r} src={src} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
