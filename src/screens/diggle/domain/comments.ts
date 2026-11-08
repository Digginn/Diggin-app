import type { CommunityComment } from "../types/community";

/** 로컬에서 성공한 변경을 합치되 서버의 다음 페이지 커서는 변경하지 않는다. */
export function mergeComments(
  rows: CommunityComment[],
  changes: Record<string, CommunityComment | null>,
) {
  const merged = new Map(rows.map((row) => [row.id, row]));
  for (const [id, row] of Object.entries(changes)) {
    if (row) merged.set(id, row);
    else merged.delete(id);
  }
  return [...merged.values()].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
  });
}
