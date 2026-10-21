import { useInfiniteQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";

import {
  type AppNotification,
  fetchNotifications,
  NOTIFICATION_PAGE_SIZE,
  notificationKeys,
} from "../api/notifications";

export function useNotifications() {
  const { session, isRestoring } = useAuth();
  return useInfiniteQuery({
    queryKey: notificationKeys.list(session?.user.id ?? null),
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: null as AppNotification | null,
    getNextPageParam: (page) => (page.length === NOTIFICATION_PAGE_SIZE ? page.at(-1) : undefined),
    enabled: !isRestoring && session !== null,
  });
}
