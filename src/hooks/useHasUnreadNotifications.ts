import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  fetchHasUnreadNotifications,
  notificationKeys,
} from "@/screens/notification/api/notifications";

/** 종 아이콘 빨간 점. 화면에 돌아올 때마다 다시 확인한다. */
export function useHasUnreadNotifications() {
  const { session, isRestoring } = useAuth();
  const hasSession = !isRestoring && session !== null;
  const { data, refetch } = useQuery({
    queryKey: notificationKeys.unread(session?.user.id ?? null),
    queryFn: fetchHasUnreadNotifications,
    enabled: hasSession,
  });
  useFocusEffect(
    useCallback(() => {
      if (hasSession) void refetch();
    }, [hasSession, refetch]),
  );
  return hasSession && data === true;
}
