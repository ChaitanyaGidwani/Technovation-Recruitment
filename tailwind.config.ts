import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        arcade: {
          bg: "#0a0118",
          panel: "#160b2e",
          screen: "#05130a",
          steel: "#2a1a4a",
          neon: "#39ff14",
          cyan: "#00f0ff",
          ice: "#cfe8ff",
          magenta: "#ff00d4",
          yellow: "#ffe600",
          red: "#ff2e63",
          purple: "#a020f0",
        },
      },
      fontFamily: {
        pixel: ["var(--font-press-start)", "monospace"],
        term: ["var(--font-vt323)", "monospace"],
      },
      boxShadow: {
        neon: "0 0 5px #39ff14, 0 0 15px #39ff14, 0 0 30px #39ff14",
        cyan: "0 0 5px #00f0ff, 0 0 15px #00f0ff",
      },
      keyframes: {
        flicker: {
          "0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%": { opacity: "1" },
          "20%, 24%, 55%": { opacity: "0.6" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        flicker: "flicker 3s linear infinite",
        blink: "blink 1s step-end infinite",
        scan: "scan 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
