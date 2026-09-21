type Weight = "Regular" | "Medium" | "SemiBold" | "Bold";

type Token = {
  weight: Weight;
  size: number;
  ratio: number;
  tracking?: number;
};

export const typography = {
  "h1": { weight: "SemiBold", size: 28, ratio: 1.4 },
  "h2": { weight: "SemiBold", size: 24, ratio: 1.5 },

  "b1": { weight: "Regular", size: 16, ratio: 1.45 },
  "b2": { weight: "Medium", size: 15, ratio: 1.4 },
  "b3": { weight: "Medium", size: 14, ratio: 1.4 },
  "b4": { weight: "Regular", size: 13, ratio: 1.5, tracking: -1 },

  "label-20": { weight: "SemiBold", size: 20, ratio: 1.5 },
  "label-18-semibold": { weight: "SemiBold", size: 18, ratio: 1.35 },
  "label-18-medium": { weight: "Medium", size: 18, ratio: 1.35 },
  "label-16-bold": { weight: "Bold", size: 16, ratio: 1.2, tracking: -2 },
  "label-16-semibold": { weight: "SemiBold", size: 16, ratio: 1.6, tracking: -2 },
  "label-16-medium": { weight: "Medium", size: 16, ratio: 1.6, tracking: -2 },
  "label-16-regular": { weight: "Regular", size: 16, ratio: 1.6, tracking: -2 },
  "label-14": { weight: "SemiBold", size: 14, ratio: 1.5, tracking: -1 },
  "label-12-regular": { weight: "Regular", size: 12, ratio: 1.2, tracking: -1 },

  "price-detail": { weight: "Bold", size: 20, ratio: 1.4, tracking: -2 },
  "discount": { weight: "Medium", size: 20, ratio: 1.4, tracking: -4 },
  "price-s": { weight: "Bold", size: 12, ratio: 1.2 },
  "brand-s": { weight: "Bold", size: 10, ratio: 1.2 },
  "name-s": { weight: "Medium", size: 10, ratio: 1.2 },

  "nickname": { weight: "Bold", size: 14, ratio: 1.5, tracking: -1 },
  "note": { weight: "Regular", size: 13, ratio: 1.4, tracking: -1 },
  "meta": { weight: "Medium", size: 12, ratio: 1.4, tracking: -2 },
  "tag": { weight: "Medium", size: 11, ratio: 1.5, tracking: -1 },
} satisfies Record<string, Token>;

export type TypographyToken = keyof typeof typography;

export const fontFamily = {
  "pretendard": ["Pretendard-Regular"],
  "pretendard-medium": ["Pretendard-Medium"],
  "pretendard-semibold": ["Pretendard-SemiBold"],
  "pretendard-bold": ["Pretendard-Bold"],
};

export function typographyUtilities() {
  return Object.fromEntries(
    (Object.entries(typography) as [string, Token][]).map(([name, t]) => [
      `.font-${name}`,
      {
        fontFamily: `Pretendard-${t.weight}`,
        fontSize: `${t.size}px`,
        lineHeight: `${+(t.size * t.ratio).toFixed(2)}px`,
        letterSpacing: `${+((t.size * (t.tracking ?? 0)) / 100).toFixed(2)}px`,
      },
    ]),
  );
}
