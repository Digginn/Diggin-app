import type { ReportFilter } from "../components/FilterTab";
import type { ContentTypeFilter } from "../screens/reports/components/ContentTypeSelect";

type ReportDesignState = {
  path: string;
  title: string;
  node: string;
  selected?: ReportFilter;
  type?: ContentTypeFilter;
  query?: string;
  isTypeOpen?: boolean;
};

export const REPORT_DESIGN_STATES: ReportDesignState[] = [
  { path: "reports", title: "신고 목록 · 전체", node: "7068:140646" },
  {
    path: "reports-received",
    title: "신고 목록 · 접수",
    node: "7068:140746",
    selected: "received",
  },
  {
    path: "reports-reviewing",
    title: "신고 목록 · 검토 중",
    node: "7068:140841",
    selected: "reviewing",
  },
  {
    path: "reports-resolved",
    title: "신고 목록 · 처리 완료",
    node: "7068:140935",
    selected: "resolved",
  },
  {
    path: "reports-rejected",
    title: "신고 목록 · 반려",
    node: "7068:141029",
    selected: "rejected",
  },
  { path: "reports-posts", title: "신고 목록 · 게시글", node: "7068:141122", type: "post" },
  { path: "reports-comments", title: "신고 목록 · 댓글", node: "7068:141219", type: "comment" },
  { path: "reports-search", title: "신고 목록 · 검색 결과", node: "7068:141314", query: "디깅" },
  {
    path: "reports-type-open",
    title: "유형 선택 · 전체 유형",
    node: "7068:144440",
    isTypeOpen: true,
  },
  {
    path: "reports-posts-type-open",
    title: "유형 선택 · 게시글",
    node: "7068:144552",
    type: "post",
    isTypeOpen: true,
  },
  {
    path: "reports-comments-type-open",
    title: "유형 선택 · 댓글",
    node: "7068:144661",
    type: "comment",
    isTypeOpen: true,
  },
];
