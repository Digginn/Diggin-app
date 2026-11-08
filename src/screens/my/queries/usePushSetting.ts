import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";

import {
  fetchPushEnabled,
  notificationSettingKeys,
  savePushEnabled,
} from "../api/notificationSettings";
import type { NotificationSettings } from "../NotificationSettingsScreen";

/** 알림 설정 화면은 토글 하나(isAllEnabled)만 쓰고, 그 값을 Push 수신 여부로 저장한다. */
export function usePushSetting() {
  const { session, isRestoring } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = notificationSettingKeys.push(session?.user.id ?? null);
  const query = useQuery({
    queryKey,
    queryFn: fetchPushEnabled,
    enabled: !isRestoring && session !== null,
  });
  const isEnabled = query.data ?? true;
  const settings: NotificationSettings = {
    isAllEnabled: isEnabled,
    isVoteEndEnabled: isEnabled,
    isCommentEnabled: isEnabled,
    isLikeEnabled: isEnabled,
  };
  return {
    isLoaded: query.isSuccess,
    settings,
    save: async (next: NotificationSettings) => {
      await savePushEnabled(next.isAllEnabled);
      queryClient.setQueryData(queryKey, next.isAllEnabled);
    },
  };
}
