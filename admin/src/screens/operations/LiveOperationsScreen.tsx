import { useRef, useState } from "react";

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
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { AdminApiError, errorMessage, adminRequest } from "../../lib/supabase";

import "./operations.css";

export function LiveOperationsScreen({
  view,
  email,
  onLogout,
}: {
  view: "members" | "sanctions";
  email: string;
  onLogout: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const result = useAdminQuery<PageResult<Member | SanctionRecord>>(view, { query, page });
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
                            <ReleaseSanction row={row} onApplied={result.refresh} />
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

function ReleaseSanction({ row, onApplied }: { row: SanctionRecord; onApplied: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [isUncertain, setIsUncertain] = useState(false);
  const lock = useRef(false);
  async function release() {
    if (lock.current || !reason.trim()) return;
    lock.current = true;
    setIsApplying(true);
    setError("");
    try {
      await adminRequest({
        action: "sanction",
        user_id: row.user_id,
        sanction: "release",
        request_id: requestId,
        reason_category: row.reason_category,
        reason: reason.trim(),
      });
      // 성공 응답 뒤 실제 제재 목록을 다시 조회한다.
      onApplied();
      setIsOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
      setIsUncertain(
        !(
          failure instanceof AdminApiError &&
          failure.status >= 400 &&
          failure.status < 500 &&
          !failure.code.includes("pending")
        ),
      );
      if (
        failure instanceof Error &&
        ["auth_moderation_failed", "request_failed_use_new_id"].includes(failure.message)
      )
        setRequestId(crypto.randomUUID());
    } finally {
      lock.current = false;
      setIsApplying(false);
    }
  }
  if (!isOpen)
    return (
      <AdminBtn variant="outline" size="s" onClick={() => setIsOpen(true)}>
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
        value={reason}
        disabled={isApplying || isUncertain}
        onChange={(event) => {
          setReason(event.target.value);
          setError("");
          setRequestId(crypto.randomUUID());
        }}
      />
      <p className="live-error" role={error ? "alert" : undefined}>
        {error}
      </p>
      <AdminBtn type="submit" disabled={isApplying || !reason.trim()}>
        {isApplying ? "처리 중…" : error ? "같은 요청 재시도" : "해제 확인"}
      </AdminBtn>
      <AdminBtn
        variant="outline"
        disabled={isApplying || isUncertain}
        onClick={() => setIsOpen(false)}
      >
        취소
      </AdminBtn>
    </form>
  );
}
