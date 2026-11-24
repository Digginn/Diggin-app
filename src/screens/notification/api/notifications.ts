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
  postType: "post" | "vote" | "notice";
  /** NOTI-011 댓글 좋아요 알림만 있다. 누르면 이 댓글로 스크롤한다. */
  commentId: string | null;
  isPostAvailable: boolean;
};

function parseNotification(value: unknown): AppNotification {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_notification_response");
  const row = value as Record<string, unknown>;
  const {
    id,
    title,
    body,
    created_at: createdAt,
    post_id: postId,
    post_type: postType,
    comment_id: commentId = null,
  } = row;
  if (
    typeof id !== "string" ||
    !/^(notice:)?[1-9][0-9]*$/.test(id) ||
    typeof title !== "string" ||
    typeof body !== "string" ||
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt)) ||
    typeof postId !== "string" ||
    (postType !== "post" && postType !== "vote" && postType !== "notice") ||
    (commentId !== null && (typeof commentId !== "string" || !/^[1-9][0-9]*$/.test(commentId)))
  )
    throw new Error("invalid_notification_response");
  return {
    id,
    title,
    body,
    createdAt,
    postId,
    postType,
    commentId,
    isPostAvailable: row.is_post_available === true,
  };
}

/** NOTI-007 최근 30일 알림을 최신순으로 20개씩 받는다. 커서 시각은 서버 문자열 그대로 돌려준다. */
export async function fetchNotifications(after: AppNotification | null) {
  const { data, error } = await supabase.rpc(
    "get_app_notifications",
    after ? { after_created_at: after.createdAt, after_key: after.id } : {},
  );
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("invalid_notification_response");
  return data.map(parseNotification);
}

export async function fetchHasUnreadNotifications() {
  const [activity, notices] = await Promise.all([
    supabase.rpc("has_unread_notifications"),
    supabase.rpc("has_unread_notices"),
  ]);
  if (activity.error) throw activity.error;
  if (notices.error) throw notices.error;
  return activity.data === true || notices.data === true;
}

/** 알림함 확인 시각을 지금으로 바꾸고 이전 시각을 받는다. 처음 열면 null이다. */
export async function markNotificationsChecked() {
  const { data, error } = await supabase.rpc("mark_notifications_checked");
  if (error) throw error;
  if (data !== null && (typeof data !== "string" || !Number.isFinite(Date.parse(data))))
    throw new Error("invalid_notification_response");
  return data;
}
