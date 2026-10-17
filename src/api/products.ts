import { supabase } from "@/lib/supabase";
import type { WishItem, WishLevelCounts, WishLevelKey } from "@/types/wish-item";

export type ProductSort = "latest" | "oldest";

// ISS-011 Feed·대량 목록은 20개 단위로 추가 Load한다.
export const PRODUCT_PAGE_SIZE = 20;

export const productKeys = {
  all: ["products"] as const,
  list: (sort: ProductSort, wishLevel: WishLevelKey | null) =>
    [...productKeys.all, "list", sort, wishLevel] as const,
  counts: () => [...productKeys.all, "counts"] as const,
};

type ProductRow = {
  id: number;
  name: string;
  brand: string | null;
  price: number | null;
  image_url: string | null;
  product_folders: { folders: { kind: "custom" | "owned" } | null }[];
};

function toWishItem(row: ProductRow): WishItem {
  return {
    id: String(row.id),
    name: row.name,
    brand: row.brand,
    price: row.price,
    thumbnailUrl: row.image_url,
    // 소장 여부는 컬럼이 아니라 나의 소장템 폴더에 담겼는지로 정한다(PDT-008).
    isOwned: row.product_folders.some((relation) => relation.folders?.kind === "owned"),
  };
}

/** ALL-001·002 저장일 순으로 한 페이지를 가져온다. 같은 시각이면 최신 순·오래된 순 모두 id 내림차순. */
export async function fetchProductPage({
  sort,
  wishLevel,
  page,
}: {
  sort: ProductSort;
  wishLevel: WishLevelKey | null;
  page: number;
}): Promise<WishItem[]> {
  let query = supabase
    .from("products")
    .select("id, name, brand, price, image_url, product_folders(folders(kind))");
  // 소장 상품은 위시레벨이 null이라 레벨 필터에서 자연히 빠진다(ALL-008).
  if (wishLevel) query = query.eq("wish_level", wishLevel);
  const from = page * PRODUCT_PAGE_SIZE;
  const { data, error } = await query
    .order("saved_at", { ascending: sort === "oldest" })
    .order("id", { ascending: false })
    .range(from, from + PRODUCT_PAGE_SIZE - 1);
  if (error) throw error;
  return (data as ProductRow[]).map(toWishItem);
}

async function countProducts(wishLevel?: WishLevelKey) {
  let query = supabase.from("products").select("id", { count: "exact", head: true });
  if (wishLevel) query = query.eq("wish_level", wishLevel);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** ALL 상단 "저장한 아이템 N개"와 위시레벨별 개수(ALL-008). */
export async function fetchProductCounts(): Promise<{ total: number; levels: WishLevelCounts }> {
  const [total, high, medium, low] = await Promise.all([
    countProducts(),
    countProducts("high"),
    countProducts("medium"),
    countProducts("low"),
  ]);
  return { total, levels: { high, medium, low } };
}

export async function deleteProducts(ids: readonly string[]) {
  const { error } = await supabase.from("products").delete().in("id", ids.map(Number));
  if (error) throw error;
}
