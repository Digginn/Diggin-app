import { useInfiniteQuery } from "@tanstack/react-query";

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
    // 이전 검색 결과만 두고, 검색어 없는 ALL 목록은 두지 않는다(첫 검색 때 ALL 전체가 깜빡임).
    placeholderData: (previous, previousQuery) =>
      query && previousQuery?.queryKey.at(-1) ? previous : undefined,
  });
}
