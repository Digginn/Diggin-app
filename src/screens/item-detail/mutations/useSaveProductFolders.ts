import { useMutation, useQueryClient } from "@tanstack/react-query";

import { folderKeys, saveProductFolders } from "@/api/folders";
import { productKeys } from "@/api/products";

export function useSaveProductFolders(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderIds: string[]) => saveProductFolders(productId, folderIds),
    // 소장 여부·위시레벨이 바뀌고 폴더 미리보기·개수도 바뀐다.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]),
  });
}
