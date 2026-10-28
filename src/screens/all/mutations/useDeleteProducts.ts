import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";

import { folderKeys } from "@/api/folders";
import { deleteProducts, productKeys } from "@/api/products";
import { trackEvent } from "@/lib/analytics";

export function useDeleteProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProducts,
    // 폴더 미리보기·폴더 안 목록에도 같은 상품이 보인다.
    onSuccess: (_, ids) => {
      // 한 번에 지운 상품은 같은 delete_batch_id로 묶어 상품마다 보낸다.
      const batchId = randomUUID();
      for (const id of ids)
        trackEvent("product_delete", { product_id: id, delete_batch_id: batchId });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]);
    },
  });
}
