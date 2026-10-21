import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { productKeys } from "@/api/products";

import { importCsv } from "../api/importCsv";

export function useImportCsv() {
  const queryClient = useQueryClient();
  return useCallback(
    async (...args: Parameters<typeof importCsv>) => {
      const result = await importCsv(...args);
      if (result && !("error" in result)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: productKeys.all }),
          // 폴더 PR #86의 folderKeys.all과 같은 prefix. 목록·개수·상품 관계를 함께 갱신한다.
          queryClient.invalidateQueries({ queryKey: ["folders"] }),
        ]);
      }
      return result;
    },
    [queryClient],
  );
}
