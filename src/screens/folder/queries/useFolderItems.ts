import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

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
    // 검색어를 칠 때마다 빈 화면이 깜빡이지 않게 결과가 올 때까지 이전 결과를 둔다.
    placeholderData: query ? keepPreviousData : undefined,
  });
}
