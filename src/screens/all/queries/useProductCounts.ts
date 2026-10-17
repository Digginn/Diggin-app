import { useQuery } from "@tanstack/react-query";

import { fetchProductCounts, productKeys } from "@/api/products";

export function useProductCounts() {
  return useQuery({ queryKey: productKeys.counts(), queryFn: fetchProductCounts });
}
