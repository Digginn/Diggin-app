import { supabase } from "@/lib/supabase";
import { databaseId, parsePost } from "@/screens/diggle/api/community";
import type { CommunityCursor, CommunityPost } from "@/screens/diggle/types/community";

export type ActivityKind = "post" | "vote" | "liked";
export type CommunityActivityItem = { post: CommunityPost; cursor: CommunityCursor };

export async function fetchCommunityActivity(
  kind: ActivityKind,
  after: CommunityCursor | null,
): Promise<CommunityActivityItem[]> {
  const { data, error } = await supabase.rpc("get_my_community_activity", {
    activity_type: kind,
    ...(after ? { after_activity_at: after.createdAt, after_id: databaseId(after.id) } : {}),
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("invalid_activity_response");
  return data.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("invalid_activity_response");
    const { activity_at: createdAt, activity_id: id } = value;
    if (
      typeof createdAt !== "string" ||
      !Number.isFinite(Date.parse(createdAt)) ||
      typeof id !== "string"
    )
      throw new Error("invalid_activity_response");
    databaseId(id);
    const post = parsePost(value.post);
    if (post.isPreview || (kind === "liked" ? !post.isLiked : !post.isMine || post.type !== kind))
      throw new Error("invalid_activity_response");
    return { post, cursor: { createdAt, id } };
  });
}
