import { useMutation, useQueryClient } from "@tanstack/react-query";

import { folderKeys, renameFolder } from "@/api/folders";

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: folderKeys.list() }),
  });
}
