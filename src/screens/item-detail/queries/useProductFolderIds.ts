import { useQuery } from "@tanstack/react-query";

import { fetchProductFolderIds, folderKeys } from "@/api/folders";

export function useProductFolderIds(productId: string) {
  return useQuery({
    queryKey: folderKeys.ofProduct(productId),
    queryFn: () => fetchProductFolderIds(productId),
  });
}
