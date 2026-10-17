import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productKeys, updateProduct, type ProductPatch } from "@/api/products";

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProductPatch) => updateProduct(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}
