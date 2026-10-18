import { useEffect, useState } from "react";
import { AppState } from "react-native";

import type { CommunityPost } from "../types/community";
import { getVoteTiming } from "../utils/voteTiming";

export function useCommunityVoteTiming(
  post: CommunityPost | null | undefined,
  dataUpdatedAt: number,
) {
  const [now, setNow] = useState(Date.now);
  const isVote = post?.type === "vote";

  useEffect(() => {
    if (!isVote) return;
    const refresh = () => setNow((previous) => Math.max(previous, Date.now()));
    refresh();
    const interval = setInterval(refresh, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isVote, post?.id, dataUpdatedAt]);

  if (!isVote || !post) return null;
  // 캐시에서 다시 연 경우에도 응답 수신 이후의 경과 시간을 포함한다.
  const elapsed = Math.max(0, now - dataUpdatedAt);
  const serverNow = post.serverNow ? Date.parse(post.serverNow) + elapsed : now;
  return getVoteTiming(Date.parse(post.createdAt), serverNow);
}
