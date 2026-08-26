"use client";

import { useEffect, useRef, useState } from "react";

import { PaidRestaurant } from "./typesWeekly";

/**
 * 배너 스튜디오 — 사진 위에 텍스트·그라디언트를 직접 배치해 배너/팝업 이미지를
 * 만드는 수동 편집기 (2026-08-26 도입). 배너랩(위 두 컴포저)의 AI 합성·Figma 분석
 * 파이프라인과는 별개로, 마케팅팀이 폰트·크기·위치·그라디언트 값을 직접 정해
 * PNG로 뽑아 쓰는 용도다. 완성한 이미지는 다운로드해서 배너랩의 소재 사진으로
 * 올리거나 슬랙에 바로 첨부하면 된다.
 *
 * 일반 배너는 배경 사진이 고정되어 있지 않다 — 쓸 때마다 새 사진을 올린다.
 * 쿠폰 배너는 /public/bannerlab/coupon-template.png 를 고정 배경으로 쓰고
 * 문구만 바꿔 쓰면 된다.
 */

type BannerMode = "general" | "coupon";
type SelectedKind = "text" | "asset" | null;
type Align = "left" | "center" | "right";

interface InnerShadowConfig {
  enabled: boolean;
  color: string;
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

interface TextLayer {
  id: string;
  text: string;
  fontSize: number;
  weight: number;
  fontFamily: "Pretendard" | "RiaSans";
  color: string;
  align: Align;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  rotation: number;
  chip: boolean;
  chipColor: string;
  chipOpacity: number;
  innerShadow: InnerShadowConfig;
}

interface ImageAssetLayer {
  id: string;
  el: HTMLImageElement;
  name: string;
  xPct: number;
  yPct: number;
  widthPct: number;
}

interface ImageSceneState {
  el: HTMLImageElement | null;
  zoom: number;
  posX: number;
  posY: number;
  name: string;
}

interface GradientState {
  intensity: number;
  coverage: number;
}

interface Scene {
  image: ImageSceneState;
  gradient: GradientState;
}

interface LayerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayerLayout {
  lines: string[];
  lineHeight: number;
  totalHeight: number;
  centerX: number;
  pivotY: number;
  maxWidthPx: number;
  boxTop: number;
  boxLeft: number;
}

const RATIOS = [
  { w: 1080, h: 1250, label: "1080 × 1250 (기본 배너)" },
  { w: 1080, h: 1080, label: "1080 × 1080 (정사각형)" },
  { w: 1080, h: 1350, label: "1080 × 1350 (4:5)" },
  { w: 1080, h: 1920, label: "1080 × 1920 (세로형 팝업)" },
];

const MODE_LABEL: Record<BannerMode, string> = {
  general: "일반 배너",
  coupon: "쿠폰 배너",
};

const ACCENT = "#6366E0"; // periwinkle — 대시보드 브랜드 컬러 (편집 UI 강조용, 배너 본문 색과는 무관)

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `l${Date.now().toString(36)}${uidCounter}`;
}

function defaultShadow(): InnerShadowConfig {
  return { enabled: false, color: "#000000", opacity: 55, blur: 6, offsetX: 2, offsetY: 2 };
}

function makeEmptyImageState(): ImageSceneState {
  return { el: null, zoom: 1, posX: 50, posY: 50, name: "" };
}

function fontStack(family: string): string {
  return `"${family}", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
}

function hexToRgba(hex: string, alpha: number): string {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function makePreset(mode: BannerMode): TextLayer[] {
  if (mode === "coupon") {
    return [
      { id: uid(), text: "SPECIAL COUPON", fontSize: 30, weight: 800, fontFamily: "Pretendard", color: "#FF5630", align: "left", xPct: 50, yPct: 59, maxWidthPct: 85, rotation: 0, chip: false, chipColor: "#000000", chipOpacity: 28, innerShadow: defaultShadow() },
      { id: uid(), text: "첫 예약 15% 할인", fontSize: 70, weight: 800, fontFamily: "Pretendard", color: "#17181A", align: "left", xPct: 50, yPct: 69, maxWidthPct: 85, rotation: 0, chip: false, chipColor: "#000000", chipOpacity: 28, innerShadow: defaultShadow() },
      { id: uid(), text: "8월 31일까지 사용 가능", fontSize: 30, weight: 400, fontFamily: "Pretendard", color: "#17181A", align: "left", xPct: 50, yPct: 79, maxWidthPct: 85, rotation: 0, chip: false, chipColor: "#000000", chipOpacity: 28, innerShadow: defaultShadow() },
      { id: uid(), text: "코드 WELCOME15", fontSize: 26, weight: 700, fontFamily: "Pretendard", color: "#FFFFFF", align: "center", xPct: 26, yPct: 90, maxWidthPct: 60, rotation: 0, chip: true, chipColor: "#000000", chipOpacity: 28, innerShadow: defaultShadow() },
    ];
  }
  return [
    { id: uid(), text: "이번 주 추천", fontSize: 32, weight: 800, fontFamily: "Pretendard", color: "#FFD866", align: "left", xPct: 28.9, yPct: 65.9, maxWidthPct: 43, rotation: 0, chip: false, chipColor: "#000000", chipOpacity: 28, innerShadow: defaultShadow() },
    { id: uid(), text: "비오는 날 뜨끈한\n해물크림짬뽕 어떠세요?", fontSize: 92, weight: 600, fontFamily: "Pretendard", color: "#FFFFFF", align: "left", xPct: 49.7, yPct: 78.4, maxWidthPct: 85, rotation: 0, chip: false, chipColor: "#000000", chipOpacity: 28, innerShadow: defaultShadow() },
  ];
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = String(text).split("\n");
  const lines: string[] = [];
  paragraphs.forEach((para) => {
    if (para === "") {
      lines.push("");
      return;
    }
    const words = para.split(" ");
    let cur = "";
    words.forEach((w) => {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width <= maxWidth) {
        cur = test;
        return;
      }
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      if (ctx.measureText(w).width <= maxWidth) {
        cur = w;
      } else {
        let chunk = "";
        for (const ch of w) {
          const t2 = chunk + ch;
          if (ctx.measureText(t2).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t2;
          }
        }
        cur = chunk;
      }
    });
    if (cur) lines.push(cur);
  });
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function computeLayerLayout(ctx: CanvasRenderingContext2D, layer: TextLayer, canvasW: number, canvasH: number): LayerLayout {
  ctx.font = `${layer.weight} ${layer.fontSize}px ${fontStack(layer.fontFamily)}`;
  const maxWidthPx = (layer.maxWidthPct / 100) * canvasW;
  const lines = wrapLines(ctx, layer.text || "", maxWidthPx);
  const lineHeight = layer.fontSize * 1.32;
  const totalHeight = lineHeight * Math.max(lines.length, 1);
  const centerX = (layer.xPct / 100) * canvasW;
  const centerY = (layer.yPct / 100) * canvasH;
  const boxTop = centerY - totalHeight / 2;
  const boxLeft = centerX - maxWidthPx / 2;
  return { lines, lineHeight, totalHeight, centerX, pivotY: centerY, maxWidthPx, boxTop, boxLeft };
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, isSelected: boolean, canvasW: number, canvasH: number): LayerBox {
  const layout = computeLayerLayout(ctx, layer, canvasW, canvasH);
  const rot = ((layer.rotation || 0) * Math.PI) / 180;

  ctx.save();
  if (rot) {
    ctx.translate(layout.centerX, layout.pivotY);
    ctx.rotate(rot);
    ctx.translate(-layout.centerX, -layout.pivotY);
  }
  ctx.font = `${layer.weight} ${layer.fontSize}px ${fontStack(layer.fontFamily)}`;

  if (layer.chip) {
    let contentWidth = 0;
    layout.lines.forEach((line) => {
      contentWidth = Math.max(contentWidth, ctx.measureText(line).width);
    });
    const padX = layer.fontSize * 0.6;
    const padY = layer.fontSize * 0.42;
    const chipW = contentWidth + padX * 2;
    const chipH = layout.totalHeight + padY * 2;
    const chipX = layout.centerX - chipW / 2;
    const chipY = layout.boxTop - padY;
    const chipAlpha = (layer.chipOpacity != null ? layer.chipOpacity : 28) / 100;
    ctx.fillStyle = hexToRgba(layer.chipColor || "#000000", chipAlpha);
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
  }

  ctx.textAlign = layer.align;
  const lineX =
    layer.align === "left"
      ? layout.boxLeft
      : layer.align === "right"
        ? layout.boxLeft + layout.maxWidthPx
        : layout.centerX;

  layout.lines.forEach((line, i) => {
    const baseline = layout.boxTop + layout.lineHeight * (i + 1) - layout.lineHeight * 0.28;
    ctx.fillStyle = layer.color;
    ctx.fillText(line, lineX, baseline);

    const sh = layer.innerShadow;
    if (sh?.enabled) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      const shAlpha = (sh.opacity != null ? sh.opacity : 55) / 100;
      ctx.shadowColor = hexToRgba(sh.color || "#000000", shAlpha);
      ctx.shadowBlur = sh.blur != null ? sh.blur : 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = hexToRgba(sh.color || "#000000", shAlpha);
      ctx.fillText(line, lineX + (sh.offsetX != null ? sh.offsetX : 2), baseline + (sh.offsetY != null ? sh.offsetY : 2));
      ctx.restore();
    }
  });

  const box: LayerBox = { x: layout.boxLeft, y: layout.boxTop, w: layout.maxWidthPx, h: layout.totalHeight };

  if (isSelected) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(2, canvasW * 0.0018);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);
  }
  ctx.restore();
  return box;
}

function computeAssetBox(asset: ImageAssetLayer, canvasW: number, canvasH: number): LayerBox {
  const drawW = (asset.widthPct / 100) * canvasW;
  const ratio = asset.el?.naturalWidth ? asset.el.naturalHeight / asset.el.naturalWidth : 1;
  const drawH = drawW * ratio;
  const centerX = (asset.xPct / 100) * canvasW;
  const centerY = (asset.yPct / 100) * canvasH;
  return { x: centerX - drawW / 2, y: centerY - drawH / 2, w: drawW, h: drawH };
}

function drawAsset(ctx: CanvasRenderingContext2D, asset: ImageAssetLayer, isSelected: boolean, canvasW: number, canvasH: number) {
  if (!asset.el) return;
  const box = computeAssetBox(asset, canvasW, canvasH);
  ctx.drawImage(asset.el, box.x, box.y, box.w, box.h);
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(2, canvasW * 0.0018);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);
    ctx.restore();
  }
}

function drawCoverImage(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, image: ImageSceneState) {
  const img = image.el;
  if (!img || !img.complete || !img.naturalWidth) {
    ctx.fillStyle = "#D9D8D3";
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#8C8B88";
    ctx.font = `600 ${Math.round(canvasW * 0.035)}px ${fontStack("Pretendard")}`;
    ctx.textAlign = "center";
    ctx.fillText("배경 이미지를 업로드하세요", canvasW / 2, canvasH / 2);
    return;
  }
  const baseScale = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
  const scale = baseScale * (image.zoom || 1);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const slackX = drawW - canvasW;
  const slackY = drawH - canvasH;
  const offsetX = -(slackX * (image.posX / 100));
  const offsetY = -(slackY * (image.posY / 100));
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function drawGradient(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, gradient: GradientState) {
  const cov = gradient.coverage / 100;
  const inten = gradient.intensity / 100;
  if (inten <= 0) return;
  const startY = canvasH * (1 - cov);
  const g = ctx.createLinearGradient(0, startY, 0, canvasH);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${inten})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, startY, canvasW, canvasH - startY);
}

function pointInRotatedBox(pt: { x: number; y: number }, box: LayerBox, pivotX: number, pivotY: number, rotationDeg: number): boolean {
  const rad = (-(rotationDeg || 0) * Math.PI) / 180;
  const dx = pt.x - pivotX;
  const dy = pt.y - pivotY;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad) + pivotX;
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad) + pivotY;
  return localX >= box.x - 8 && localX <= box.x + box.w + 8 && localY >= box.y - 8 && localY <= box.y + box.h + 8;
}

function hitTestPoint(
  ctx: CanvasRenderingContext2D,
  pt: { x: number; y: number },
  layers: TextLayer[],
  assets: ImageAssetLayer[],
  canvasW: number,
  canvasH: number,
): { kind: SelectedKind; id: string } | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const layout = computeLayerLayout(ctx, layer, canvasW, canvasH);
    const box: LayerBox = { x: layout.boxLeft, y: layout.boxTop, w: layout.maxWidthPx, h: layout.totalHeight };
    if (pointInRotatedBox(pt, box, layout.centerX, layout.pivotY, layer.rotation || 0)) {
      return { kind: "text", id: layer.id };
    }
  }
  for (let j = assets.length - 1; j >= 0; j--) {
    const asset = assets[j];
    const box = computeAssetBox(asset, canvasW, canvasH);
    if (pointInRotatedBox(pt, box, box.x + box.w / 2, box.y + box.h / 2, 0)) {
      return { kind: "asset", id: asset.id };
    }
  }
  return null;
}

interface DragState {
  kind: SelectedKind;
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const inputCls =
  "text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-periwinkle w-full";
const labelCls = "text-[11px] text-gray-500 flex items-center justify-between mb-1";
const btnGhost =
  "text-[11px] font-semibold text-periwinkle border border-periwinkle/30 rounded-lg px-2.5 py-1.5 hover:bg-periwinkle/5";
const btnPrimary =
  "text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle disabled:opacity-40";
const chipCls =
  "flex items-center gap-2 border border-gray-100 rounded-lg px-2.5 py-1.5 text-[11px] cursor-pointer";

/**
 * 슬랙 메시징 세팅(주간 배너 자동화)의 1·2주차 안에 배너 스튜디오를 넣을 때만 넘겨준다
 * (마케팅팀 피드백 2026-08-26). 이게 있으면 캔버스 아래에 "일괄 생성 · 슬랙 발송" 패널이
 * 추가로 뜬다 — 서버는 이 이미지들을 다시 그리지 않고 그대로 슬랙에 올린다.
 */
export interface WeeklyBatchContext {
  weekId: number;
  weekType: "general" | "coupon";
  restaurants: PaidRestaurant[];
  couponTexts: Record<number, string>;
  onCouponTextsChange: (next: Record<number, string>) => void;
}

export default function BannerStudioComposer({ weeklyBatch }: { weeklyBatch?: WeeklyBatchContext } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [ratioIdx, setRatioIdx] = useState(0);
  const [mode, setMode] = useState<BannerMode>("general");
  const [scenes, setScenes] = useState<Record<BannerMode, Scene>>(() => ({
    general: { image: makeEmptyImageState(), gradient: { intensity: 71, coverage: 67 } },
    coupon: { image: makeEmptyImageState(), gradient: { intensity: 0, coverage: 45 } },
  }));
  const [layersByMode, setLayersByMode] = useState<Record<BannerMode, TextLayer[]>>(() => ({
    general: makePreset("general"),
    coupon: makePreset("coupon"),
  }));
  const [assetsByMode, setAssetsByMode] = useState<Record<BannerMode, ImageAssetLayer[]>>(() => ({
    general: [],
    coupon: [],
  }));
  const [selectedKind, setSelectedKind] = useState<SelectedKind>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [specText, setSpecText] = useState("");

  const ratio = RATIOS[ratioIdx];
  const layers = layersByMode[mode];
  const assets = assetsByMode[mode];
  const scene = scenes[mode];
  const selectedLayer = selectedKind === "text" ? layers.find((l) => l.id === selectedId) ?? null : null;
  const selectedAsset = selectedKind === "asset" ? assets.find((a) => a.id === selectedId) ?? null : null;

  // RiaSans 웹폰트 로드 (public/fonts/RiaSans-Bold.ttf) — 단일 굵기 파일이라
  // weight 범위를 넓게 등록해 어떤 굵기를 요청해도 이 페이스로 매칭되게 한다.
  useEffect(() => {
    let cancelled = false;
    const face = new FontFace("RiaSans", "url(/fonts/RiaSans-Bold.ttf)", { weight: "1 1000" });
    face
      .load()
      .then((loaded) => {
        if (cancelled) return;
        document.fonts.add(loaded);
        setFontsReady(true);
      })
      .catch(() => setFontsReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // 쿠폰 배너 고정 배경 로드 (public/bannerlab/coupon-template.png)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setScenes((prev) => ({
        ...prev,
        coupon: {
          ...prev.coupon,
          image: prev.coupon.image.el ? prev.coupon.image : { el: img, zoom: 1, posX: 50, posY: 50, name: "쿠폰 배너 고정 배경" },
        },
      }));
    };
    img.src = "/bannerlab/coupon-template.png";
  }, []);

  // 캔버스 리렌더
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = ratio.w;
    canvas.height = ratio.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCoverImage(ctx, canvas.width, canvas.height, scene.image);
    drawGradient(ctx, canvas.width, canvas.height, scene.gradient);
    assets.forEach((a) => drawAsset(ctx, a, selectedKind === "asset" && a.id === selectedId, canvas.width, canvas.height));
    layers.forEach((l) => drawLayer(ctx, l, selectedKind === "text" && l.id === selectedId, canvas.width, canvas.height));
  }, [ratio, scene, assets, layers, selectedKind, selectedId, fontsReady]);

  function updateScene(patch: Partial<Scene>) {
    setScenes((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }));
  }
  function updateImage(patch: Partial<ImageSceneState>) {
    setScenes((prev) => ({ ...prev, [mode]: { ...prev[mode], image: { ...prev[mode].image, ...patch } } }));
  }
  function updateGradient(patch: Partial<GradientState>) {
    setScenes((prev) => ({ ...prev, [mode]: { ...prev[mode], gradient: { ...prev[mode].gradient, ...patch } } }));
  }
  function updateLayer(id: string, patch: Partial<TextLayer>) {
    setLayersByMode((prev) => ({ ...prev, [mode]: prev[mode].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }
  function updateShadow(id: string, patch: Partial<InnerShadowConfig>) {
    setLayersByMode((prev) => ({
      ...prev,
      [mode]: prev[mode].map((l) => (l.id === id ? { ...l, innerShadow: { ...l.innerShadow, ...patch } } : l)),
    }));
  }
  function updateAsset(id: string, patch: Partial<ImageAssetLayer>) {
    setAssetsByMode((prev) => ({ ...prev, [mode]: prev[mode].map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }

  function switchMode(next: BannerMode) {
    setMode(next);
    setSelectedKind(null);
    setSelectedId(null);
  }

  function handleBgFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        updateImage({ el: img, zoom: 1, posX: 50, posY: 50, name: file.name });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function removeBg() {
    updateImage(makeEmptyImageState());
  }

  function addTextLayer() {
    const layer: TextLayer = {
      id: uid(),
      text: "새 텍스트",
      fontSize: 40,
      weight: 700,
      fontFamily: "Pretendard",
      color: "#FFFFFF",
      align: "center",
      xPct: 50,
      yPct: 50,
      maxWidthPct: 80,
      rotation: 0,
      chip: false,
      chipColor: "#000000",
      chipOpacity: 28,
      innerShadow: defaultShadow(),
    };
    setLayersByMode((prev) => ({ ...prev, [mode]: [...prev[mode], layer] }));
    setSelectedKind("text");
    setSelectedId(layer.id);
  }

  function deleteLayer(id: string) {
    setLayersByMode((prev) => ({ ...prev, [mode]: prev[mode].filter((l) => l.id !== id) }));
    setSelectedKind(null);
    setSelectedId(null);
  }

  function handleAssetFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const asset: ImageAssetLayer = { id: uid(), el: img, name: file.name, xPct: 50, yPct: 50, widthPct: 25 };
        setAssetsByMode((prev) => ({ ...prev, [mode]: [...prev[mode], asset] }));
        setSelectedKind("asset");
        setSelectedId(asset.id);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function deleteAsset(id: string) {
    setAssetsByMode((prev) => ({ ...prev, [mode]: prev[mode].filter((a) => a.id !== id) }));
    setSelectedKind(null);
    setSelectedId(null);
  }

  function toCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pt = toCanvasPoint(e);
    const hit = hitTestPoint(ctx, pt, layers, assets, canvas.width, canvas.height);
    if (hit) {
      setSelectedKind(hit.kind);
      setSelectedId(hit.id);
      const origin =
        hit.kind === "text"
          ? layers.find((l) => l.id === hit.id)
          : assets.find((a) => a.id === hit.id);
      if (origin) {
        dragRef.current = { kind: hit.kind, id: hit.id, startX: pt.x, startY: pt.y, originX: origin.xPct, originY: origin.yPct };
        canvas.setPointerCapture(e.pointerId);
      }
    } else {
      setSelectedKind(null);
      setSelectedId(null);
      dragRef.current = null;
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const pt = toCanvasPoint(e);
    const dxPct = ((pt.x - drag.startX) / canvas.width) * 100;
    const dyPct = ((pt.y - drag.startY) / canvas.height) * 100;
    const nx = clamp(drag.originX + dxPct, 0, 100);
    const ny = clamp(drag.originY + dyPct, 0, 100);
    if (drag.kind === "text") updateLayer(drag.id, { xPct: nx, yPct: ny });
    else if (drag.kind === "asset") updateAsset(drag.id, { xPct: nx, yPct: ny });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mode === "coupon" ? "coupon-banner" : "banner"}-${ratio.w}x${ratio.h}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function buildSpec() {
    return {
      mode,
      ratio: { width: ratio.w, height: ratio.h },
      backgroundImage: {
        file: scene.image.name || null,
        zoomPct: Math.round((scene.image.zoom || 1) * 100),
        posXPct: scene.image.posX,
        posYPct: scene.image.posY,
      },
      bottomGradient: { intensityPct: scene.gradient.intensity, coveragePct: scene.gradient.coverage },
      textLayers: layers.map((l) => ({
        text: l.text,
        fontFamily: l.fontFamily,
        fontSizePx: l.fontSize,
        fontWeight: l.weight,
        color: l.color,
        align: l.align,
        centerXPct: Math.round(l.xPct * 10) / 10,
        centerYPct: Math.round(l.yPct * 10) / 10,
        maxWidthPct: l.maxWidthPct,
        rotationDeg: l.rotation || 0,
        innerShadow: l.innerShadow.enabled
          ? {
              colorHex: l.innerShadow.color,
              opacityPct: l.innerShadow.opacity,
              blurPx: l.innerShadow.blur,
              offsetXPx: l.innerShadow.offsetX,
              offsetYPx: l.innerShadow.offsetY,
            }
          : null,
        chipBackground: l.chip,
        chipColorHex: l.chip ? l.chipColor : undefined,
        chipOpacityPct: l.chip ? l.chipOpacity : undefined,
      })),
      imageAssets: assets.map((a) => ({
        file: a.name || null,
        widthPct: a.widthPct,
        centerXPct: Math.round(a.xPct * 10) / 10,
        centerYPct: Math.round(a.yPct * 10) / 10,
      })),
    };
  }

  function toggleSpec() {
    if (specOpen) {
      setSpecOpen(false);
      return;
    }
    setSpecText(JSON.stringify(buildSpec(), null, 2));
    setSpecOpen(true);
  }

  async function copySpec() {
    try {
      await navigator.clipboard.writeText(specText);
    } catch {
      // 클립보드 권한이 없는 환경 — 사용자가 아래 텍스트 영역에서 직접 선택해 복사하면 된다.
    }
  }

  /**
   * 팝업(표지) — 그 주차를 대표하는 사진 1장. 배너처럼 식당마다 자동으로 여러 장
   * 만드는 게 아니라, 지금 캔버스에 있는 시안 그대로 1장만 슬랙으로 보낸다(마케팅팀
   * 피드백 2026-08-26 — RD 확인: "팝업도 배너 스튜디오로, 일반/쿠폰 둘 다 밑에 사진을
   * 넣을 수 있는 방식으로. 배너처럼 식당 사진을 자동으로 쓰는 것과는 다름"). 일반
   * 배너 모드는 지금 올려둔 배경 사진 그대로, 쿠폰 모드는 고정 템플릿 배경 그대로 —
   * 둘 다 이미 "배경 사진 아래" 구조라 새로 만들 게 없다.
   */
  const [sendingPopup, setSendingPopup] = useState(false);

  async function sendAsPopup() {
    if (!weeklyBatch) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSendingPopup(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 생성에 실패했습니다."))), "image/jpeg", 0.92);
      });
      const contentType = "image/jpeg";
      const presign = await fetch(`/api/bannerlab/weekly/weeks/${weeklyBatch.weekId}/studio-targets/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "popup.jpg", content_type: contentType }),
      });
      const p = await presign.json().catch(() => ({}));
      if (!presign.ok) throw new Error(p.detail ?? "업로드 URL 발급에 실패했습니다.");

      const put = await fetch(p.upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
      if (!put.ok) throw new Error(`S3 업로드 실패 (${put.status})`);

      const reg = await fetch(`/api/bannerlab/weekly/weeks/${weeklyBatch.weekId}/studio-targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "popup", restaurant_id: null, restaurant_name: "", key: p.key }),
      });
      const r = await reg.json().catch(() => ({}));
      if (!reg.ok) throw new Error(r.detail ?? "슬랙 발송에 실패했습니다.");
      alert("팝업 시안을 슬랙으로 보냈습니다.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSendingPopup(false);
    }
  }

  /* ─── 주간 배너 일괄 생성 (마케팅팀 피드백 2026-08-26) ───────────────── */
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      img.src = src;
    });
  }

  /** 쿠폰 문구 안의 {{가게명}}/{{쿠폰내용}} 자리표시자를 식당별 값으로 바꾼다. */
  function substituteTokens(text: string, restaurant: PaidRestaurant, couponText: string): string {
    return text.replaceAll("{{가게명}}", restaurant.name).replaceAll("{{쿠폰내용}}", couponText || "");
  }

  async function renderVariant(bgImg: HTMLImageElement, layersForVariant: TextLayer[]): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = ratio.w;
    canvas.height = ratio.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들지 못했습니다.");
    const imageState: ImageSceneState = { el: bgImg, zoom: scene.image.zoom, posX: scene.image.posX, posY: scene.image.posY, name: "" };
    drawCoverImage(ctx, canvas.width, canvas.height, imageState);
    drawGradient(ctx, canvas.width, canvas.height, scene.gradient);
    assets.forEach((a) => drawAsset(ctx, a, false, canvas.width, canvas.height));
    layersForVariant.forEach((l) => drawLayer(ctx, l, false, canvas.width, canvas.height));
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지 생성에 실패했습니다."))), "image/jpeg", 0.92);
    });
  }

  async function uploadAndSend(weekId: number, restaurantId: number | null, restaurantName: string, blob: Blob) {
    const contentType = "image/jpeg";
    const presign = await fetch(`/api/bannerlab/weekly/weeks/${weekId}/studio-targets/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: `${restaurantId ?? "banner"}.jpg`, content_type: contentType }),
    });
    const p = await presign.json().catch(() => ({}));
    if (!presign.ok) throw new Error(p.detail ?? "업로드 URL 발급에 실패했습니다.");

    const put = await fetch(p.upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    if (!put.ok) throw new Error(`S3 업로드 실패 (${put.status})`);

    const reg = await fetch(`/api/bannerlab/weekly/weeks/${weekId}/studio-targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "banner", restaurant_id: restaurantId, restaurant_name: restaurantName, key: p.key }),
    });
    const r = await reg.json().catch(() => ({}));
    if (!reg.ok) throw new Error(r.detail ?? "슬랙 발송에 실패했습니다.");
  }

  async function runBatch() {
    if (!weeklyBatch) return;
    const { weekId, weekType, restaurants, couponTexts } = weeklyBatch;
    if (restaurants.length === 0) {
      alert("대상 식당이 없습니다.");
      return;
    }
    setBatchErrors([]);
    setBatchProgress({ done: 0, total: restaurants.length });

    const errors: string[] = [];
    for (let i = 0; i < restaurants.length; i++) {
      const r = restaurants[i];
      try {
        let bgImg: HTMLImageElement;
        let variantLayers: TextLayer[];
        if (weekType === "coupon") {
          if (!scene.image.el) throw new Error("고정 배경이 아직 로드되지 않았습니다.");
          bgImg = scene.image.el;
          const couponText = couponTexts[r.restaurant_id] || "";
          variantLayers = layers.map((l) => ({ ...l, text: substituteTokens(l.text, r, couponText) }));
        } else {
          if (!r.photo_url) throw new Error("등록된 사진이 없습니다.");
          bgImg = await loadImage(r.photo_url);
          variantLayers = layers;
        }
        const blob = await renderVariant(bgImg, variantLayers);
        await uploadAndSend(weekId, r.restaurant_id, r.name, blob);
      } catch (e) {
        errors.push(`${r.name}: ${(e as Error).message}`);
      }
      setBatchProgress({ done: i + 1, total: restaurants.length });
    }
    setBatchErrors(errors);
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1.5 bg-gray-50 border border-gray-100 rounded-xl p-1">
          {(["general", "coupon"] as BannerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`text-xs font-semibold rounded-lg py-2 ${
                mode === m ? "bg-periwinkle text-white" : "text-gray-500 hover:bg-white"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <div>
          <p className={labelCls}><span>비율</span></p>
          <select
            className={inputCls}
            value={ratioIdx}
            onChange={(e) => setRatioIdx(Number(e.target.value))}
          >
            {RATIOS.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2.5">
          <p className="text-xs font-semibold text-gray-600">배경 이미지</p>
          <div className="flex items-center gap-1.5">
            <button className={btnPrimary} onClick={() => fileInputRef.current?.click()}>
              업로드 / 교체
            </button>
            <button className={btnGhost} onClick={removeBg}>
              제거
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleBgFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <p className={labelCls}><span>확대</span><span>{Math.round((scene.image.zoom || 1) * 100)}%</span></p>
            <input type="range" min={100} max={220} value={Math.round((scene.image.zoom || 1) * 100)} className="w-full accent-periwinkle" onChange={(e) => updateImage({ zoom: Number(e.target.value) / 100 })} />
          </div>
          <div>
            <p className={labelCls}><span>가로 위치</span><span>{scene.image.posX}%</span></p>
            <input type="range" min={0} max={100} value={scene.image.posX} className="w-full accent-periwinkle" onChange={(e) => updateImage({ posX: Number(e.target.value) })} />
          </div>
          <div>
            <p className={labelCls}><span>세로 위치</span><span>{scene.image.posY}%</span></p>
            <input type="range" min={0} max={100} value={scene.image.posY} className="w-full accent-periwinkle" onChange={(e) => updateImage({ posY: Number(e.target.value) })} />
          </div>
          <p className="text-[10px] text-gray-400">
            * 쿠폰 배너는 고정 템플릿 배경이 기본 적용되어 있어 글자만 바꿔 쓰면 됩니다. 일반 배너는 배경이 고정되어 있지 않으니, 사용할 때마다 새 사진을 업로드하세요.
          </p>
        </div>

        <div className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2.5">
          <p className="text-xs font-semibold text-gray-600">하단 그라디언트(딤)</p>
          <div>
            <p className={labelCls}><span>강도</span><span>{scene.gradient.intensity}%</span></p>
            <input type="range" min={0} max={100} value={scene.gradient.intensity} className="w-full accent-periwinkle" onChange={(e) => updateGradient({ intensity: Number(e.target.value) })} />
          </div>
          <div>
            <p className={labelCls}><span>적용 범위(높이)</span><span>{scene.gradient.coverage}%</span></p>
            <input type="range" min={10} max={100} value={scene.gradient.coverage} className="w-full accent-periwinkle" onChange={(e) => updateGradient({ coverage: Number(e.target.value) })} />
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">텍스트 레이어 ({layers.length})</p>
            <button className={btnGhost} onClick={addTextLayer}>
              + 텍스트 추가
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {layers.map((l) => (
              <div
                key={l.id}
                onClick={() => {
                  setSelectedKind("text");
                  setSelectedId(l.id);
                }}
                className={`${chipCls} ${selectedKind === "text" && selectedId === l.id ? "border-periwinkle bg-periwinkle/5" : ""}`}
              >
                <span className="flex-1 truncate">{(l.text || "(빈 텍스트)").split("\n")[0]}</span>
                <span className="text-gray-400">{l.fontSize}px</span>
              </div>
            ))}
          </div>

          {selectedLayer && (
            <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-2.5 mt-1">
              <div>
                <p className={labelCls}><span>내용</span></p>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={selectedLayer.text}
                  onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                />
              </div>
              <div>
                <p className={labelCls}><span>크기</span><span>{selectedLayer.fontSize}px</span></p>
                <input type="range" min={16} max={140} value={selectedLayer.fontSize} className="w-full accent-periwinkle" onChange={(e) => updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) })} />
              </div>
              <div>
                <p className={labelCls}><span>글꼴</span></p>
                <select className={inputCls} value={selectedLayer.fontFamily} onChange={(e) => updateLayer(selectedLayer.id, { fontFamily: e.target.value as TextLayer["fontFamily"] })}>
                  <option value="Pretendard">Pretendard</option>
                  <option value="RiaSans">RiaSans</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className={labelCls}><span>굵기</span></p>
                  <select className={inputCls} value={selectedLayer.weight} onChange={(e) => updateLayer(selectedLayer.id, { weight: Number(e.target.value) })}>
                    <option value={400}>Regular</option>
                    <option value={600}>SemiBold</option>
                    <option value={800}>ExtraBold</option>
                  </select>
                </div>
                <div className="flex-1">
                  <p className={labelCls}><span>정렬</span></p>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as Align[]).map((al) => (
                      <button
                        key={al}
                        onClick={() => updateLayer(selectedLayer.id, { align: al })}
                        className={`flex-1 text-[11px] rounded-lg py-1.5 border ${
                          selectedLayer.align === al ? "bg-periwinkle text-white border-periwinkle" : "border-gray-200 text-gray-500"
                        }`}
                      >
                        {al === "left" ? "좌" : al === "center" ? "중" : "우"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className={labelCls}><span>색상</span></p>
                <div className="flex items-center gap-1.5">
                  {["#FFFFFF", "#17181A", "#FF5630", "#FFD866"].map((c) => (
                    <button
                      key={c}
                      onClick={() => updateLayer(selectedLayer.id, { color: c })}
                      style={{ backgroundColor: c }}
                      className={`w-6 h-6 rounded-md border ${selectedLayer.color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-periwinkle" : "border-gray-200"}`}
                    />
                  ))}
                  <input type="text" value={selectedLayer.color} onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })} className={`${inputCls} w-24`} />
                </div>
              </div>
              <div>
                <p className={labelCls}><span>최대 너비</span><span>{selectedLayer.maxWidthPct}%</span></p>
                <input type="range" min={20} max={100} value={selectedLayer.maxWidthPct} className="w-full accent-periwinkle" onChange={(e) => updateLayer(selectedLayer.id, { maxWidthPct: Number(e.target.value) })} />
              </div>
              <div>
                <p className={labelCls}><span>회전</span><span>{selectedLayer.rotation}°</span></p>
                <input type="range" min={-180} max={180} value={selectedLayer.rotation} className="w-full accent-periwinkle" onChange={(e) => updateLayer(selectedLayer.id, { rotation: Number(e.target.value) })} />
              </div>

              <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer border-t border-gray-100 pt-2.5">
                <input type="checkbox" checked={selectedLayer.innerShadow.enabled} onChange={(e) => updateShadow(selectedLayer.id, { enabled: e.target.checked })} />
                안쪽 그림자 효과
              </label>
              {selectedLayer.innerShadow.enabled && (
                <div className="flex flex-col gap-2.5 pl-1">
                  <div>
                    <p className={labelCls}><span>강도</span><span>{selectedLayer.innerShadow.opacity}%</span></p>
                    <input type="range" min={0} max={100} value={selectedLayer.innerShadow.opacity} className="w-full accent-periwinkle" onChange={(e) => updateShadow(selectedLayer.id, { opacity: Number(e.target.value) })} />
                  </div>
                  <div>
                    <p className={labelCls}><span>흐림</span><span>{selectedLayer.innerShadow.blur}px</span></p>
                    <input type="range" min={0} max={24} value={selectedLayer.innerShadow.blur} className="w-full accent-periwinkle" onChange={(e) => updateShadow(selectedLayer.id, { blur: Number(e.target.value) })} />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className={labelCls}><span>가로 오프셋</span><span>{selectedLayer.innerShadow.offsetX}px</span></p>
                      <input type="range" min={-20} max={20} value={selectedLayer.innerShadow.offsetX} className="w-full accent-periwinkle" onChange={(e) => updateShadow(selectedLayer.id, { offsetX: Number(e.target.value) })} />
                    </div>
                    <div className="flex-1">
                      <p className={labelCls}><span>세로 오프셋</span><span>{selectedLayer.innerShadow.offsetY}px</span></p>
                      <input type="range" min={-20} max={20} value={selectedLayer.innerShadow.offsetY} className="w-full accent-periwinkle" onChange={(e) => updateShadow(selectedLayer.id, { offsetY: Number(e.target.value) })} />
                    </div>
                  </div>
                  <input type="text" value={selectedLayer.innerShadow.color} onChange={(e) => updateShadow(selectedLayer.id, { color: e.target.value })} className={inputCls} placeholder="그림자 색상 (#000000)" />
                </div>
              )}

              <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer border-t border-gray-100 pt-2.5">
                <input type="checkbox" checked={selectedLayer.chip} onChange={(e) => updateLayer(selectedLayer.id, { chip: e.target.checked })} />
                배지(칩) 배경 표시
              </label>
              {selectedLayer.chip && (
                <div className="flex flex-col gap-2.5 pl-1">
                  <div>
                    <p className={labelCls}><span>칩 색상</span></p>
                    <div className="flex items-center gap-1.5">
                      {["#000000", "#FFFFFF", "#FF5630"].map((c) => (
                        <button
                          key={c}
                          onClick={() => updateLayer(selectedLayer.id, { chipColor: c })}
                          style={{ backgroundColor: c }}
                          className={`w-6 h-6 rounded-md border ${selectedLayer.chipColor.toLowerCase() === c.toLowerCase() ? "ring-2 ring-periwinkle" : "border-gray-200"}`}
                        />
                      ))}
                      <input type="text" value={selectedLayer.chipColor} onChange={(e) => updateLayer(selectedLayer.id, { chipColor: e.target.value })} className={`${inputCls} w-24`} />
                    </div>
                  </div>
                  <div>
                    <p className={labelCls}><span>칩 투명도</span><span>{selectedLayer.chipOpacity}%</span></p>
                    <input type="range" min={0} max={100} value={selectedLayer.chipOpacity} className="w-full accent-periwinkle" onChange={(e) => updateLayer(selectedLayer.id, { chipOpacity: Number(e.target.value) })} />
                  </div>
                </div>
              )}

              <button onClick={() => deleteLayer(selectedLayer.id)} className="text-[11px] font-semibold text-red-500 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50">
                이 텍스트 삭제
              </button>
            </div>
          )}
        </div>

        <div className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">이미지 에셋 ({assets.length})</p>
            <button className={btnGhost} onClick={() => assetFileInputRef.current?.click()}>
              + 추가
            </button>
            <input
              ref={assetFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAssetFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {assets.map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  setSelectedKind("asset");
                  setSelectedId(a.id);
                }}
                className={`${chipCls} ${selectedKind === "asset" && selectedId === a.id ? "border-periwinkle bg-periwinkle/5" : ""}`}
              >
                <span className="flex-1 truncate">{a.name || "이미지 에셋"}</span>
                <span className="text-gray-400">{a.widthPct}%</span>
              </div>
            ))}
          </div>
          {selectedAsset && (
            <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-2.5">
              <div>
                <p className={labelCls}><span>크기</span><span>{selectedAsset.widthPct}%</span></p>
                <input type="range" min={5} max={80} value={selectedAsset.widthPct} className="w-full accent-periwinkle" onChange={(e) => updateAsset(selectedAsset.id, { widthPct: Number(e.target.value) })} />
              </div>
              <button onClick={() => deleteAsset(selectedAsset.id)} className="text-[11px] font-semibold text-red-500 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50">
                이 이미지 삭제
              </button>
            </div>
          )}
          {!selectedAsset && (
            <p className="text-[10px] text-gray-400">로고·스티커 등 배경과 분리된 이미지를 올려 캔버스에서 자유롭게 드래그해 배치하세요.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {weeklyBatch && (
            <button
              onClick={sendAsPopup}
              disabled={sendingPopup}
              className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold disabled:opacity-50"
            >
              {sendingPopup ? "보내는 중..." : "이 시안을 팝업(표지)으로 슬랙 발송"}
            </button>
          )}
          <button onClick={exportPng} className="w-full py-2.5 rounded-xl bg-periwinkle text-white text-sm font-bold">
            PNG로 다운로드
          </button>
          <button onClick={toggleSpec} className={btnGhost}>
            디자인 가이드 값 보기 / 복사
          </button>
          {specOpen && (
            <div className="flex flex-col gap-1.5">
              <textarea readOnly value={specText} className="text-[10.5px] font-mono border border-gray-200 rounded-lg p-2 h-40 resize-none bg-gray-50" />
              <button onClick={copySpec} className={btnGhost}>
                클립보드에 복사
              </button>
            </div>
          )}
        </div>

        {weeklyBatch && weeklyBatch.weekType === mode && (
          <div className="border border-periwinkle/30 rounded-xl p-3 flex flex-col gap-2.5 bg-periwinkle/[0.03]">
            <p className="text-xs font-semibold text-navy">
              일괄 생성 · 슬랙 발송 ({weeklyBatch.restaurants.length}개 식당)
            </p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {mode === "coupon"
                ? "위 텍스트에 {{가게명}} / {{쿠폰내용}} 을 넣으면 식당마다 자동으로 바뀝니다 — 배경은 고정 템플릿 그대로, 아래에서 식당별 쿠폰 문구를 입력하세요."
                : "지금 배치된 문구·그라디언트·에셋은 그대로 두고, 배경 사진만 식당마다 자동으로 등록된 메인 사진으로 바뀝니다."}
            </p>

            {mode === "coupon" && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {weeklyBatch.restaurants.map((r) => (
                  <div key={r.restaurant_id} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500 w-20 shrink-0 truncate">{r.name}</span>
                    <input
                      type="text"
                      value={weeklyBatch.couponTexts[r.restaurant_id] || ""}
                      onChange={(e) =>
                        weeklyBatch.onCouponTextsChange({
                          ...weeklyBatch.couponTexts,
                          [r.restaurant_id]: e.target.value,
                        })
                      }
                      placeholder="쿠폰 내용 (예: 첫 방문 15% 할인)"
                      className="flex-1 text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-periwinkle"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={runBatch}
              disabled={!!batchProgress && batchProgress.done < batchProgress.total}
              className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold disabled:opacity-50"
            >
              {batchProgress && batchProgress.done < batchProgress.total
                ? `생성 중... (${batchProgress.done}/${batchProgress.total})`
                : "일괄 생성 → 슬랙 발송"}
            </button>
            {batchProgress && batchProgress.done === batchProgress.total && batchErrors.length === 0 && (
              <p className="text-[11px] text-emerald-600 font-semibold">
                {batchProgress.total}건 전부 슬랙으로 보냈습니다.
              </p>
            )}
            {batchErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
                <p className="text-[10px] font-bold text-red-600 mb-1">{batchErrors.length}건 실패</p>
                {batchErrors.map((e, i) => (
                  <p key={i} className="text-[10px] text-red-500 leading-relaxed">
                    {e}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 왼쪽 설정 패널이 텍스트 레이어를 펼치면 캔버스보다 훨씬 길어져서, 스크롤하면
          미리보기가 화면 밖으로 같이 밀려나 안 보이는 문제가 있었다(RD 2026-08-26
          스크린샷 — "텍스트 수정 시 사진이 안 보임"). lg 화면에서 이 열을 상단에
          붙여(sticky) 스크롤해도 계속 보이게 한다. */}
      <div className="flex-1 flex items-start justify-center lg:sticky lg:top-4 lg:self-start">
        <div
          className="bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#ffffff_0%_50%)] rounded-2xl border border-gray-100 shadow-sm overflow-hidden w-full max-w-[460px]"
          style={{ backgroundSize: "18px 18px" }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "auto", display: "block", touchAction: "none", aspectRatio: `${ratio.w} / ${ratio.h}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </div>
    </div>
  );
}
