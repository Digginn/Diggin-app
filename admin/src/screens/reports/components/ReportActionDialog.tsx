import { useEffect, useId, useRef } from "react";

import { AdminBtn } from "../../../components/AdminBtn";
import { AdminIcon } from "../../../components/AdminIcon";
import { REPORT_STATUS, type ReportStatus } from "../../../components/Badges";
import type { Sanction } from "../../../components/SanctionSelect";

export const SANCTION_LABELS: Record<Sanction, string> = {
  warning: "경고",
  community_restricted: "커뮤니티 이용 제한 7일",
  suspended: "계정 이용 정지",
  release: "제재 해제",
};
export type ReportAction = { status: ReportStatus; sanction: Sanction | null; reason: string };

export function ReportActionDialog({
  isOpen,
  action,
  previousStatus,
  author,
  reportCount,
  onCancel,
  onApply,
  isApplying = false,
  error,
  isLive = false,
}: {
  isOpen: boolean;
  action: ReportAction;
  previousStatus: ReportStatus;
  author: string;
  reportCount: number;
  onCancel: () => void;
  onApply: () => void;
  isApplying?: boolean;
  error?: string;
  isLive?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (isOpen && !dialog?.open) dialog?.showModal();
    if (!isOpen && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [isOpen]);
  const isRestriction = action.sanction === "community_restricted";
  const isRejection = action.status === "rejected";
  const isSuspension = action.sanction === "suspended" && !isRejection;
  const title = isRejection
    ? "신고를 반려합니까?"
    : action.sanction === "warning"
      ? "경고를 적용합니까?"
      : isRestriction
        ? "커뮤니티 이용 제한을 적용합니까?"
        : action.sanction === "suspended"
          ? "계정 이용을 정지합니까?"
          : action.sanction === "release"
            ? "제재를 해제합니까?"
            : "조치를 적용합니까?";
  const description = isRejection
    ? `신고 ${reportCount}건이 반려로 변경됩니다. 작성자에게는 조치가 적용되지 않습니다.`
    : action.sanction === "warning"
      ? `${author}님에게 경고가 기록됩니다. 커뮤니티 이용은 제한되지 않습니다.`
      : isRestriction
        ? `${author}님은 2026.11.07 14:20까지 게시글·댓글을 작성할 수 없습니다. 적용 후에는 처리 이력에 기록됩니다.`
        : isSuspension
          ? `${author}님은 로그인과 모든 기능을 이용할 수 없습니다. 정지는 제재 해제 전까지 유지됩니다.`
          : isLive
            ? "입력한 조치를 실제 데이터에 적용하고 처리 이력에 기록합니다."
            : "입력한 조치는 이 화면의 예시에 반영되고 처리 이력에 표시됩니다.";
  return (
    <dialog
      ref={ref}
      className="logout-dialog report-action-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        e.preventDefault();
        if (!isApplying) onCancel();
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        )
          if (!isApplying) onCancel();
      }}
    >
      <div className="logout-dialog__head">
        <span
          className={`logout-dialog__icon ${isRestriction || isSuspension ? "report-action-dialog__danger" : ""}`}
        >
          {isRejection ? (
            <AdminIcon asset="detail-info" size={22} />
          ) : isSuspension ? (
            <AdminIcon asset="detail-suspended" size={22} />
          ) : isRestriction ? (
            <AdminIcon asset="detail-ban" size={22} />
          ) : action.sanction === "warning" ? (
            <AdminIcon asset="detail-warning" size={22} />
          ) : (
            <AdminIcon
              name={
                action.sanction === "suspended"
                  ? "user"
                  : action.sanction === "release"
                    ? "unlock"
                    : "warning"
              }
              size={22}
            />
          )}
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>
          {isLive && isRestriction
            ? `${author}님의 커뮤니티 이용을 적용 시점부터 7일간 제한합니다.`
            : description}
        </p>
      </div>
      <dl className="detail-result-summary">
        <div>
          <dt>신고 상태</dt>
          <dd>
            {REPORT_STATUS[previousStatus]} → {REPORT_STATUS[action.status]}
          </dd>
        </div>
        <div>
          <dt>작성자 제재</dt>
          <dd>
            {isRejection
              ? "적용 안 함"
              : action.sanction
                ? SANCTION_LABELS[action.sanction]
                : "없음"}
          </dd>
        </div>
        <div>
          <dt>조치 사유</dt>
          <dd>{action.reason}</dd>
        </div>
      </dl>
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      <div className="logout-dialog__actions">
        <AdminBtn variant="secondary" autoFocus disabled={isApplying} onClick={onCancel}>
          취소
        </AdminBtn>
        <AdminBtn
          variant={isSuspension ? "danger" : "primary"}
          disabled={isApplying}
          onClick={onApply}
        >
          {isApplying
            ? "처리 중…"
            : isRejection
              ? "반려하기"
              : isSuspension
                ? "정지하기"
                : "적용하기"}
        </AdminBtn>
      </div>
    </dialog>
  );
}
