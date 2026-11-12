import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createFolder, folderKeys } from "@/api/folders";
import { trackEvent } from "@/lib/analytics";

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFolder,
    onSuccess: (folder) => {
      trackEvent("folder_create", { folder_id: folder.id });
      return queryClient.invalidateQueries({ queryKey: folderKeys.list() });
    },
  });
}
