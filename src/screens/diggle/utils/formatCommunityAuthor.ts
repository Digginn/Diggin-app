/** 계정 닉네임을 표시한다. 구버전 서버·캐시에 닉네임이 없으면 내부 ID 대신 일반 라벨을 쓴다. */
export function formatCommunityAuthor(
  nickname: string | null | undefined,
  isMine = false,
  isPostAuthor = false,
) {
  const name = nickname?.trim() || "사용자";
  const role = isMine ? "나" : isPostAuthor ? "글쓴이" : null;
  return role ? `${name} (${role})` : name;
}
