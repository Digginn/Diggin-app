import { supabase } from "@/lib/supabase";

import { databaseId, parsePost } from "./community";

export async function setCommunityVote(postId: string, choice: "buy" | "not") {
  const { data, error } = await supabase.rpc("set_community_vote", {
    target_post_id: databaseId(postId),
    vote_option: choice,
  });
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
