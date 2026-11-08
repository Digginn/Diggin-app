import { useMutation, useQueryClient } from "@tanstack/react-query";

import { folderKeys } from "@/api/folders";
import { productKeys, updateProduct, type ProductPatch } from "@/api/products";

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProductPatch) => updateProduct(id, patch),
    // 폴더 미리보기·폴더 안 목록에도 같은 상품이 보인다.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]),
  });
}
