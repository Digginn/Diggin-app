import { QueryClient } from "@tanstack/react-query";

// 기본 3번 재시도는 실패 화면이 뜨기까지 7초 넘게 걸려 한 번만 다시 시도한다.
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
