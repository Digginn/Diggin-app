import { useRef, useState } from "react";

import {
  ACCOUNT_STATUS,
  REASONS,
  formatDate,
  type Reason,
  type ReportDetail,
  type IndividualReport,
} from "../../api/moderation";
import { ActionReasonField } from "../../components/ActionReasonField";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminSidebar } from "../../components/AdminSidebar";
import { REPORT_STATUS, StatusBadge, TypeBadge, type ReportStatus } from "../../components/Badges";
import { HistoryItem } from "../../components/HistoryItem";
import { QueryState } from "../../components/QueryState";
import { SanctionSelect, type Sanction } from "../../components/SanctionSelect";
import { StatusSegment } from "../../components/StatusSegment";
import { VisibilityControl } from "../../components/VisibilityControl";
import { useAdminMutationPlan } from "../../hooks/useAdminMutationPlan";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { adminRequest, errorMessage } from "../../lib/supabase";

import {
  ReportActionDialog,
  SANCTION_LABELS,
  type ReportAction,
} from "./components/ReportActionDialog";
import "./report-detail.css";

export function LiveReportDetailScreen({
  reportId,
  adminId,
  email,
  onLogout,
}: {
  reportId: string;
  adminId: string;
  email: string;
  onLogout: () => Promise<void>;
}) {
  const query = useAdminQuery<ReportDetail>("report_detail", { report_id: reportId });
  const data = query.data;
  const [status, setStatus] = useState<ReportStatus>();
  const [sanction, setSanction] = useState<Sanction | null>(null);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<Reason>("other");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useAdminMutationPlan(
    data
      ? `${adminId}:report:${data.report.target_type}:${data.report.post_id ?? data.report.comment_id}`
      : undefined,
    query.refresh,
  );
  const { hasPendingPlan, isApplying } = mutation;
  const [olderReports, setOlderReports] = useState<IndividualReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const reportPageLock = useRef(false);
  const pageCursor = useRef<string | undefined>(undefined);
  const draft: ReportAction = {
    status: status ?? data?.group_status ?? "received",
    sanction,
    reason,
  };

  async function runPlan(operations?: Record<string, unknown>[]) {
    setError("");
    setNotice("");
    setIsConfirmOpen(false);
    if (await mutation.runPlan(operations)) {
      setStatus(undefined);
      setSanction(null);
      setReason("");
      setOlderReports([]);
      pageCursor.current = undefined;
      setNotice("조치가 적용되었습니다. 서버의 최신 정보를 다시 확인합니다.");
    }
  }

  function prepareAction(hidden?: boolean, reasonCategory: Reason = category) {
    if (!data || !mutation.isReady || isApplying || hasPendingPlan || !reason.trim()) return;
    const common = { reason: reason.trim(), reason_category: reasonCategory, report_id: reportId };
    const operations: Record<string, unknown>[] = [];
    if (hidden !== undefined) operations.push({ ...common, action: hidden ? "hide" : "restore" });
    else {
      // 제재가 실패한 신고를 완료로 닫지 않는다. 각 단계의 요청 ID와 성공 여부를 보존한다.
      if (sanction && data.author)
        operations.push({ ...common, action: "sanction", user_id: data.author.id, sanction });
      if (draft.status !== data.group_status)
        operations.push({ ...common, action: "report_group_status", status: draft.status });
    }
    void runPlan(operations);
  }

  async function loadReports() {
    if (!data || reportPageLock.current) return;
    const reports = [...data.related_reports, ...olderReports];
    const before = reports.at(-1)?.id;
    if (!before || pageCursor.current === before) return;
    reportPageLock.current = true;
    setIsLoadingReports(true);
    setError("");
    try {
      const next = await adminRequest<ReportDetail>({
        action: "report_detail",
        report_id: reportId,
        before_report_id: before,
      });
      setOlderReports((previous) => [...previous, ...next.related_reports]);
      pageCursor.current = before;
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      reportPageLock.current = false;
      setIsLoadingReports(false);
    }
  }

  const target = data?.report.target_type === "comment" ? data.comment : data?.post;
  const isDeleted = !target || Boolean(target.deleted_at) || Boolean(data?.post?.deleted_at);
  const accountStatus =
    data?.author?.status === "community_restricted" &&
    data.author.restricted_until &&
    new Date(data.author.restricted_until) <= new Date()
      ? "active"
      : data?.author?.status;
  const allowed: ReportStatus[] =
    data?.group_status === "received"
      ? ["received", "reviewing"]
      : data?.group_status === "reviewing"
        ? ["reviewing", "resolved", "rejected"]
        : [data?.group_status ?? "received"];
  const reports = data ? [...data.related_reports, ...olderReports] : [];
  const isClosed = data?.group_status === "resolved" || data?.group_status === "rejected";
  const closingAction = data?.actions.find(
    (action) =>
      action.action === "report_status" &&
      (action.after_state.group_status ?? action.after_state.status) === data.group_status,
  );
  const canChange =
    data &&
    mutation.isReady &&
    (draft.status !== data.group_status || sanction !== null) &&
    reason.trim() &&
    !(
      category === "underage" &&
      (draft.status !== data.group_status || !["suspended", "release"].includes(sanction ?? ""))
    );
  return (
    <div className="report-screen report-detail report-screen--after-action">
      <AdminSidebar email={email} reportsHref="#/reports" onLogout={onLogout} />
      <main className="report-main detail-main">
        <a className="detail-back" href="#/reports">
          ← 신고 목록
        </a>
        <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refresh} />
        {notice && (
          <p className="live-notice" role="status">
            {notice}
          </p>
        )}
        {(error || mutation.error) && (
          <p className="live-error" role="alert">
            {error || mutation.error}
          </p>
        )}
        {hasPendingPlan && !isApplying && (
          <div className="live-notice">
            <p>
              요청 결과를 확인하지 못했습니다. 같은 요청을 재시도하면 이미 적용된 단계는 반복
              적용하지 않습니다.
            </p>
            <AdminBtn onClick={() => void runPlan()}>같은 요청 재시도</AdminBtn>
          </div>
        )}
        {data && (
          <>
            <header className="detail-header">
              <div>
                <div className="detail-badges">
                  <TypeBadge type={data.report.target_type} />
                  <StatusBadge status={data.group_status} />
                </div>
                <h1>
                  {data.report.target_type === "post" ? "게시글" : "댓글"} #
                  {target?.id ?? data.report.post_id ?? data.report.comment_id}
                </h1>
                <p>
                  신고 {data.report_count}건 · 신고 ID {reportId}
                </p>
              </div>
              <AdminBtn
                variant="outline"
                disabled={isApplying || isLoadingReports}
                onClick={() => {
                  setOlderReports([]);
                  pageCursor.current = undefined;
                  query.refresh();
                }}
              >
                상세 새로고침
              </AdminBtn>
            </header>
            <div className="detail-columns">
              <div className="detail-left">
                <section className="detail-card detail-original" aria-label="신고 콘텐츠 원문">
                  <div className="detail-card-heading">
                    <h2>원문</h2>
                    <span>
                      {isDeleted ? "삭제됨" : target?.hidden_at ? "숨김 처리됨" : "공개 중"}
                    </span>
                  </div>
                  <div className="detail-author">
                    <div className="detail-author__info">
                      <strong>{data.author_name ?? "탈퇴한 회원"}</strong>
                      <p>UUID {data.author?.id ?? "—"}</p>
                      <p>
                        {accountStatus ? ACCOUNT_STATUS[accountStatus] : "탈퇴"}
                        {accountStatus === "community_restricted" &&
                          ` · ${formatDate(data.author?.restricted_until ?? null)}까지`}
                      </p>
                    </div>
                    <span>보관 중 제재 {data.sanctions.length}회</span>
                  </div>
                  {data.report.target_type === "comment" && (
                    <div className="detail-parent">
                      <p>원 게시글</p>
                      <p>{data.post?.content ?? "삭제된 게시글"}</p>
                    </div>
                  )}
                  <div className="detail-content">
                    {data.report.target_type === "comment" && <h3>현재 댓글</h3>}
                    <p>
                      {target?.content ??
                        data.report.reported_content ??
                        "삭제되어 원문을 확인할 수 없습니다."}
                    </p>
                  </div>
                  {data.products.map((product, index) => (
                    <div className="detail-product" key={index}>
                      <div>
                        <p>{product.name}</p>
                        <p>{product.brand}</p>
                      </div>
                    </div>
                  ))}
                  <p className="detail-created">{formatDate(target?.created_at ?? null)}</p>
                </section>
                <section className="detail-card detail-reports" aria-label="신고 내역">
                  <h2>
                    신고 내역 <span>{data.report_count}건</span>
                  </h2>
                  <ol>
                    {reports.map((report) => (
                      <li key={report.id}>
                        <div>
                          <span className="reason-tag">{REASONS[report.reason]}</span>
                          <strong>신고 #{report.id}</strong>
                          <time>{formatDate(report.created_at)}</time>
                          <StatusBadge status={report.status} />
                        </div>
                        {report.detail && <p>{report.detail}</p>}
                        {report.reported_content !== null &&
                          report.reported_content !== undefined && (
                            <div className="detail-content">
                              <h3>신고 당시 댓글</h3>
                              <p>{report.reported_content}</p>
                            </div>
                          )}
                        <small>신고자 {report.reporter_id ?? "탈퇴"}</small>
                      </li>
                    ))}
                  </ol>
                  {reports.length < data.report_count && (
                    <AdminBtn
                      variant="outline"
                      disabled={isLoadingReports || isApplying}
                      onClick={() => void loadReports()}
                    >
                      {isLoadingReports ? "불러오는 중…" : "신고 내역 더 보기"}
                    </AdminBtn>
                  )}
                </section>
              </div>
              <div className="detail-right">
                {isClosed && !hasPendingPlan ? (
                  <section className="detail-card detail-processing" aria-label="처리 결과">
                    <div className="detail-card-heading">
                      <h2>처리 결과</h2>
                      <StatusBadge status={data.group_status} />
                    </div>
                    <dl className="detail-result-summary">
                      <div>
                        <dt>조치</dt>
                        <dd>{REPORT_STATUS[data.group_status]}</dd>
                      </div>
                      <div>
                        <dt>처리자</dt>
                        <dd>{closingAction?.admin_id ?? "기록 없음"}</dd>
                      </div>
                      <div>
                        <dt>처리 일시</dt>
                        <dd>{formatDate(closingAction?.created_at ?? null)}</dd>
                      </div>
                      <div>
                        <dt>조치 사유</dt>
                        <dd>{closingAction?.reason ?? "보관 중인 처리 기록이 없습니다."}</dd>
                      </div>
                    </dl>
                    <fieldset className="live-action-fields" disabled={isApplying}>
                      <h3>콘텐츠 숨김·복구</h3>
                      <ActionReasonField
                        value={reason}
                        onChange={setReason}
                        label="숨김·복구 사유"
                      />
                      <VisibilityControl
                        isHidden={Boolean(target?.hidden_at)}
                        disabled={isDeleted || !reason.trim()}
                        onChange={(hidden) => {
                          setCategory("other");
                          prepareAction(hidden, "other");
                        }}
                      />
                    </fieldset>
                  </section>
                ) : (
                  <form
                    className="detail-card detail-processing"
                    aria-label="신고 처리"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (canChange) setIsConfirmOpen(true);
                    }}
                  >
                    <h2>신고 처리</h2>
                    <fieldset
                      className="live-action-fields"
                      disabled={isApplying || hasPendingPlan}
                    >
                      <div>
                        <h3>신고 상태</h3>
                        <StatusSegment
                          selected={draft.status}
                          allowed={allowed}
                          onChange={(value) => {
                            setStatus(value);
                            if (value === "rejected") setSanction(null);
                          }}
                        />
                        <p className="detail-card-description">
                          접수 → 검토 중 → 완료·반려 순서로 처리합니다. 완료된 신고는 보존합니다.
                        </p>
                      </div>
                      <div>
                        <h3>사유 분류</h3>
                        <select
                          className="live-reason-select"
                          aria-label="사유 분류"
                          value={category}
                          onChange={(event) => setCategory(event.target.value as Reason)}
                        >
                          {Object.entries(REASONS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <h3>조치 사유 *</h3>
                        <ActionReasonField value={reason} onChange={setReason} />
                      </div>
                      <div>
                        <h3>콘텐츠 숨김·복구</h3>
                        <VisibilityControl
                          isHidden={Boolean(target?.hidden_at)}
                          disabled={isDeleted || !reason.trim() || category === "underage"}
                          onChange={prepareAction}
                        />
                        {isDeleted && <p>작성자가 삭제한 콘텐츠는 복구할 수 없습니다.</p>}
                      </div>
                      <div>
                        <h3>작성자 제재</h3>
                        <SanctionSelect
                          selected={sanction}
                          disabled={!data.author || draft.status === "rejected"}
                          onChange={setSanction}
                        />
                      </div>
                      <AdminBtn type="submit" disabled={!canChange}>
                        조치 적용
                      </AdminBtn>
                    </fieldset>
                  </form>
                )}
                <section className="detail-card detail-history" aria-label="처리 이력">
                  <h2>처리 이력 {data.actions.length}건</h2>
                  {data.actions.length === 0 && (
                    <p className="detail-history-empty">아직 처리 이력이 없습니다.</p>
                  )}
                  {data.actions.map((action, index) => (
                    <HistoryItem
                      key={action.id}
                      action={
                        action.action in SANCTION_LABELS
                          ? SANCTION_LABELS[action.action as Sanction]
                          : ({
                              hide: "콘텐츠 숨김",
                              restore: "콘텐츠 복구",
                              report_status: `신고 상태 변경 · ${REPORT_STATUS[(action.after_state.group_status ?? action.after_state.status) as ReportStatus] ?? "기록 확인"}`,
                            }[action.action] ?? action.action)
                      }
                      time={formatDate(action.created_at)}
                      meta={`운영자 ${action.admin_id} · ${REASONS[action.reason_category]}`}
                      reason={action.reason}
                      kind="status"
                      hasLine={index < data.actions.length - 1}
                    />
                  ))}
                </section>
              </div>
            </div>
            <ReportActionDialog
              isOpen={isConfirmOpen}
              action={draft}
              previousStatus={data.group_status}
              author={data.author_name ?? "탈퇴한 회원"}
              reportCount={data.report_count}
              isApplying={isApplying}
              isLive
              error={error}
              onCancel={() => setIsConfirmOpen(false)}
              onApply={() => prepareAction()}
            />
          </>
        )}
      </main>
    </div>
  );
}
