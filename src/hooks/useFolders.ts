import { useQuery } from "@tanstack/react-query";

import { fetchFolders, folderKeys } from "@/api/folders";

export function useFolders(isEnabled = true) {
  return useQuery({ queryKey: folderKeys.list(), queryFn: fetchFolders, enabled: isEnabled });
}
