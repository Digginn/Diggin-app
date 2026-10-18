import { PRODUCT_PAGE_SIZE, type ProductSort } from "@/api/products";
import { supabase } from "@/lib/supabase";
import type { FolderItem } from "@/screens/folder/components/FolderCard";
import type { WishItem, WishLevelCounts, WishLevelKey } from "@/types/wish-item";

export const folderKeys = {
  all: ["folders"] as const,
  list: () => [...folderKeys.all, "list"] as const,
  items: (folderId: string, sort: ProductSort, wishLevel: WishLevelKey | null, query: string) =>
    [...folderKeys.all, "items", folderId, sort, wishLevel, query] as const,
  counts: (folderId: string) => [...folderKeys.all, "counts", folderId] as const,
  ofProduct: (productId: string) => [...folderKeys.all, "of-product", productId] as const,
};

export class FolderError extends Error {
  constructor(public readonly reason: "limit" | "duplicate" | "unknown") {
    super(reason);
  }
}

function toFolderError(error: { code?: string; message?: string }) {
  if (error.message === "folder_limit_reached") return new FolderError("limit");
  if (error.code === "23505") return new FolderError("duplicate");
  return new FolderError("unknown");
}

type FolderRow = {
  id: number;
  name: string;
  kind: "custom" | "owned";
  created_at: string;
  last_added_at: string | null;
  items: { count: number }[];
  preview: { products: { image_url: string | null } | null }[];
};

export async function fetchFolders(): Promise<FolderItem[]> {
  const { data, error } = await supabase
    .from("folders")
    .select(
      "id, name, kind, created_at, last_added_at, items:product_folders(count), preview:product_folders(created_at, products(image_url))",
    )
    .order("created_at", { ascending: false })
    // CSV로 한 번에 만든 폴더는 만든 시각이 같아 순서가 매번 바뀐다. 같으면 만든 순서(id)로 고정한다.
    .order("id", { ascending: false })
    .order("created_at", { referencedTable: "preview", ascending: false })
    .limit(3, { referencedTable: "preview" });
  if (error) throw error;
  return (data as unknown as FolderRow[]).map((row) => ({
    id: String(row.id),
    name: row.name,
    itemCount: row.items[0]?.count ?? 0,
    createdAt: Date.parse(row.created_at),
    lastItemAddedAt: row.last_added_at ? Date.parse(row.last_added_at) : undefined,
    isOwnedItems: row.kind === "owned",
    // 이미지가 없는 아이템은 빈 칸으로 두고 미리보기가 기본 이미지를 그린다.
    thumbnails: row.preview.map((relation) => relation.products?.image_url ?? ""),
  }));
}

export async function createFolder(name: string): Promise<FolderItem> {
  const { data, error } = await supabase
    .from("folders")
    .insert({ name })
    .select("id, name, created_at")
    .single();
  if (error) throw toFolderError(error);
  return {
    id: String(data.id),
    name: data.name,
    itemCount: 0,
    createdAt: Date.parse(data.created_at),
  };
}

export async function renameFolder(id: string, name: string) {
  const { error } = await supabase.from("folders").update({ name }).eq("id", Number(id));
  if (error) throw toFolderError(error);
}

/** FLD-007 폴더만 지우고 상품은 ALL에 남는다(관계만 지워진다). */
export async function deleteFolder(id: string) {
  const { error } = await supabase.from("folders").delete().eq("id", Number(id));
  if (error) throw error;
}

type FolderProductRow = {
  products: {
    id: number;
    name: string;
    brand: string | null;
    price: number | null;
    image_url: string | null;
    product_folders: { folders: { kind: "custom" | "owned" } | null }[];
  };
};

export async function fetchFolderItems({
  folderId,
  sort,
  wishLevel,
  query,
  page,
}: {
  folderId: string;
  sort: ProductSort;
  wishLevel: WishLevelKey | null;
  query: string;
  page: number;
}): Promise<WishItem[]> {
  let request = supabase
    .from("product_folders")
    .select("products!inner(id, name, brand, price, image_url, product_folders(folders(kind)))")
    .eq("folder_id", Number(folderId));
  if (wishLevel) request = request.eq("products.wish_level", wishLevel);
  if (query) {
    // PostgREST or 필터는 쉼표·괄호를 구분자로 쓰니 검색어에서 뺀다.
    const keyword = query.replace(/[,()]/g, " ").trim();
    request = request.or(`name.ilike.%${keyword}%,brand.ilike.%${keyword}%`, {
      referencedTable: "products",
    });
  }
  const from = page * PRODUCT_PAGE_SIZE;
  const { data, error } = await request
    .order("created_at", { ascending: sort === "oldest" })
    .order("product_id", { ascending: false })
    .range(from, from + PRODUCT_PAGE_SIZE - 1);
  if (error) throw error;
  return (data as unknown as FolderProductRow[]).map(({ products: row }) => ({
    id: String(row.id),
    name: row.name,
    brand: row.brand,
    price: row.price,
    thumbnailUrl: row.image_url,
    isOwned: row.product_folders.some((relation) => relation.folders?.kind === "owned"),
  }));
}

async function countFolderItems(folderId: string, wishLevel?: WishLevelKey) {
  let request = supabase
    .from("product_folders")
    .select("product_id, products!inner(wish_level)", { count: "exact", head: true })
    .eq("folder_id", Number(folderId));
  if (wishLevel) request = request.eq("products.wish_level", wishLevel);
  const { count, error } = await request;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchFolderCounts(
  folderId: string,
): Promise<{ total: number; levels: WishLevelCounts }> {
  const [total, high, medium, low] = await Promise.all([
    countFolderItems(folderId),
    countFolderItems(folderId, "high"),
    countFolderItems(folderId, "medium"),
    countFolderItems(folderId, "low"),
  ]);
  return { total, levels: { high, medium, low } };
}

export async function fetchProductFolderIds(productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_folders")
    .select("folder_id")
    .eq("product_id", Number(productId));
  if (error) throw error;
  return data.map((row) => String(row.folder_id));
}

/**
 * PDT-003·008 폴더 관리 시트의 최종 선택을 서버가 한 트랜잭션으로 반영한다.
 * 이전 상태와의 차이는 서버가 계산해서, 중간에 실패해도 일부만 바뀌지 않는다.
 */
export async function saveProductFolders(productId: string, folderIds: readonly string[]) {
  const { error } = await supabase.rpc("set_product_folders", {
    target_product_id: Number(productId),
    folder_ids: folderIds.map(Number),
  });
  if (error) throw error;
}
