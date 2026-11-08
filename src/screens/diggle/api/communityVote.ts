import { ensureCommunityWriteAllowed } from "@/api/accountAccess";
import { supabase } from "@/lib/supabase";

import { databaseId, parsePost } from "./community";

export async function setCommunityVote(postId: string, choice: "buy" | "not") {
  const accessToken = await ensureCommunityWriteAllowed();
  const request = supabase.rpc("set_community_vote", {
    target_post_id: databaseId(postId),
    vote_option: choice,
  });
  if (accessToken) request.setHeader("Authorization", `Bearer ${accessToken}`);
  const { data, error } = await request;
  if (error) throw error;
  const post = parsePost(data);
  if (
    post.id !== postId ||
    post.type !== "vote" ||
    post.myChoice !== choice ||
    post.buyCount === null ||
    post.notCount === null
  )
    throw new Error("invalid_community_response");
  return post;
}
