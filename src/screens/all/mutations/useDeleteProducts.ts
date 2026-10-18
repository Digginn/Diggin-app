import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteProducts, productKeys } from "@/api/products";

export function useDeleteProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProducts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}
