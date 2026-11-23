import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { restrictionMessage } from "@/api/accountAccess";
import { useToast } from "@/hooks/useToast";

import { communityKeys } from "../api/community";
import { setCommentLike } from "../api/communityInteractions";
import { communityWriteError } from "../api/communityWrite";
import type { CommunityComment } from "../types/community";

type LikeState = { isLiked: boolean; likeCount: number };

/** LIKE-004 댓글·답글 좋아요. 누른 즉시 반영하고, 다시 받은 목록이 오면 서버 값으로 돌아간다. */
export function useCommentLikes(postId: string, viewer: string | null) {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const scope = `${viewer}:${postId}`;
  const [overrides, setOverrides] = useState({ scope, rows: {} as Record<string, LikeState> });
  if (overrides.scope !== scope) setOverrides({ scope, rows: {} });
  const busy = useRef(new Set<string>());
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    busy.current = new Set();
    return () => {
      current.active = false;
    };
  }, [scope]);

  const likeOf = (row: CommunityComment): LikeState =>
    overrides.rows[row.id] ?? { isLiked: row.isLiked, likeCount: row.likeCount };
  const setRow = (id: string, value: LikeState | null) =>
    setOverrides((prev) => {
      const rows = { ...prev.rows };
      if (value) rows[id] = value;
      else delete rows[id];
      return { ...prev, rows };
    });

  async function toggle(row: CommunityComment) {
    if (!viewer || row.isMine || row.isWithdrawn || busy.current.has(row.id)) return;
    const current = lifetime.current;
    const before = likeOf(row);
    const isLiked = !before.isLiked;
    busy.current.add(row.id);
    setRow(row.id, { isLiked, likeCount: Math.max(0, before.likeCount + (isLiked ? 1 : -1)) });
    try {
      const saved = await setCommentLike(row.id, isLiked);
      if (!current.active) return;
      setRow(row.id, saved);
      await queryClient.invalidateQueries({ queryKey: communityKeys.comments(viewer, postId) });
    } catch (error) {
      if (!current.active) return;
      showToast(
        restrictionMessage(error) ??
          communityWriteError(error, "좋아요를 반영하지 못했습니다. 다시 시도해 주세요."),
        restrictionMessage(error) ? "notice" : "error",
      );
      // 댓글이 지워졌거나 공지 댓글이 닫혔으면 다시 받아 화면을 맞춘다.
      void queryClient.invalidateQueries({ queryKey: communityKeys.post(viewer, postId) });
      void queryClient.invalidateQueries({ queryKey: communityKeys.comments(viewer, postId) });
    } finally {
      if (current.active) {
        busy.current.delete(row.id);
        setRow(row.id, null);
      }
    }
  }

  return { likeOf, toggle };
}
