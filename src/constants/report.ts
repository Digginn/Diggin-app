// RPT-002 댓글 신고는 '게시글'을 '댓글'로 바꿔 보여준다(BUG-111).
export const REPORT_REASONS = [
  { value: "abuse", label: "욕설, 비방, 인신 공격", commentLabel: "욕설, 비방, 인신 공격" },
  { value: "spam", label: "게시글 도배", commentLabel: "댓글 도배" },
  {
    value: "inappropriate",
    label: "부적절한 게시글 (선정적 / 홍보 / 유언비어 / 초상권 위배 등)",
    commentLabel: "부적절한 댓글 (선정적 / 홍보 / 유언비어 / 초상권 위배 등)",
  },
  { value: "other", label: "직접 작성", commentLabel: "직접 작성" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportTarget = { type: "post" | "comment"; id: string };

export const REPORT_MESSAGES = {
  directBlockTitle: "이 사용자를 차단하시겠습니까?",
  directBlockDescription: "차단하면 이 사용자의 게시글과 댓글이 나에게 보이지 않습니다.",
  title: "신고가 접수되었습니다.",
  // RPT-03 MSG-REPORT-001. 줄바꿈 없이 이어 써서 최대 2줄로 보인다(BUG-071).
  blockDescription:
    "이 사용자를 차단하면 나에게 해당 사용자의 게시글·투표글·댓글·답글이 보이지 않습니다.",
  blockFailed: "사용자를 차단하지 못했습니다. 다시 시도해 주세요.",
} as const;
