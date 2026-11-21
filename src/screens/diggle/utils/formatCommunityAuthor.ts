/** 활성 관리자 댓글은 Diggin으로 표시하고, 닉네임 없는 구버전 응답에는 일반 라벨을 쓴다. */
export function formatCommunityAuthor(
  nickname: string | null | undefined,
  isMine = false,
  isPostAuthor = false,
  isOperator = false,
) {
  const name = isOperator ? "Diggin" : nickname?.trim() || "사용자";
  const role = isMine ? "나" : isPostAuthor ? "글쓴이" : null;
  return role ? `${name} (${role})` : name;
}
