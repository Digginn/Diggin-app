import { supabase } from "@/lib/supabase";
import { normalizeText } from "@/utils/text";

import { databaseId, parseCommunityComment } from "./community";

export async function createComment(postId: string, body: string, requestId: string) {
  const { data, error } = await supabase.rpc("create_comment", {
    target_post_id: databaseId(postId),
    comment_content: normalizeText(body),
    request_id: requestId,
  });
  if (error) throw error;
  return parseCommunityComment(data);
}

export async function updateComment(id: string, body: string) {
  const { data, error } = await supabase.rpc("update_comment", {
    target_comment_id: databaseId(id),
    comment_content: normalizeText(body),
  });
  if (error) throw error;
  return parseCommunityComment(data);
}

export async function deleteComment(id: string) {
  const { error } = await supabase.rpc("delete_comment", { target_comment_id: databaseId(id) });
  if (error) throw error;
}

export async function setCommunityLike(id: string, isLiked: boolean) {
  const { data, error } = await supabase.rpc("set_community_like", {
    target_post_id: databaseId(id),
    is_liked: isLiked,
  });
  if (error) throw error;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.is_liked !== "boolean" ||
    typeof data.like_count !== "number" ||
    !Number.isSafeInteger(data.like_count) ||
    data.like_count < 0
  )
    throw new Error("invalid_community_response");
  return { isLiked: data.is_liked, likeCount: data.like_count };
}
