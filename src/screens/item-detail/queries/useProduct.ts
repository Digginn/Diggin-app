import { useQuery } from "@tanstack/react-query";

import { fetchProduct, productKeys } from "@/api/products";

export function useProduct(id: string) {
  return useQuery({ queryKey: productKeys.detail(id), queryFn: () => fetchProduct(id) });
}
