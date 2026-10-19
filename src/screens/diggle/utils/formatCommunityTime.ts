/** SYS-009. 기기 locale에 관계없이 같은 시간 구간을 사용한다. */
export function formatCommunityTime(createdAt: string, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(createdAt));
  if (elapsed < 60_000) return "방금 전";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  if (elapsed < 172_800_000) return "어제";
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}일 전`;
  const date = new Date(createdAt);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function communityErrorMessage(error: unknown, target: "게시글" | "댓글" = "게시글") {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
  return /network request failed|failed to fetch|networkerror|network_offline/i.test(message)
    ? "연결 상태를 확인한 후 다시 시도해 주세요."
    : `${target}을 불러오지 못했습니다. 다시 시도해 주세요.`;
}
