import { useEffect, useState } from "react";

import {
  ACCOUNT_STATUS,
  REASONS,
  formatDate,
  type Member,
  type PageResult,
  type SanctionRecord,
} from "../../api/moderation";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminSidebar } from "../../components/AdminSidebar";
import { Pagination, QueryState } from "../../components/QueryState";
import { clearAdminMutationPlan, useAdminMutationPlan } from "../../hooks/useAdminMutationPlan";
import { useAdminQuery } from "../../hooks/useAdminQuery";

import "./operations.css";

export function LiveOperationsScreen({
  view,
  adminId,
  email,
  onLogout,
}: {
  view: "members" | "sanctions";
  adminId: string;
  email: string;
  onLogout: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const result = useAdminQuery<PageResult<Member | SanctionRecord>>(
    view,
    { query, page },
    { keepDataOnRefresh: true },
  );
  useEffect(() => {
    for (const row of result.data?.rows ?? []) {
      if ("state" in row && row.state === "released") {
        try {
          clearAdminMutationPlan(`${adminId}:release:${row.id}`);
        } catch {
          // 서버에서 해제가 확인됐다. 남은 로컬 기록으로 새 요청을 만들지는 않는다.
        }
      }
    }
  }, [result.data, adminId]);
  const isMembers = view === "members";
  const title = isMembers ? "회원 관리" : "제재 이력";
  const headers = isMembers
    ? ["회원", "가입일", "게시글·댓글", "받은 신고", "누적 제재", "계정 상태", "최근 접속"]
    : ["작성자", "제재", "사유 분류", "기간", "상태", "처리"];
  return (
    <div className="report-screen operations-screen">
      <AdminSidebar email={email} activePage={view} reportsHref="#/reports" onLogout={onLogout} />
      <main className="report-main">
        <header className="report-page-header">
          <div>
            <p className="report-breadcrumb">커뮤니티 운영 / {title}</p>
            <h1>{title}</h1>
          </div>
          <AdminBtn
            variant="outline"
            icon="refresh"
            disabled={result.isLoading}
            onClick={result.refresh}
          >
            새로고침
          </AdminBtn>
        </header>
        <div className="live-search">
          <input
            aria-label={`${title} 검색`}
            placeholder="닉네임, UUID 검색"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={result.isLoading} error={result.error} onRetry={result.refresh} />
        {result.data && (
          <>
            <div className="operations-table-scroll">
              <table className={`operations-table operations-table--${view}`} aria-label={title}>
                <thead>
                  <tr>
                    {headers.map((header) => (
                      <th key={header} scope="col">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.rows.map((row) =>
                    "posts" in row ? (
                      <tr key={row.id}>
                        <td className="operations-author">
                          <strong>{row.nickname}</strong>
                          <small>{row.id}</small>
                        </td>
                        <td>{formatDate(row.created_at)}</td>
                        <td>
                          {row.posts} · {row.comments}
                        </td>
                        <td>{row.reports}</td>
                        <td>{row.sanctions}</td>
                        <td>{ACCOUNT_STATUS[row.status]}</td>
                        <td>{formatDate(row.last_sign_in_at)}</td>
                      </tr>
                    ) : (
                      <tr key={row.id}>
                        <td className="operations-author">
                          <strong>{row.nickname ?? "탈퇴한 회원"}</strong>
                          <small>{row.user_id ?? row.target_id}</small>
                        </td>
                        <td>{ACCOUNT_STATUS[row.kind]}</td>
                        <td>
                          {REASONS[row.reason_category]}
                          <p>{row.reason}</p>
                        </td>
                        <td>
                          {formatDate(row.created_at)}
                          <br />
                          {row.released_at
                            ? `해제 ${formatDate(row.released_at)}`
                            : row.restricted_until
                              ? `종료 ${formatDate(row.restricted_until)}`
                              : row.kind === "suspended"
                                ? "해제 전까지"
                                : "—"}
                        </td>
                        <td>
                          {
                            {
                              active: "진행 중",
                              released: "해제",
                              expired: "만료",
                              record: "기록",
                            }[row.state]
                          }
                        </td>
                        <td>
                          {row.report_id && <a href={`#/reports/${row.report_id}`}>신고 보기</a>}
                          {row.state === "active" && row.user_id && (
                            <ReleaseSanction
                              adminId={adminId}
                              row={row}
                              isRefreshing={result.isLoading}
                              onSettled={result.refresh}
                            />
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {result.data.rows.length === 0 && (
              <p className="report-table__empty" role="status">
                조건에 맞는 내역이 없습니다.
              </p>
            )}
            <Pagination page={page} total={result.data.total} onChange={setPage} />
          </>
        )}
      </main>
    </div>
  );
}

function ReleaseSanction({
  adminId,
  row,
  isRefreshing,
  onSettled,
}: {
  adminId: string;
  row: SanctionRecord;
  isRefreshing: boolean;
  onSettled: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useAdminMutationPlan(`${adminId}:release:${row.id}`, onSettled);
  const { hasPendingPlan, error } = mutation;
  const isApplying = mutation.isApplying || isRefreshing;
  const pendingReason = mutation.operations[0]?.body.reason;
  const currentReason =
    hasPendingPlan && typeof pendingReason === "string" ? pendingReason : reason;
  async function release() {
    if (!currentReason.trim()) return;
    const succeeded = await mutation.runPlan(
      hasPendingPlan
        ? undefined
        : [
            {
              action: "sanction",
              user_id: row.user_id,
              sanction: "release",
              reason_category: row.reason_category,
              reason: currentReason.trim(),
            },
          ],
    );
    if (succeeded) setIsOpen(false);
  }
  if (!isOpen && !hasPendingPlan)
    return (
      <AdminBtn variant="outline" size="s" disabled={isApplying} onClick={() => setIsOpen(true)}>
        해제
      </AdminBtn>
    );
  return (
    <form
      aria-label="제재 해제"
      onSubmit={(event) => {
        event.preventDefault();
        void release();
      }}
    >
      <p>{row.nickname ?? row.target_id}님의 제재를 해제합니다.</p>
      <input
        aria-label="해제 사유"
        maxLength={200}
        value={currentReason}
        disabled={isApplying || hasPendingPlan}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      <p className="live-error" role={error || hasPendingPlan ? "alert" : undefined}>
        {error ||
          (hasPendingPlan ? "이전 요청의 결과를 확인하려면 같은 요청을 재시도해 주세요." : "")}
      </p>
      <AdminBtn type="submit" disabled={!mutation.isReady || isApplying || !currentReason.trim()}>
        {isApplying ? "처리 중…" : error || hasPendingPlan ? "같은 요청 재시도" : "해제 확인"}
      </AdminBtn>
      <AdminBtn
        variant="outline"
        disabled={isApplying || hasPendingPlan}
        onClick={() => setIsOpen(false)}
      >
        취소
      </AdminBtn>
    </form>
  );
}
