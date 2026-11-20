import type { ReportFilter } from "../components/FilterTab";
import type { ReportRowData } from "../components/ReportRow";
import type { ContentTypeFilter } from "../screens/reports/components/ContentTypeSelect";

import { PREVIEW_REPORTS } from "./reports";

type ReportDesignState = {
  path: string;
  title: string;
  node: string;
  selected?: ReportFilter;
  type?: ContentTypeFilter;
  query?: string;
  isTypeOpen?: boolean;
  reports?: ReportRowData[];
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

// 각 시안은 기본 목록에서 한 콘텐츠만 조치한 독립 예시다. 조치를 누적하지 않는다.
function afterReportAction(
  type: ReportRowData["type"],
  id: string,
  status: ReportRowData["status"],
): ReportRowData[] {
  return PREVIEW_REPORTS.map((report) =>
    report.type === type && report.id === id ? { ...report, status } : report,
  );
}

export const REPORT_ACTION_DESIGN_STATES: ReportDesignState[] = [
  {
    path: "reports-after-post-30",
    title: "게시글 #30 · 처리 완료 반영",
    node: "7068:141410",
    reports: afterReportAction("post", "30", "resolved"),
  },
  {
    path: "reports-after-comment-112",
    title: "댓글 #112 · 처리 완료 반영",
    node: "7068:141510",
    reports: afterReportAction("comment", "112", "resolved"),
  },
  {
    path: "reports-after-post-11",
    title: "게시글 #11 · 반려 반영",
    node: "7068:141610",
    reports: afterReportAction("post", "11", "rejected"),
  },
  {
    path: "reports-after-post-10",
    title: "게시글 #10 · 처리 완료 반영",
    node: "7068:141710",
    reports: afterReportAction("post", "10", "resolved"),
  },
  {
    path: "reports-after-comment-98",
    title: "댓글 #98 · 처리 완료 반영",
    node: "7068:141810",
    reports: afterReportAction("comment", "98", "resolved"),
  },
];
