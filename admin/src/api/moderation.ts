import type { ReportStatus } from "../components/Badges";
import type { ReportFilter } from "../components/FilterTab";
import type { ReportRowData } from "../components/ReportRow";
import { adminRequest } from "../lib/supabase";

export const REASONS = {
  abuse: "욕설·비방",
  spam: "광고·도배",
  inappropriate: "부적절한 콘텐츠",
  other: "기타",
  underage: "만 14세 미만",
};
export type Reason = keyof typeof REASONS;
export type AccountStatus = "active" | "warning" | "community_restricted" | "suspended";
export const ACCOUNT_STATUS: Record<AccountStatus, string> = {
  active: "정상 이용",
  warning: "경고",
  community_restricted: "커뮤니티 이용 제한",
  suspended: "계정 이용 정지",
};
export type AdminIdentity = { id: string; email: string; role: "operator" | "super_admin" };
export type PageResult<T> = { total: number; rows: T[] };
export type ReportGroup = {
  id: string;
  content_id: string;
  type: "post" | "comment";
  author_id: string | null;
  author: string;
  content: string;
  report_count: number;
  first_at: string;
  latest_at: string;
  status: ReportStatus;
  reasons: Record<Reason, number>;
};
export type ReportPage = PageResult<ReportGroup> & { counts: Record<ReportFilter, number> };
export type Member = {
  id: string;
  nickname: string;
  created_at: string;
  last_sign_in_at: string | null;
  status: AccountStatus;
  posts: number;
  comments: number;
  reports: number;
  sanctions: number;
};
export type SanctionRecord = {
  id: string;
  user_id: string | null;
  target_id: string;
  nickname: string | null;
  kind: Exclude<AccountStatus, "active">;
  reason_category: Reason;
  reason: string;
  restricted_until: string | null;
  released_at: string | null;
  created_at: string;
  state: "record" | "active" | "expired" | "released";
  report_id: string | null;
  admin_id: string;
  is_held: boolean;
  /** 해제된 제재는 해제한 운영자, 그 밖에는 제재한 운영자의 이메일 */
  handled_by: string;
};
export type IndividualReport = {
  id: string;
  status: ReportStatus;
  target_type: "post" | "comment";
  post_id: string | null;
  comment_id: string | null;
  reported_user_id: string | null;
  reported_content: string | null;
  reason: Reason;
  detail: string | null;
  reporter_id: string | null;
  created_at: string;
};
export type Content = {
  id: string;
  content: string | null;
  deleted_at: string | null;
  hidden_at: string | null;
  created_at: string;
  type?: "post" | "vote";
};
export type AuditAction = {
  id: string;
  action: string;
  admin_id: string;
  reason: string;
  reason_category: Reason;
  created_at: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
};
export type ReportDetail = {
  report: IndividualReport;
  related_reports: IndividualReport[];
  group_status: ReportStatus;
  report_count: number;
  post: Content | null;
  comment: Content | null;
  author_name: string | null;
  author: { id: string; status: AccountStatus; restricted_until: string | null } | null;
  products: { name: string; brand: string | null; url: string; image_url: string | null }[];
  sanctions: SanctionRecord[];
  actions: AuditAction[];
};
export function consoleQuery<T>(
  resource: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  return adminRequest<T>({ action: "console", resource, ...params }, signal);
}
export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function reportRow(report: ReportGroup): ReportRowData {
  return {
    id: report.id,
    type: report.type,
    title: `${report.type === "post" ? "게시글" : "댓글"} #${report.content_id}`,
    excerpt: report.content,
    author: report.author,
    authorId: report.author_id ?? "탈퇴",
    reportCount: report.report_count,
    reasons: Object.entries(report.reasons)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => ({ label: REASONS[reason as Reason], count })),
    latestAt: formatDate(report.latest_at),
    firstAt: formatDate(report.first_at),
    status: report.status,
  };
}
