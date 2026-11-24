import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";

import { restrictionMessage } from "@/api/accountAccess";
import { COMMENT_MAX_LENGTH } from "@/constants/comments";
import { useToast } from "@/hooks/useToast";
import { trackEvent } from "@/lib/analytics";
import { normalizeText, textLength } from "@/utils/text";

import { communityKeys } from "../api/community";
import { createComment, deleteComment, updateComment } from "../api/communityInteractions";
import { communityWriteError, isNoticeCommentsClosedError } from "../api/communityWrite";
import type { CommunityComment } from "../types/community";

function initialState(scope: string) {
  return {
    scope,
    draft: "",
    editBody: "",
    editing: null as CommunityComment | null,
    replyBody: "",
    replyTarget: null as CommunityComment | null,
    deleteTarget: null as CommunityComment | null,
    deleteError: "",
    deleteIsRestricted: false,
    isSending: false,
    isDeleting: false,
    changes: {} as Record<string, CommunityComment | null>,
  };
}

export function useCommentActions(postId: string, viewer: string | null) {
  const scope = `${viewer}:${postId}`;
  const [state, setState] = useState(() => initialState(scope));
  if (state.scope !== scope) setState(initialState(scope));
  const lifetime = useRef({ active: true });
  const busy = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const queryClient = useQueryClient();
  const showToast = useToast();
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    busy.current = false;
    request.current = null;
    return () => {
      current.active = false;
    };
  }, [scope]);
  const body = state.editing ? state.editBody : state.replyTarget ? state.replyBody : state.draft;

  async function send() {
    if (!viewer || busy.current || !body.trim() || textLength(body) > COMMENT_MAX_LENGTH)
      return null;
    const current = lifetime.current;
    const editing = state.editing;
    const parentId = state.replyTarget?.id;
    busy.current = true;
    setState((prev) => ({ ...prev, isSending: true }));
    const signature = JSON.stringify({ scope, body, parentId });
    if (request.current?.signature !== signature) request.current = { signature, id: randomUUID() };
    try {
      const row = editing
        ? await updateComment(editing.id, body)
        : await createComment(postId, body, request.current.id, parentId);
      if (!current.active) return null;
      if (!editing) trackEvent("comment_create", { post_id: postId });
      setState((prev) => ({
        ...prev,
        draft: editing || parentId ? prev.draft : "",
        editing: null,
        editBody: "",
        replyTarget: null,
        replyBody: "",
        changes: { ...prev.changes, [row.id]: row },
      }));
      request.current = null;
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
      return row;
    } catch (error) {
      if (current.active && isNoticeCommentsClosedError(error)) {
        setState((prev) => ({
          ...prev,
          editing: null,
          editBody: "",
          replyTarget: null,
          replyBody: "",
        }));
        void queryClient.invalidateQueries({ queryKey: communityKeys.post(viewer, postId) });
        void queryClient.invalidateQueries({ queryKey: communityKeys.comments(viewer, postId) });
      }
      if (current.active)
        showToast(
          restrictionMessage(error) ??
            communityWriteError(
              error,
              editing ? "댓글을 수정하지 못했습니다. 다시 시도해 주세요." : undefined,
            ),
          restrictionMessage(error) ? "notice" : "error",
        );
      // 원 댓글이 그사이 삭제·숨김되면 다시 보내도 실패하므로 답글 작성을 끝내고 목록을 새로 받는다.
      if (
        current.active &&
        parentId &&
        (error as { message?: unknown })?.message === "comment_not_found"
      ) {
        request.current = null;
        setState((prev) => ({ ...prev, replyTarget: null, replyBody: "" }));
        void queryClient.invalidateQueries({ queryKey: communityKeys.all });
      }
      return null;
    } finally {
      if (current.active) {
        busy.current = false;
        setState((prev) => ({ ...prev, isSending: false }));
      }
    }
  }

  async function remove() {
    if (!viewer || !state.deleteTarget || busy.current) return false;
    const current = lifetime.current;
    const id = state.deleteTarget.id;
    busy.current = true;
    setState((prev) => ({ ...prev, isDeleting: true, deleteError: "" }));
    try {
      await deleteComment(id);
      if (!current.active) return false;
      setState((prev) => ({
        ...prev,
        deleteTarget: null,
        editing: prev.editing?.id === id || prev.editing?.parentId === id ? null : prev.editing,
        replyTarget: prev.replyTarget?.id === id ? null : prev.replyTarget,
        changes: { ...prev.changes, [id]: null },
      }));
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
      return true;
    } catch (error) {
      if (current.active)
        setState((prev) => ({
          ...prev,
          deleteError: communityWriteError(error),
          deleteIsRestricted: !!restrictionMessage(error),
        }));
      return false;
    } finally {
      if (current.active) {
        busy.current = false;
        setState((prev) => ({ ...prev, isDeleting: false }));
      }
    }
  }

  return {
    ...state,
    body,
    send,
    remove,
    setBody: (value: string) =>
      setState((prev) => ({
        ...prev,
        [prev.editing ? "editBody" : prev.replyTarget ? "replyBody" : "draft"]: value,
      })),
    startEditing: (row: CommunityComment) => {
      if (!busy.current && row.isMine && !row.isWithdrawn)
        setState((prev) => ({
          ...prev,
          editing: row,
          editBody: normalizeText(row.body ?? ""),
          replyTarget: null,
          replyBody: "",
        }));
    },
    cancelEditing: () => {
      if (!busy.current) setState((prev) => ({ ...prev, editing: null, editBody: "" }));
    },
    // 답글은 1단계까지라 원 댓글에만 단다.
    startReplying: (row: CommunityComment) => {
      if (!busy.current && row.parentId === null && !row.isWithdrawn)
        setState((prev) => ({
          ...prev,
          replyTarget: row,
          replyBody: prev.replyTarget?.id === row.id ? prev.replyBody : "",
          editing: null,
          editBody: "",
        }));
    },
    cancelReplying: () => {
      if (!busy.current) setState((prev) => ({ ...prev, replyTarget: null, replyBody: "" }));
    },
    confirmDelete: (row: CommunityComment) => {
      if (!busy.current && row.isMine && !row.isWithdrawn)
        setState((prev) => ({ ...prev, deleteTarget: row, deleteError: "" }));
    },
    cancelDelete: () => {
      if (!busy.current) setState((prev) => ({ ...prev, deleteTarget: null, deleteError: "" }));
    },
  };
}
