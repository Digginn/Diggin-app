import { AdminIcon } from "./AdminIcon";

export const REPORT_STATUS = {
  received: "접수",
  reviewing: "검토 중",
  resolved: "처리 완료",
  rejected: "반려",
} as const;

export type ReportStatus = keyof typeof REPORT_STATUS;
export const REPORT_STATUSES = Object.keys(REPORT_STATUS) as ReportStatus[];
export type ContentType = "post" | "comment";

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <AdminIcon asset={`status-${status}`} size={6} />
      {REPORT_STATUS[status]}
    </span>
  );
}

export function TypeBadge({ type }: { type: ContentType }) {
  return <span className="type-badge">{type === "post" ? "게시글" : "댓글"}</span>;
}

export function ReasonTag({ label, count }: { label: string; count?: number }) {
  return (
    <span className="reason-tag">
      {label}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}
