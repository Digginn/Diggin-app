import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { restrictionMessage } from "@/api/accountAccess";
import { DIGGLE_TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { trackEvent } from "@/lib/analytics";
import type { VoteChoice } from "@/types/post";

import { communityKeys } from "../api/community";
import { setCommunityVote } from "../api/communityVote";
import { communityWriteError } from "../api/communityWrite";
import type { CommunityPost } from "../types/community";

export function useCommunityVote(
  post: CommunityPost | null | undefined,
  viewer: string | null,
  isClosed: boolean,
) {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const scope = `${viewer}:${post?.id}`;
  const busy = useRef(false);
  const lifetime = useRef({ active: true });
  const [pending, setPending] = useState({ scope, isPending: false });
  if (pending.scope !== scope) setPending({ scope, isPending: false });
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    busy.current = false;
    return () => {
      current.active = false;
    };
  }, [scope]);
  useEffect(() => {
    if (viewer && post?.type === "vote" && isClosed)
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
  }, [viewer, post?.id, post?.type, isClosed, queryClient]);
  useEffect(() => {
    if (!viewer || post?.type !== "vote") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    });
    return () => subscription.remove();
  }, [viewer, post?.id, post?.type, queryClient]);

  async function choose(value: VoteChoice) {
    if (!viewer || !post || post.type !== "vote" || busy.current || isClosed) return;
    if (post.isMine) {
      showToast(DIGGLE_TOAST_MESSAGES.VOTE_002, "error");
      return;
    }
    const choice = value === "BUY" ? "buy" : "not";
    if (post.myChoice === choice) return;
    const current = lifetime.current;
    busy.current = true;
    setPending({ scope, isPending: true });
    try {
      const saved = await setCommunityVote(post.id, choice);
      trackEvent("vote_participate", { post_id: post.id, vote_option: choice });
      if (!current.active) return;
      queryClient.setQueryData<CommunityPost | null>(
        communityKeys.post(viewer, post.id),
        (previous) =>
          previous
            ? {
                ...previous,
                myChoice: saved.myChoice,
                buyCount: saved.buyCount,
                notCount: saved.notCount,
                serverNow: saved.serverNow,
              }
            : previous,
      );
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    } catch (error) {
      if (!current.active) return;
      const message = error && typeof error === "object" && "message" in error ? error.message : "";
      showToast(
        message === "own_vote"
          ? DIGGLE_TOAST_MESSAGES.VOTE_002
          : message === "vote_closed"
            ? "투표가 종료되었습니다."
            : communityWriteError(error),
        restrictionMessage(error) ? "notice" : "error",
      );
      if (message === "vote_closed")
        void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    } finally {
      if (current.active) {
        busy.current = false;
        setPending({ scope, isPending: false });
      }
    }
  }
  return { choose, isPending: pending.scope === scope && pending.isPending };
}
