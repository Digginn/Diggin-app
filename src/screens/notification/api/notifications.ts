import { supabase } from "@/lib/supabase";

export const NOTIFICATION_PAGE_SIZE = 20;
export const notificationKeys = {
  all: ["notifications"] as const,
  list: (viewer: string | null) => [...notificationKeys.all, viewer] as const,
  unread: (viewer: string | null) => [...notificationKeys.all, "unread", viewer] as const,
  check: (viewer: string | null, openedAt: number) =>
    [...notificationKeys.all, "check", viewer, openedAt] as const,
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

export async function fetchHasUnreadNotifications() {
  const { data, error } = await supabase.rpc("has_unread_notifications");
  if (error) throw error;
  return data === true;
}

/** 알림함 확인 시각을 지금으로 바꾸고 이전 시각을 받는다. 처음 열면 null이다. */
export async function markNotificationsChecked() {
  const { data, error } = await supabase.rpc("mark_notifications_checked");
  if (error) throw error;
  if (data !== null && (typeof data !== "string" || !Number.isFinite(Date.parse(data))))
    throw new Error("invalid_notification_response");
  return data;
}
