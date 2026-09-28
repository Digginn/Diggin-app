import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

import { colors, fieldShape, fontFamily, layout, typographyUtilities } from "./src/theme";

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors,
      fontFamily,
      borderRadius: { field: fieldShape.borderRadius },
      borderWidth: { field: fieldShape.borderWidth },
      // Figma 그리드 스펙. px-margin(좌우 여백 24), gap-gutter(컬럼 간격 16)
      spacing: layout,
    },
  },
  plugins: [plugin(({ addUtilities }) => addUtilities(typographyUtilities()))],
} satisfies Config;
