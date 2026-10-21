import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";

import { restrictionMessage } from "@/api/accountAccess";
import { useToast } from "@/hooks/useToast";
import { normalizeText, textLength } from "@/utils/text";

import { communityKeys } from "../api/community";
import { createComment, deleteComment, updateComment } from "../api/communityInteractions";
import { communityWriteError } from "../api/communityWrite";
import type { CommunityComment } from "../types/community";

function initialState(scope: string) {
  return {
    scope,
    draft: "",
    editBody: "",
    editing: null as CommunityComment | null,
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
  const body = state.editing ? state.editBody : state.draft;

  async function send() {
    if (!viewer || busy.current || !body.trim() || textLength(body) > 30) return null;
    const current = lifetime.current;
    const editing = state.editing;
    busy.current = true;
    setState((prev) => ({ ...prev, isSending: true }));
    const signature = JSON.stringify({ scope, body });
    if (request.current?.signature !== signature) request.current = { signature, id: randomUUID() };
    try {
      const row = editing
        ? await updateComment(editing.id, body)
        : await createComment(postId, body, request.current.id);
      if (!current.active) return null;
      setState((prev) => ({
        ...prev,
        draft: editing ? prev.draft : "",
        editing: null,
        editBody: "",
        changes: { ...prev.changes, [row.id]: row },
      }));
      request.current = null;
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
      return row;
    } catch (error) {
      if (current.active)
        showToast(
          restrictionMessage(error) ??
            (editing
              ? "댓글을 수정하지 못했습니다. 다시 시도해 주세요."
              : communityWriteError(error)),
          restrictionMessage(error) ? "notice" : "error",
        );
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
        editing: prev.editing?.id === id ? null : prev.editing,
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
      setState((prev) => ({ ...prev, [prev.editing ? "editBody" : "draft"]: value })),
    startEditing: (row: CommunityComment) => {
      if (!busy.current && row.isMine && !row.isWithdrawn)
        setState((prev) => ({ ...prev, editing: row, editBody: normalizeText(row.body ?? "") }));
    },
    cancelEditing: () => {
      if (!busy.current) setState((prev) => ({ ...prev, editing: null, editBody: "" }));
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
