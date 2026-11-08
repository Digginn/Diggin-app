import { useQuery } from "@tanstack/react-query";

import { fetchFolderCounts, folderKeys } from "@/api/folders";

export function useFolderCounts(folderId: string) {
  return useQuery({
    queryKey: folderKeys.counts(folderId),
    queryFn: () => fetchFolderCounts(folderId),
  });
}
