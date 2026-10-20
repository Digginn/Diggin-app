import { supabase } from "@/lib/supabase";

export const NOTIFICATION_PAGE_SIZE = 20;
export const notificationKeys = {
  all: ["notifications"] as const,
  list: (viewer: string | null) => [...notificationKeys.all, viewer] as const,
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  postId: string;
  postType: "post" | "vote";
  isPostAvailable: boolean;
};

function parseNotification(value: unknown): AppNotification {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_notification_response");
  const row = value as Record<string, unknown>;
  const { id, title, body, created_at: createdAt, post_id: postId, post_type: postType } = row;
  if (
    typeof id !== "string" ||
    !/^\d+$/.test(id) ||
    typeof title !== "string" ||
    typeof body !== "string" ||
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt)) ||
    typeof postId !== "string" ||
    (postType !== "post" && postType !== "vote")
  )
    throw new Error("invalid_notification_response");
  return {
    id,
    title,
    body,
    createdAt,
    postId,
    postType,
    isPostAvailable: row.is_post_available === true,
  };
}

/** NOTI-007 최근 30일 알림을 최신순으로 20개씩 받는다. 커서 시각은 서버 문자열 그대로 돌려준다. */
export async function fetchNotifications(after: AppNotification | null) {
  const { data, error } = await supabase.rpc(
    "get_notifications",
    after ? { after_created_at: after.createdAt, after_id: Number(after.id) } : {},
  );
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("invalid_notification_response");
  return data.map(parseNotification);
}
