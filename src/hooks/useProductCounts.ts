import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchProductCounts, productKeys } from "@/api/products";

export function useProductCounts(query = "", isEnabled = true) {
  return useQuery({
    queryKey: productKeys.counts(query),
    queryFn: () => fetchProductCounts(query),
    enabled: isEnabled,
    // 검색어를 칠 때마다 빈 화면이 깜빡이지 않게 결과가 올 때까지 이전 결과를 둔다.
    placeholderData: query ? keepPreviousData : undefined,
  });
}
