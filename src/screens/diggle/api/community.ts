import { supabase } from "@/lib/supabase";

import type {
  CommunityComment,
  CommunityCursor,
  CommunityItem,
  CommunityPost,
} from "../types/community";

export const COMMUNITY_PAGE_SIZE = 20;
export const communityKeys = {
  all: ["community"] as const,
  feed: (viewer: string | null, tab: string) =>
    [...communityKeys.all, viewer, "feed", tab] as const,
  post: (viewer: string | null, id: string) => [...communityKeys.all, viewer, "post", id] as const,
  comments: (viewer: string | null, id: string) =>
    [...communityKeys.all, viewer, "comments", id] as const,
};

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_community_response");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_community_response");
  return value;
}

function optionalText(value: unknown) {
  return value == null ? null : text(value);
}

function count(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("invalid_community_response");
  return value;
}

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid_community_response");
  return value;
}

function cursor(row: Record<string, unknown>): CommunityCursor {
  const id = text(row.id);
  const createdAt = text(row.created_at);
  if (!/^\d+$/.test(id) || !Number.isFinite(Date.parse(createdAt)))
    throw new Error("invalid_community_response");
  return { id, createdAt };
}

function parseItem(value: unknown): CommunityItem {
  const row = record(value);
  const position = count(row.position);
  if (!position || position > 4) throw new Error("invalid_community_response");
  return {
    id: String(position),
    imageUrl: optionalText(row.image_url),
    name: optionalText(row.name),
    brand: optionalText(row.brand),
    price: count(row.price),
    url: optionalText(row.url),
  };
}

export function parsePost(value: unknown): CommunityPost {
  const row = record(value);
  if (row.type !== "post" && row.type !== "vote") throw new Error("invalid_community_response");
  if (row.my_choice != null && row.my_choice !== "buy" && row.my_choice !== "not")
    throw new Error("invalid_community_response");
  return {
    ...cursor(row),
    type: row.type,
    body: text(row.content),
    isPreview: row.is_mine === undefined,
    isMine: row.is_mine === true,
    items: rows(row.items).map(parseItem),
    likeCount: count(row.like_count),
    commentCount: count(row.comment_count),
    isLiked: row.is_liked === true,
    endsAt: optionalText(row.ends_at),
    serverNow: optionalText(row.server_now),
    myChoice: row.my_choice ?? null,
    buyCount: count(row.buy_count),
    notCount: count(row.not_count),
  };
}

export function databaseId(id: string) {
  const value = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("invalid_post_id");
  return value;
}

function cursorArgs(after: CommunityCursor | null) {
  return after ? { after_created_at: after.createdAt, after_id: databaseId(after.id) } : {};
}

export async function fetchCommunityFeed(tab: "all" | "vote", after: CommunityCursor | null) {
  const { data, error } = await supabase.rpc("get_community_feed", {
    feed_type: tab,
    ...cursorArgs(after),
  });
  if (error) throw error;
  return rows(data).map(parsePost);
}

export async function fetchCommunityPost(id: string): Promise<CommunityPost | null> {
  const { data, error } = await supabase.rpc("get_community_post", {
    target_post_id: databaseId(id),
  });
  if (error) throw error;
  return data === null ? null : parsePost(data);
}

export async function fetchCommunityComments(
  id: string,
  after: CommunityCursor | null,
): Promise<CommunityComment[]> {
  const { data, error } = await supabase.rpc("get_community_comments", {
    target_post_id: databaseId(id),
    ...cursorArgs(after),
  });
  if (error) throw error;
  return rows(data).map(parseCommunityComment);
}

export function parseCommunityComment(value: unknown): CommunityComment {
  const row = record(value);
  return {
    ...cursor(row),
    body: optionalText(row.content),
    isPostAuthor: row.is_post_author === true,
    isMine: row.is_mine === true,
    isWithdrawn: row.is_withdrawn === true,
    anonNumber: count(row.anon_number),
  };
}
