import { supabase } from "@/lib/supabase";
import type { ItemSaveValues, WishItem, WishLevelCounts, WishLevelKey } from "@/types/wish-item";

export type ProductSort = "latest" | "oldest";

// ISS-011 Feed·대량 목록은 20개 단위로 추가 Load한다.
export const PRODUCT_PAGE_SIZE = 20;

export const productKeys = {
  all: ["products"] as const,
  list: (sort: ProductSort, wishLevel: WishLevelKey | null, query = "") =>
    [...productKeys.all, "list", sort, wishLevel, query] as const,
  counts: (query = "") => [...productKeys.all, "counts", query] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
};

type ProductRow = {
  id: number;
  name: string;
  brand: string | null;
  price: number | null;
  image_url: string | null;
  product_folders: { folders: { kind: "custom" | "owned" } | null }[];
};

/** ALL-004 상품명·브랜드에서 찾는다. 브랜드가 없는 상품은 브랜드 검색에서 빠진다. */
function searchFilter(query: string) {
  // PostgREST or 필터는 쉼표·괄호를 구분자로 쓰니 검색어에서 뺀다.
  const keyword = query.replace(/[,()]/g, " ").trim();
  return `name.ilike.%${keyword}%,brand.ilike.%${keyword}%`;
}

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
  query = "",
  page,
}: {
  sort: ProductSort;
  wishLevel: WishLevelKey | null;
  query?: string;
  page: number;
}): Promise<WishItem[]> {
  let request = supabase
    .from("products")
    .select("id, name, brand, price, image_url, product_folders(folders(kind))");
  // 소장 상품은 위시레벨이 null이라 레벨 필터에서 자연히 빠진다(ALL-008).
  if (wishLevel) request = request.eq("wish_level", wishLevel);
  if (query) request = request.or(searchFilter(query));
  const from = page * PRODUCT_PAGE_SIZE;
  const { data, error } = await request
    .order("saved_at", { ascending: sort === "oldest" })
    .order("id", { ascending: false })
    .range(from, from + PRODUCT_PAGE_SIZE - 1);
  if (error) throw error;
  return (data as ProductRow[]).map(toWishItem);
}

async function countProducts(query: string, wishLevel?: WishLevelKey) {
  let request = supabase.from("products").select("id", { count: "exact", head: true });
  if (wishLevel) request = request.eq("wish_level", wishLevel);
  if (query) request = request.or(searchFilter(query));
  const { count, error } = await request;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchProductCounts(
  query = "",
): Promise<{ total: number; levels: WishLevelCounts }> {
  const [total, high, medium, low] = await Promise.all([
    countProducts(query),
    countProducts(query, "high"),
    countProducts(query, "medium"),
    countProducts(query, "low"),
  ]);
  return { total, levels: { high, medium, low } };
}

export async function deleteProducts(ids: readonly string[]) {
  const { error } = await supabase.from("products").delete().in("id", ids.map(Number));
  if (error) throw error;
}

export type ProductDetail = { values: ItemSaveValues; isOwned: boolean };

export async function fetchProduct(id: string): Promise<ProductDetail> {
  const { data, error } = await supabase
    .from("products")
    .select("name, brand, price, url, image_url, wish_level, product_folders(folders(kind))")
    .eq("id", Number(id))
    .single();
  if (error) throw error;
  const row = data as Omit<ProductRow, "id"> & {
    url: string;
    wish_level: WishLevelKey | null;
  };
  return {
    isOwned: row.product_folders.some((relation) => relation.folders?.kind === "owned"),
    values: {
      name: row.name,
      brand: row.brand ?? "",
      price: row.price === null ? "" : String(row.price),
      sourceUrl: row.url,
      thumbnailUrl: row.image_url,
      wishLevel: row.wish_level,
    },
  };
}

export type ProductPatch = Partial<Pick<ItemSaveValues, "name" | "brand" | "price" | "wishLevel">>;

/** PDT-005·006 링크와 대표 이미지는 고칠 수 없어 넘기지 않는다. 넘긴 값만 바꾼다. */
export async function updateProduct(id: string, patch: ProductPatch) {
  const { error } = await supabase
    .from("products")
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      // 빈 브랜드는 null로 저장한다(브랜드 줄을 숨긴다).
      ...(patch.brand !== undefined && { brand: patch.brand.trim() || null }),
      ...(patch.price !== undefined && {
        price: patch.price === "" ? null : Number(patch.price.replace(/\D/g, "")),
      }),
      ...(patch.wishLevel !== undefined && { wish_level: patch.wishLevel }),
    })
    .eq("id", Number(id));
  if (error) throw error;
}
