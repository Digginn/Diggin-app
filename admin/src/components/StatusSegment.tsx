import { REPORT_STATUS, REPORT_STATUSES, type ReportStatus } from "./Badges";

export function StatusSegment({
  selected,
  onChange,
}: {
  selected: ReportStatus;
  onChange: (status: ReportStatus) => void;
}) {
  return (
    <div className="status-segment" role="group" aria-label="신고 상태 변경">
      {REPORT_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={selected === status}
          onClick={() => onChange(status)}
        >
          {REPORT_STATUS[status]}
        </button>
      ))}
    </div>
  );
}
