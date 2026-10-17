import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchFolderItems, folderKeys } from "@/api/folders";
import { PRODUCT_PAGE_SIZE, type ProductSort } from "@/api/products";
import type { WishLevelKey } from "@/types/wish-item";

export function useFolderItems(
  folderId: string,
  sort: ProductSort,
  wishLevel: WishLevelKey | null,
  query: string,
) {
  return useInfiniteQuery({
    queryKey: folderKeys.items(folderId, sort, wishLevel, query),
    queryFn: ({ pageParam }) =>
      fetchFolderItems({ folderId, sort, wishLevel, query, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PRODUCT_PAGE_SIZE ? undefined : pages.length,
  });
}
