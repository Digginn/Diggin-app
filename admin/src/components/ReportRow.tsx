import { AdminIcon } from "./AdminIcon";
import { ReasonTag, StatusBadge, TypeBadge, type ContentType, type ReportStatus } from "./Badges";

export type ReportRowData = {
  id: string;
  type: ContentType;
  title: string;
  excerpt: string;
  author: string;
  authorId: string;
  reportCount: number;
  reasons: { label: string; count: number }[];
  latestAt: string;
  firstAt: string;
  status: ReportStatus;
};

export function ReportRow({
  report,
  onOpen,
}: {
  report: ReportRowData;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      className="report-row"
      type="button"
      onClick={() => onOpen(report.id)}
      aria-label={`${report.title} 신고 상세 보기`}
    >
      <span className="report-row__content">
        <span className="report-row__title">
          <TypeBadge type={report.type} />
          <span>{report.title}</span>
        </span>
        <span className="report-row__excerpt">{report.excerpt}</span>
      </span>
      <span className="report-row__author">
        <span>{report.author}</span>
        <span>{report.authorId}</span>
      </span>
      <span className="report-row__count">{report.reportCount}건</span>
      <span className="report-row__reasons">
        {report.reasons.map((reason) => (
          <ReasonTag key={reason.label} {...reason} />
        ))}
      </span>
      <span className="report-row__dates">
        <span>{report.latestAt}</span>
        <span>최초 {report.firstAt}</span>
      </span>
      <span>
        <StatusBadge status={report.status} />
      </span>
      <span className="report-row__arrow">
        <AdminIcon asset="row-chevron" size={20} />
        <AdminIcon name="chevron-right" size={20} />
      </span>
    </button>
  );
}
