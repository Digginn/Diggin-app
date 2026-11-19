import { REPORT_STATUS, REPORT_STATUSES, type ReportStatus } from "./Badges";

export type ReportFilter = "all" | ReportStatus;

export function FilterTab({
  selected,
  counts,
  onChange,
}: {
  selected: ReportFilter;
  counts: Record<ReportFilter, number>;
  onChange: (filter: ReportFilter) => void;
}) {
  return (
    <div className="filter-tab" role="group" aria-label="신고 상태 필터">
      {(["all", ...REPORT_STATUSES] as const).map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={selected === status}
          onClick={() => onChange(status)}
        >
          {status === "all" ? "전체" : REPORT_STATUS[status]}
          <span className="filter-tab__count">{counts[status]}</span>
        </button>
      ))}
    </div>
  );
}
