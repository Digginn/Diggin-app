export type WishItem = {
  id: string;
  name: string;
  price: number;
  brand?: string | null;
  thumbnailUrl?: string | null;
  isOwned?: boolean;
  /** 소장 등록 시각 (Unix milliseconds). 소장템끼리 최근 소장 순으로 정렬한다. */
  ownedAt?: number;
};

export type WishLevelKey = "high" | "medium" | "low";

export const WISH_LEVEL_LABELS: Record<WishLevelKey, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

export const WISH_LEVEL_DOT_CLASSNAMES: Record<WishLevelKey, string> = {
  high: "bg-gray-600",
  medium: "bg-gray-500",
  low: "bg-gray-400",
};

export type WishLevelCounts = {
  high: number;
  medium: number;
  low: number;
};
