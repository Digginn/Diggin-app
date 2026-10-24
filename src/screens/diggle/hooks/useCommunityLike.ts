import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { restrictionMessage } from "@/api/accountAccess";
import { useToast } from "@/hooks/useToast";

import { communityKeys } from "../api/community";
import { setCommunityLike } from "../api/communityInteractions";
import type { CommunityPost } from "../types/community";

export function useCommunityLike(post: CommunityPost | null | undefined, viewer: string | null) {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const busy = useRef(false);
  const lifetime = useRef({ active: true });
  const scope = `${viewer}:${post?.id}`;
  const [optimistic, setOptimistic] = useState<{
    scope: string;
    isLiked: boolean;
    likeCount: number;
  } | null>(null);
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    busy.current = false;
    return () => {
      current.active = false;
    };
  }, [scope]);
  const state =
    optimistic?.scope === scope
      ? optimistic
      : { isLiked: post?.isLiked ?? false, likeCount: post?.likeCount ?? 0 };

  async function toggle() {
    if (!post || !viewer || busy.current) return;
    const current = lifetime.current;
    const isLiked = !state.isLiked;
    busy.current = true;
    setOptimistic({ scope, isLiked, likeCount: Math.max(0, state.likeCount + (isLiked ? 1 : -1)) });
    try {
      const saved = await setCommunityLike(post.id, isLiked);
      if (!current.active) return;
      queryClient.setQueryData<CommunityPost | null>(
        communityKeys.post(viewer, post.id),
        (previous) => (previous ? { ...previous, ...saved } : previous),
      );
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    } catch (error) {
      if (current.active)
        showToast(
          restrictionMessage(error) ?? "좋아요를 처리하지 못했습니다. 다시 시도해 주세요.",
          restrictionMessage(error) ? "notice" : "error",
        );
    } finally {
      if (current.active) {
        busy.current = false;
        setOptimistic(null);
      }
    }
  }
  return { ...state, isPending: optimistic?.scope === scope, toggle };
}
