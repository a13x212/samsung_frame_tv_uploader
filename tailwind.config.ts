import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Design tokens (see the approved mockups). Text never goes lighter
      // than `muted` (#555A62).
      colors: {
        ground: "#F4F5F6", // page background
        surface: "#FFFFFF", // cards, header, panels
        ink: "#15171A", // body text, primary buttons
        muted: "#555A62", // secondary text (lightest allowed text colour)
        line: {
          DEFAULT: "#E1E3E6", // hairline borders / dividers
          strong: "#D5D8DC", // control borders
        },
        accent: {
          DEFAULT: "#2447D6", // selection, focus, links
          tint: "#EEF1FD", // selected background
        },
        danger: {
          DEFAULT: "#B3261E",
          line: "#E3B9B4", // border for outlined destructive buttons
        },
        success: "#1B7F4B",
        wall: "#E7E9EB", // grey wall behind TV previews
        bezel: "#1A1A1A", // TV frame
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: [
          "var(--font-space-grotesk)",
          "Space Grotesk",
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      maxWidth: {
        content: "1376px",
      },
    },
  },
  plugins: [],
};

export default config;
