import { TOAST_MESSAGES } from "@/constants/messages";

export function itemSaveErrorMessage(error: unknown) {
  // PostgREST는 fetch 실패를 Error 대신 message가 있는 일반 객체로 반환하기도 한다.
  const message =
    typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  return /network request failed|failed to fetch|networkerror|network_offline/i.test(message)
    ? TOAST_MESSAGES.SYS_001
    : TOAST_MESSAGES.SAVE_012;
}
