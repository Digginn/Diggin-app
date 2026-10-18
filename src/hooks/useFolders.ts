import { useQuery } from "@tanstack/react-query";

import { fetchFolders, folderKeys } from "@/api/folders";

export function useFolders() {
  return useQuery({ queryKey: folderKeys.list(), queryFn: fetchFolders });
}
