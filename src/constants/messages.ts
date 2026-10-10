import type { PostTab } from "@/types/post";

// 키는 시안 MSG 프레임 이름을 그대로 씀
export const TOAST_MESSAGES = {
  SAVE_003: "공유한 내용에서 상품 URL을 찾지 못했습니다.",
  SAVE_004: "아이템 링크를 확인하고 다시 시도해 주세요.",
  SAVE_005: "다른 아이템 링크를 입력해 주세요.",
  SAVE_011: "상품을 저장했습니다.",
  SAVE_012: "상품을 저장하지 못했습니다. 다시 시도해 주세요.",
  SAVE_013: "네트워크 연결을 확인하고 다시 시도해 주세요.",
  ALL_004: "상품 정보를 수정했습니다.",
  ALL_005: "상품 정보를 수정하지 못했습니다. 다시 시도해 주세요.",
  ALL_007: "상품이 삭제되었습니다.",
  ALL_008: "상품을 삭제하지 못했습니다. 다시 시도해 주세요.",
  ALL_009: "상품 페이지를 열지 못했습니다. 다시 시도해 주세요.",
  SYS_001: "연결 상태를 확인한 후 다시 시도해 주세요.",
  SYS_002: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  // 번호가 아직 없어 내용으로 이름 붙임
  SHARE_UNSUPPORTED: "이 앱에서는 공유할 수 없습니다.",
  FILE_INVALID:
    "파일 형식이 올바르지 않아 아이템 정보를 불러오지 못했습니다. 파일을 확인한 뒤 다시 시도해 주세요.",
} as const;

export const DIGGLE_TOAST_MESSAGES = {
  VOTE_009: "투표를 등록했습니다. 24시간 뒤 결과를 알려드립니다.",
  VOTE_002: "내가 만든 투표에는 참여할 수 없습니다.",
  DIGGLE_009: "게시글이 삭제되었습니다.",
  COMMENT_004: "댓글을 수정하지 못했습니다. 다시 시도해 주세요.",
  REPORT_004: "사용자를 차단했습니다.",
} as const;

export type ToastMessageKey = keyof typeof TOAST_MESSAGES;

// 문구 확정 전이라 바뀔 수 있음
export const selectDeletedMessage = (count: number) => `${count}개 아이템을 삭제했습니다.`;

export const STATE_MESSAGES = {
  allEmpty: "아직 저장된 아이템이 없습니다.\n관심 아이템의 링크를 복사해 보세요.",
  searchEmpty: "검색 결과가 없습니다.\n다른 검색어로 다시 찾아보세요.",
  loadFailed: "상품을 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요.",
} as const;

export const DIGGLE_EMPTY_MESSAGES: Record<PostTab, string> = {
  all: "아직 게시글이 없습니다.\n첫 게시글을 올려 의견을 나눠 보세요.",
  vote: "아직 게시된 투표가 없습니다.\n첫 투표를 올려 의견을 받아 보세요.",
};
