import { adminRequest } from "../lib/supabase";

export type NoticeDraft = {
  title: string;
  body: string;
  inbox_body: string;
  inbox_only: boolean;
  comments_closed: boolean;
};
export type Notice = NoticeDraft & {
  id: string;
  created_at: string;
  revision: number;
  is_visible: boolean;
};
export const EMPTY_NOTICE: NoticeDraft = {
  title: "",
  body: "",
  inbox_body: "",
  inbox_only: false,
  comments_closed: false,
};
export function isNoticeDraft(value: unknown): value is NoticeDraft {
  if (!value || typeof value !== "object") return false;
  return (
    "title" in value &&
    typeof value.title === "string" &&
    "body" in value &&
    typeof value.body === "string" &&
    "inbox_body" in value &&
    typeof value.inbox_body === "string" &&
    "inbox_only" in value &&
    typeof value.inbox_only === "boolean" &&
    "comments_closed" in value &&
    typeof value.comments_closed === "boolean"
  );
}
const GRAPHEMES = new Intl.Segmenter("ko", { granularity: "grapheme" });
export function noticeValidation(draft: NoticeDraft) {
  const length = (value: string) =>
    Array.from(GRAPHEMES.segment(value.normalize("NFC").trim())).length;
  if (!length(draft.title) || !length(draft.body)) return "제목과 게시글 본문을 입력해 주세요.";
  if (length(draft.title) > 100 || /[\r\n]/.test(draft.title))
    return "제목은 줄바꿈 없이 100자까지 입력해 주세요.";
  if (length(draft.body) > 10000) return "게시글 본문은 10,000자까지 입력해 주세요.";
  if (length(draft.inbox_body) > 200) return "알림함 본문은 200자까지 입력해 주세요.";
  return "";
}
export function noticeRequest<T>(
  operation: string,
  payload: Record<string, unknown>,
  id?: string,
  requestId?: string,
) {
  return adminRequest<T>({
    action: "notice",
    operation,
    payload,
    notice_id: id,
    request_id: requestId,
  });
}
