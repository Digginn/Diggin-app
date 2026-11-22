import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { checkSession } from "@/lib/sessionCheck";

// 끊긴 세션의 조회는 빈 목록이나 권한 오류(42501)로 돌아온다. 권한 오류가 나면 세션부터 확인한다.
const onError = (error: unknown) => {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "42501")
    void checkSession();
};

// 기본 3번 재시도는 실패 화면이 뜨기까지 7초 넘게 걸려 한 번만 다시 시도한다.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { retry: 1 } },
});
