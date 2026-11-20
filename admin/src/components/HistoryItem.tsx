import { AdminIcon } from "./AdminIcon";

export function HistoryItem({
  action,
  time,
  meta,
  reason,
  kind = "sanction",
  hasLine = true,
  isHighlighted = false,
}: {
  action: string;
  time: string;
  meta: string;
  reason?: string;
  kind?: "sanction" | "release" | "content" | "status" | "review" | "completed" | "rejected";
  hasLine?: boolean;
  isHighlighted?: boolean;
}) {
  return (
    <div
      className={`history-item history-item--${kind} ${isHighlighted ? "history-item--highlighted" : ""}`}
    >
      <div className="history-item__rail">
        <AdminIcon asset="history-dot" size={10} />
        {hasLine && <span />}
      </div>
      <div className="history-item__body">
        <div className="history-item__title">
          <p>{action}</p>
          <span>{time}</span>
        </div>
        <p className="history-item__meta">{meta}</p>
        {reason && <p className="history-item__reason">{reason}</p>}
      </div>
    </div>
  );
}
