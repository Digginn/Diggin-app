import { useQuery } from "@tanstack/react-query";

import { fetchProductCounts, productKeys } from "@/api/products";

export function useProductCounts(query = "", isEnabled = true) {
  return useQuery({
    queryKey: productKeys.counts(query),
    queryFn: () => fetchProductCounts(query),
    enabled: isEnabled,
    // 이전 검색 결과만 두고, 검색어 없는 ALL 개수는 두지 않는다(첫 검색 때 ALL 전체가 깜빡임).
    placeholderData: (previous, previousQuery) =>
      query && previousQuery?.queryKey.at(-1) ? previous : undefined,
  });
}
