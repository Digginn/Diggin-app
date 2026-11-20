import { useCallback, useRef, useState } from "react";

import { ActionReasonField } from "../../components/ActionReasonField";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { AdminSidebar } from "../../components/AdminSidebar";
import { AdminToast } from "../../components/AdminToast";
import { REPORT_STATUS, StatusBadge, TypeBadge, type ReportStatus } from "../../components/Badges";
import { HistoryItem } from "../../components/HistoryItem";
import { SanctionSelect, type Sanction } from "../../components/SanctionSelect";
import { StatusSegment } from "../../components/StatusSegment";
import { VisibilityControl } from "../../components/VisibilityControl";
import {
  DETAIL_EXAMPLES,
  type DetailHistory,
  type DetailKey,
  type DetailStep,
} from "../../preview-data/report-details";

import {
  ReportActionDialog,
  SANCTION_LABELS,
  type ReportAction,
} from "./components/ReportActionDialog";
import "./report-detail.css";

export function ReportDetailScreen({
  content,
  initialStep,
  initialRefreshToast = false,
  email,
  onBack,
  onLogout,
}: {
  content: DetailKey;
  initialStep: DetailStep;
  initialRefreshToast?: boolean;
  email: string;
  onBack: (status: ReportStatus) => void;
  onLogout: () => Promise<void>;
}) {
  const example = DETAIL_EXAMPLES[content];
  const { report } = example;
  const isPost = report.type === "post";
  const hasInput = initialStep !== "detail";
  const initialAction: ReportAction = {
    status: example.initialStatus,
    sanction: example.initialSanction,
    reason: example.reason,
  };
  const [draft, setDraft] = useState<ReportAction>(
    hasInput ? initialAction : { status: report.status, sanction: null, reason: "" },
  );
  const [applied, setApplied] = useState<ReportAction | null>(
    initialStep === "complete" ? initialAction : null,
  );
  const result = applied ?? (example.closed ? initialAction : null);
  const resultAt = example.closed?.at ?? "2026.10.31 14:20";
  const [isConfirmOpen, setIsConfirmOpen] = useState(initialStep === "confirm");
  const [isHidden, setIsHidden] = useState(example.isHidden ?? false);
  const [visibilityHistory, setVisibilityHistory] = useState<DetailHistory[]>([]);
  const [toast, setToast] = useState({
    id: 0,
    message: initialRefreshToast
      ? "최신 정보로 새로고침했어요."
      : example.initialStatus === "rejected"
        ? "신고를 반려했어요."
        : "조치를 적용했어요.",
    visible: initialRefreshToast || initialStep === "complete",
    isRefresh: initialRefreshToast,
  });
  const dismissToast = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);
  const applyRef = useRef<HTMLButtonElement>(null);
  const appliedLock = useRef(initialStep === "complete" || Boolean(example.closed));
  const status = applied?.status ?? report.status;
  const isRestricted = result?.sanction === "community_restricted";
  const isSuspended = result?.sanction === "suspended";
  const currentHistory: DetailHistory[] = [];
  if (applied) {
    if (applied.status !== report.status)
      currentHistory.push({
        action:
          applied.status === "resolved"
            ? "신고 처리 완료"
            : applied.status === "rejected"
              ? "신고 반려"
              : "신고 상태 변경",
        time: "방금 전",
        meta: `운영자 diggin.app · ${REPORT_STATUS[report.status]} → ${REPORT_STATUS[applied.status]} · 신고 ${report.reportCount}건 일괄 처리`,
        kind: applied.status === "rejected" ? "rejected" : "completed",
        reason: applied.status === "rejected" ? applied.reason : undefined,
        isHighlighted: applied.status === "rejected",
      });
    if (applied.sanction)
      currentHistory.push({
        action: SANCTION_LABELS[applied.sanction],
        time: "방금 전",
        meta: `운영자 diggin.app · ${example.sanctionReason}${isRestricted ? " · 11.07 14:20 종료 예정" : ""}`,
        reason: applied.reason,
        kind:
          applied.sanction === "warning"
            ? "status"
            : applied.sanction === "release"
              ? "release"
              : "sanction",
        isHighlighted: true,
      });
  }
  const history = [...visibilityHistory, ...currentHistory, ...example.history];
  const showToast = (message: string, isRefresh = false) =>
    setToast((t) => ({ id: t.id + 1, message, visible: true, isRefresh }));
  function closeConfirm() {
    setIsConfirmOpen(false);
    applyRef.current?.focus();
  }
  function apply() {
    if (appliedLock.current) return;
    appliedLock.current = true;
    setApplied({
      ...draft,
      sanction: draft.status === "rejected" ? null : draft.sanction,
      reason: draft.reason.trim(),
    });
    setIsConfirmOpen(false);
    showToast(draft.status === "rejected" ? "신고를 반려했어요." : "조치를 적용했어요.");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const hasChange = draft.status !== report.status || draft.sanction !== null;
  return (
    <div className="report-screen report-detail report-screen--after-action">
      <AdminSidebar
        email={email}
        count={5 - (applied && (status === "resolved" || status === "rejected") ? 1 : 0)}
        reportsHref="#/designs/reports"
        onLogout={onLogout}
      />
      <main className="report-main detail-main">
        <a
          className="detail-back"
          href="#/designs/reports-current"
          onClick={(e) => {
            e.preventDefault();
            onBack(status);
          }}
        >
          <AdminIcon asset="detail-back" size={16} />
          신고 목록
        </a>
        <header className="detail-header">
          <div>
            <div className="detail-badges">
              <TypeBadge type={report.type} />
              <StatusBadge status={status} />
            </div>
            <h1>{report.title}</h1>
            <p>
              콘텐츠 ID {report.id} · 신고 {report.reportCount}건 · 최초 신고 2026.{report.firstAt}{" "}
              ·{" "}
              {result
                ? `${REPORT_STATUS[status]} ${resultAt}`
                : `최근 신고 2026.${report.latestAt}`}
            </p>
          </div>
          <AdminBtn
            variant="outline"
            size="s"
            icon="refresh"
            onClick={() => showToast("최신 정보로 새로고침했어요.", true)}
          >
            상세 새로고침
          </AdminBtn>
        </header>
        <div className="detail-columns">
          <div className="detail-left">
            <section
              className="detail-card detail-original"
              aria-label={isPost ? "게시글 원문" : "댓글 원문"}
            >
              <div className="detail-card-heading">
                <h2>{isPost ? "게시글" : "댓글"} 원문</h2>
                <span
                  className={`detail-visibility-chip ${isHidden ? "detail-visibility-chip--hidden" : ""}`}
                >
                  <AdminIcon asset={isHidden ? "detail-eye-off" : "detail-eye"} size={14} />
                  {isHidden ? "숨김 처리됨" : "공개 중"}
                </span>
              </div>
              <div className="detail-author">
                <span className="detail-avatar">
                  <AdminIcon asset="detail-avatar" size={20} />
                </span>
                <div className="detail-author__info">
                  <div>
                    <strong>{report.author}</strong>
                    <span
                      className={`detail-account-chip ${isRestricted || isSuspended ? "detail-account-chip--restricted" : ""}`}
                    >
                      {isSuspended
                        ? "계정 이용 정지"
                        : isRestricted
                          ? "커뮤니티 이용 제한 중"
                          : "정상 이용"}
                    </span>
                  </div>
                  <p>UUID {example.uuid}</p>
                </div>
                <span>
                  누적 제재{" "}
                  {example.sanctions +
                    (applied?.sanction && applied.sanction !== "release" ? 1 : 0)}
                  회
                </span>
              </div>
              {example.parentPost && (
                <div className="detail-parent">
                  <p>원 게시글</p>
                  <p>{example.parentPost}</p>
                </div>
              )}
              <div className={`detail-content ${isHidden ? "detail-content--hidden" : ""}`}>
                {report.excerpt}
              </div>
              {example.product && (
                <div className="detail-product">
                  <span aria-hidden="true" />
                  <div>
                    <p>연결 상품</p>
                    <p>{example.product}</p>
                  </div>
                </div>
              )}
              <p className="detail-created">{example.created}</p>
            </section>
            <section className="detail-card detail-reports" aria-label="신고 내역">
              <h2>
                신고 내역 <span>{example.reports.length}건</span>
              </h2>
              <ol>
                {example.reports.map((item) => (
                  <li key={item.id}>
                    <div>
                      <span className="reason-tag">{item.label}</span>
                      <strong>신고 #{item.id}</strong>
                      <time>{item.time}</time>
                    </div>
                    {item.reason && <p>{item.reason}</p>}
                    <small>신고자 {item.reporter}</small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <div className="detail-right">
            {result ? (
              <section className="detail-card detail-processing" aria-label="처리 결과">
                <div className="detail-card-heading">
                  <h2>처리 결과</h2>
                  <StatusBadge status={status} />
                </div>
                <dl className="detail-result-summary">
                  <div>
                    <dt>조치</dt>
                    <dd>
                      {example.closed?.action ??
                        (result.sanction
                          ? SANCTION_LABELS[result.sanction]
                          : result.status === "rejected"
                            ? "조치 없음"
                            : "신고 상태 변경")}
                    </dd>
                  </div>
                  <div>
                    <dt>처리자</dt>
                    <dd>운영자 diggin.app</dd>
                  </div>
                  <div>
                    <dt>처리 일시</dt>
                    <dd>{resultAt}</dd>
                  </div>
                  <div>
                    <dt>조치 사유</dt>
                    <dd>{result.reason}</dd>
                  </div>
                </dl>
                {applied && (isRestricted || isSuspended) && (
                  <p className="detail-restriction">
                    <AdminIcon asset="detail-current-ban" size={16} />
                    {isSuspended
                      ? "계정 이용 정지 중 · 제재 해제 전까지 유지"
                      : "커뮤니티 이용 제한 중 · 2026.11.07 14:20 종료 예정"}
                  </p>
                )}
                <div className="detail-visibility-section">
                  <h3>콘텐츠 숨김·복구</h3>
                  <VisibilityControl isHidden={isHidden} onChange={toggleVisibility} />
                </div>
              </section>
            ) : (
              <form
                className="detail-card detail-processing"
                aria-label="신고 처리"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.reason.trim() && hasChange) setIsConfirmOpen(true);
                }}
              >
                <div>
                  <h2>신고 처리</h2>
                  <p className="detail-card-description">
                    상태 변경, 콘텐츠 노출, 작성자 제재를 처리합니다.
                  </p>
                </div>
                <div>
                  <h3>신고 상태</h3>
                  <StatusSegment
                    selected={draft.status}
                    onChange={(status) =>
                      setDraft((d) => ({
                        ...d,
                        status,
                        sanction: status === "rejected" ? null : d.sanction,
                      }))
                    }
                  />
                </div>
                <div>
                  <h3>콘텐츠 숨김·복구</h3>
                  <VisibilityControl isHidden={isHidden} onChange={toggleVisibility} />
                </div>
                <div className="detail-sanction-section">
                  <div className="detail-section-heading">
                    <h3>작성자 제재</h3>
                    <span>진행 중인 제재 없음</span>
                  </div>
                  <SanctionSelect
                    selected={draft.sanction}
                    disabled={draft.status === "rejected"}
                    onChange={(sanction: Sanction | null) => setDraft((d) => ({ ...d, sanction }))}
                  />
                </div>
                <div>
                  <h3>
                    조치 사유 <span className="detail-required">*</span>
                  </h3>
                  <ActionReasonField
                    value={draft.reason}
                    onChange={(reason) => setDraft((d) => ({ ...d, reason }))}
                  />
                </div>
                <AdminBtn
                  ref={applyRef}
                  className="detail-apply"
                  type="submit"
                  disabled={!draft.reason.trim() || !hasChange}
                >
                  조치 적용
                </AdminBtn>
              </form>
            )}
            <section className="detail-card detail-history" aria-label="처리 이력">
              <div>
                <h2>
                  처리 이력 <span>{history.length}건</span>
                </h2>
                <p className="detail-card-description">
                  작성자의 기존 제재와 이 신고의 처리 기록입니다.
                </p>
              </div>
              <div>
                {history.map((item, index) => (
                  <HistoryItem
                    key={`${item.action}-${index}`}
                    {...item}
                    hasLine={index < history.length - 1}
                  />
                ))}
                {history.length === 0 && (
                  <p className="detail-history-empty">아직 처리 이력이 없습니다.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
      <ReportActionDialog
        isOpen={isConfirmOpen}
        action={draft}
        previousStatus={report.status}
        author={report.author}
        reportCount={report.reportCount}
        onCancel={closeConfirm}
        onApply={apply}
      />
      <div className="detail-toast">
        <AdminToast
          key={toast.id}
          message={toast.message}
          variant={toast.isRefresh ? "refresh" : "success"}
          isVisible={toast.visible}
          onDismiss={dismissToast}
        />
      </div>
    </div>
  );
  function toggleVisibility(hidden: boolean) {
    setIsHidden(hidden);
    setVisibilityHistory((items) => [
      {
        action: hidden ? "콘텐츠 숨김" : "콘텐츠 복구",
        time: "방금 전",
        meta: `운영자 diggin.app · ${hidden ? "공개 → 숨김" : "숨김 → 공개"}`,
        kind: "content",
      },
      ...items,
    ]);
    showToast(hidden ? "콘텐츠를 숨겼어요." : "콘텐츠를 복구했어요.");
  }
}
