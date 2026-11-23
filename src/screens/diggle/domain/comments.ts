import type { CommunityComment } from "../types/community";

function byCreatedAt(a: CommunityComment, b: CommunityComment) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
}

/**
 * 로컬에서 성공한 변경을 합치되 서버의 다음 페이지 커서는 변경하지 않는다.
 * 답글은 원 댓글 바로 아래에 펼치고, 원 댓글이 목록에 없으면 답글도 뺀다.
 */
export function mergeComments(
  rows: CommunityComment[],
  changes: Record<string, CommunityComment | null>,
) {
  const merged = new Map(rows.flatMap((row) => [row, ...row.replies]).map((row) => [row.id, row]));
  for (const [id, row] of Object.entries(changes)) {
    if (row) {
      const fetched = merged.get(id);
      // 작성·수정 직후의 본문은 유지하되 재조회한 관리자·투표 라벨을 반영한다.
      merged.set(
        id,
        fetched?.isWithdrawn
          ? fetched
          : fetched
            ? { ...row, isOperator: fetched.isOperator, voteChoice: fetched.voteChoice }
            : row,
      );
    } else merged.delete(id);
  }
  const sorted = [...merged.values()].sort(byCreatedAt);
  const replies = new Map<string, CommunityComment[]>();
  for (const row of sorted)
    if (row.parentId) replies.set(row.parentId, [...(replies.get(row.parentId) ?? []), row]);
  return sorted
    .filter((row) => row.parentId === null)
    .flatMap((row) => [row, ...(replies.get(row.id) ?? [])]);
}
