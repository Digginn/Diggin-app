import type { ComponentProps } from "react";

import type { HistoryItem } from "../components/HistoryItem";

import { PREVIEW_REPORTS } from "./reports";

export const POST_REASON =
  "동일 게시글에 욕설·비방 신고가 반복 접수되어 커뮤니티 운영정책 3조에 따라 7일 이용 제한합니다.";
export const COMMENT_REASON =
  "다른 사용자의 취향을 비하하는 표현으로 경고합니다. 반복 시 이용이 제한됩니다.";
export type DetailKey = "post-30" | "comment-112";
export type DetailStep = "detail" | "input" | "confirm" | "complete";
export type DetailHistory = ComponentProps<typeof HistoryItem>;
const postHistory: DetailHistory[] = [
  {
    action: "제재 해제",
    time: "10.26 20:07",
    meta: "운영자 diggin.app · 커뮤니티 이용 제한 해제",
    reason: "테스트 계정 확인 후 해제합니다.",
    kind: "release",
  },
  {
    action: "커뮤니티 이용 제한 7일",
    time: "10.26 20:02",
    meta: "운영자 diggin.app · 기타 · 11.02 20:02 종료 예정",
    reason: "반복 신고 접수로 이용을 제한합니다.",
  },
  {
    action: "제재 해제",
    time: "10.26 20:02",
    meta: "운영자 diggin.app · 커뮤니티 이용 제한 해제",
    reason: "검토 결과 해제합니다.",
    kind: "release",
  },
  {
    action: "커뮤니티 이용 제한 7일",
    time: "10.26 19:42",
    meta: "운영자 diggin.app · 부적절한 콘텐츠 · 11.02 19:42 종료 예정",
    reason: "부적절한 표현이 반복되어 이용을 제한합니다.",
  },
  {
    action: "경고",
    time: "10.26 19:37",
    meta: "운영자 diggin.app · 기타",
    reason: "커뮤니티 가이드 위반으로 경고합니다.",
    kind: "status",
  },
];
export const DETAIL_EXAMPLES = {
  "post-30": {
    report: PREVIEW_REPORTS[0],
    uuid: "67754824-5d6f-4e0a-a4c6-1bd6cde0834a",
    sanctions: 3,
    reason: POST_REASON,
    created: "작성 2026.10.26 18:52 · 댓글 2 · 좋아요 0",
    history: postHistory,
    reports: [
      { id: 26, label: "부적절한 콘텐츠", time: "10.26 19:49", reporter: "a91c…77e02" },
      { id: 25, label: "욕설·비방", time: "10.26 19:16", reporter: "5be2…0f3d1" },
      {
        id: 24,
        label: "기타",
        time: "10.26 19:05",
        reporter: "1d4d…8cd0a",
        reason: "같은 내용을 여러 번 올리고 신고를 유도하고 있어요.",
      },
    ],
  },
  "comment-112": {
    report: PREVIEW_REPORTS[1],
    uuid: "2b1f9c03-4e17-4b8a-9d2e-5c0a7f3091ac",
    sanctions: 0,
    reason: COMMENT_REASON,
    created: "작성 2026.10.26 23:31 · 좋아요 1",
    history: [
      {
        action: "검토 시작",
        time: "10.27 09:30",
        meta: "운영자 diggin.app · 접수 → 검토 중",
        kind: "review",
      },
    ] as DetailHistory[],
    reports: [
      { id: 48, label: "욕설·비방", time: "10.27 09:12", reporter: "c7e1…2a90b" },
      { id: 45, label: "욕설·비방", time: "10.27 01:05", reporter: "0a3f…e81c4" },
      {
        id: 44,
        label: "기타",
        time: "10.27 00:12",
        reporter: "9d22…71f0e",
        reason: "다른 사람 취향을 비하하는 댓글이에요.",
      },
      { id: 41, label: "욕설·비방", time: "10.26 23:40", reporter: "5be2…0f3d1" },
    ],
  },
};
export const DETAIL_DESIGN_STATES: {
  path: string;
  title: string;
  node: string;
  content: DetailKey;
  step: DetailStep;
}[] = [
  {
    path: "report-post-30",
    title: "게시글 #30 · 상세",
    node: "7068:141910",
    content: "post-30",
    step: "detail",
  },
  {
    path: "report-post-30-input",
    title: "게시글 #30 · 조치 입력",
    node: "7068:142030",
    content: "post-30",
    step: "input",
  },
  {
    path: "report-post-30-confirm",
    title: "게시글 #30 · 확인 모달",
    node: "7068:144329",
    content: "post-30",
    step: "confirm",
  },
  {
    path: "report-post-30-complete",
    title: "게시글 #30 · 조치 완료",
    node: "7068:142150",
    content: "post-30",
    step: "complete",
  },
  {
    path: "report-comment-112",
    title: "댓글 #112 · 상세",
    node: "7068:142271",
    content: "comment-112",
    step: "detail",
  },
  {
    path: "report-comment-112-input",
    title: "댓글 #112 · 조치 입력",
    node: "7068:142391",
    content: "comment-112",
    step: "input",
  },
  {
    path: "report-comment-112-confirm",
    title: "댓글 #112 · 확인 모달",
    node: "7068:144350",
    content: "comment-112",
    step: "confirm",
  },
  {
    path: "report-comment-112-complete",
    title: "댓글 #112 · 조치 완료",
    node: "7068:142511",
    content: "comment-112",
    step: "complete",
  },
];
