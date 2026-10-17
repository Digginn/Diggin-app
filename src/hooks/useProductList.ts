import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { fetchProductPage, PRODUCT_PAGE_SIZE, productKeys, type ProductSort } from "@/api/products";
import type { WishLevelKey } from "@/types/wish-item";

export function useProductList(
  sort: ProductSort,
  wishLevel: WishLevelKey | null,
  query = "",
  isEnabled = true,
) {
  return useInfiniteQuery({
    queryKey: productKeys.list(sort, wishLevel, query),
    queryFn: ({ pageParam }) => fetchProductPage({ sort, wishLevel, query, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PRODUCT_PAGE_SIZE ? undefined : pages.length,
    enabled: isEnabled,
    // 검색어를 칠 때마다 빈 화면이 깜빡이지 않게 결과가 올 때까지 이전 결과를 둔다.
    placeholderData: query ? keepPreviousData : undefined,
  });
}
