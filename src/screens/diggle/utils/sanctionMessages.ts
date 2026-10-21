/** MSG-REPORT-006~009. 서버의 종료 시각을 기기 현지 날짜로 표시한다. */
export function formatRestrictionDate(restrictedUntil: string) {
  const date = new Date(restrictedUntil);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function restrictionToastMessage(restrictedUntil: string) {
  const date = formatRestrictionDate(restrictedUntil);
  return date ? `${date}까지 참여할 수 없습니다.` : "이용 제한 기간 동안 참여할 수 없습니다.";
}

export type SanctionNotice =
  | { type: "warning" }
  | { type: "community_restricted"; restrictedUntil: string; reasonLabel: string }
  | { type: "suspended"; reasonLabel: string };

export function sanctionNoticeMessage(notice: SanctionNotice) {
  if (notice.type === "warning")
    return {
      title: "커뮤니티 이용에 주의해 주세요.",
      description: "커뮤니티 이용정책 위반으로 경고가 적용되었습니다.",
    };
  if (notice.type === "suspended")
    return {
      title: "서비스 이용이 제한되었습니다.",
      description: "커뮤니티 이용정책 위반으로 이 계정의\n서비스 이용이 영구적으로 제한되었습니다.",
    };
  const date = formatRestrictionDate(notice.restrictedUntil);
  return {
    title: "커뮤니티 이용이 제한되었습니다.",
    description: `커뮤니티 이용정책 위반으로${date ? ` ${date}까지` : ""}\n커뮤니티를 읽기 전용으로 이용할 수 있습니다.`,
  };
}
