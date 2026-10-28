export type WishItem = {
  id: string;
  name: string;
  /** null이면 가격 정보 없음, 0은 직접 입력한 0원(ALL-005). */
  price: number | null;
  brand?: string | null;
  thumbnailUrl?: string | null;
  isOwned?: boolean;
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

/** 아이템 저장 시트가 다루는 입력 값. */
export type ItemSaveValues = {
  /** 추출 가능한 카테고리·연령 표시. 사용자가 이름을 수정해도 원래의 제한 정보를 보존한다. */
  restrictionLabels?: string[];
  name: string;
  brand: string;
  price: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  wishLevel: WishLevelKey | null;
};
