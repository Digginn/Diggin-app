export type WishItem = {
  id: string;
  name: string;
  price: number;
  brand?: string | null;
  thumbnailUrl?: string | null;
};

export type WishLevelCounts = {
  high: number;
  medium: number;
  low: number;
};
