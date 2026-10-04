export const VOTE_DURATION_MS = 24 * 60 * 60 * 1000;

export function getVoteTiming(createdAt: number, now = Date.now()) {
  const remainingMs = createdAt + VOTE_DURATION_MS - now;
  const isClosed = remainingMs <= 0;
  const minutes = Math.max(0, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const remainingLabel = isClosed
    ? "투표가 종료되었습니다."
    : `${hours ? `${hours}시간` : ""}${hours && remainder ? " " : ""}${remainder ? `${remainder}분` : ""} 남음`;

  return { isClosed, remainingLabel };
}
