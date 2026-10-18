import { useMutation, useQueryClient } from "@tanstack/react-query";

import { folderKeys } from "@/api/folders";
import { deleteProducts, productKeys } from "@/api/products";

export function useDeleteProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProducts,
    // 폴더 미리보기·폴더 안 목록에도 같은 상품이 보인다.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]),
  });
}
