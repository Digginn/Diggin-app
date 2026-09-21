import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

import { colors, fontFamily, typographyUtilities } from "./src/theme";

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors,
      fontFamily,
    },
  },
  plugins: [
    plugin(({ addUtilities }) => addUtilities(typographyUtilities())),
  ],
} satisfies Config;
