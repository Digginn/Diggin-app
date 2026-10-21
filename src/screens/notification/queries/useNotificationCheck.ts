import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuth } from "@/contexts/AuthContext";

import { markNotificationsChecked, notificationKeys } from "../api/notifications";

/**
 * 알림함을 열 때 한 번 확인 처리하고, 이번에 안 읽음으로 보여 줄 기준인 이전 확인 시각을 준다.
 * 다시 불러와도 기준이 바뀌지 않게 화면을 연 시각을 키에 넣고 자동 재요청을 끈다.
 */
export function useNotificationCheck() {
  const { session, isRestoring } = useAuth();
  const queryClient = useQueryClient();
  const [openedAt] = useState(Date.now);
  const viewer = session?.user.id ?? null;
  return useQuery({
    queryKey: notificationKeys.check(viewer, openedAt),
    queryFn: async () => {
      const previous = await markNotificationsChecked();
      queryClient.setQueryData(notificationKeys.unread(viewer), false);
      return previous;
    },
    enabled: !isRestoring && session !== null,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}
