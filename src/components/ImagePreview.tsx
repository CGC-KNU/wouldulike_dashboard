"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

type PreviewApi = { open: (src: string, alt?: string) => void };

const ImagePreviewContext = createContext<PreviewApi | null>(null);

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState("");

  const open = useCallback((next: string, nextAlt = "") => {
    if (!next) return;
    setSrc(next);
    setAlt(nextAlt);
  }, []);

  const close = useCallback(() => setSrc(null), []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [src, close]);

  return (
    <ImagePreviewContext.Provider value={{ open }}>
      {children}
      {src && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 sm:p-8"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 text-white text-xl leading-none hover:bg-white/25"
            aria-label="닫기"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt || "확대 사진"}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </ImagePreviewContext.Provider>
  );
}

export function useImagePreview(): PreviewApi | null {
  return useContext(ImagePreviewContext);
}

export function PreviewableImg({
  src,
  alt = "",
  className = "",
  onClick,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const preview = useImagePreview();
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`cursor-zoom-in ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        if (!e.defaultPrevented) preview?.open(String(src), alt);
      }}
      {...rest}
    />
  );
}
