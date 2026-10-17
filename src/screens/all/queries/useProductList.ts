import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchProductPage, PRODUCT_PAGE_SIZE, productKeys, type ProductSort } from "@/api/products";
import type { WishLevelKey } from "@/types/wish-item";

export function useProductList(sort: ProductSort, wishLevel: WishLevelKey | null) {
  return useInfiniteQuery({
    queryKey: productKeys.list(sort, wishLevel),
    queryFn: ({ pageParam }) => fetchProductPage({ sort, wishLevel, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PRODUCT_PAGE_SIZE ? undefined : pages.length,
  });
}
