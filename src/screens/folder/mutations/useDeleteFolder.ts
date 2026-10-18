import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteFolder, folderKeys } from "@/api/folders";
import { productKeys } from "@/api/products";

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFolder,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
      ]),
  });
}
