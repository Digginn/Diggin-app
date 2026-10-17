import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productKeys, updateProduct, type ProductPatch } from "@/api/products";

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProductPatch) => updateProduct(id, patch),
    // 상세·ALL 목록·위시레벨 개수에 바로 반영한다(PDT-001).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}
