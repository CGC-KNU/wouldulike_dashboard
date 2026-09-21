import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* 회색 계열은 CSS 변수다 — 18시 다크 모드가 [data-theme=dark] 에서 값만 바꾼다 (0919).
           bg-white·text-gray-500·border-gray-200 를 쓰는 300여 곳을 안 건드리고 뒤집는다.
           <alpha-value> 가 있어야 text-gray-500/60 같은 투명도 표기가 그대로 산다. */
        gray: {
          50: "rgb(var(--g-50) / <alpha-value>)", 100: "rgb(var(--g-100) / <alpha-value>)", 200: "rgb(var(--g-200) / <alpha-value>)",
          300: "rgb(var(--g-300) / <alpha-value>)", 400: "rgb(var(--g-400) / <alpha-value>)", 500: "rgb(var(--g-500) / <alpha-value>)",
          600: "rgb(var(--g-600) / <alpha-value>)", 700: "rgb(var(--g-700) / <alpha-value>)", 800: "rgb(var(--g-800) / <alpha-value>)",
          900: "rgb(var(--g-900) / <alpha-value>)", 950: "rgb(var(--g-950) / <alpha-value>)",
        },
        navy: "#050072",
        periwinkle: "#6366E0",
        "dark-card": "#182031",
        gold: "#E0A23C",
        /* Libra 고유색 — 비서(리브라) UI 팔레트 그대로. 세틀라이트 네이비와 구분되는 자리 표시. */
        libra: { DEFAULT: "#2BBE9B", deep: "#12836A", soft: "#E9F7F2" },
        background: "rgb(var(--bg) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
        // 브랜드 디스플레이 — 로고 워드마크와 같은 서체. 제목·상호에만 (globals.css 주석 참고)
        display: ["Ria Sans", "Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
