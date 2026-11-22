import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  ACCOUNT_STATUS,
  REASONS,
  formatDate,
  type Member,
  type PageResult,
  type SanctionRecord,
} from "../../api/moderation";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { AdminSidebar } from "../../components/AdminSidebar";
import { AdminToast } from "../../components/AdminToast";
import { Pagination, QueryState } from "../../components/QueryState";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { adminRequest } from "../../lib/supabase";

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
  const result = useAdminQuery<PageResult<Member | SanctionRecord>>(
    view,
    { query, page },
    { keepDataOnRefresh: true },
  );
  const [holdTarget, setHoldTarget] = useState<SanctionRecord | null>(null);
  // 처리한 행은 다시 불러온 목록이 도착할 때까지 처리 중으로 둔다.
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [toast, setToast] = useState({
    id: 0,
    message: "",
    variant: "success" as "success" | "error",
    isVisible: false,
  });
  const dismissToast = useCallback(
    () => setToast((current) => ({ ...current, isVisible: false })),
    [],
  );
  const [wasLoading, setWasLoading] = useState(result.isLoading);
  if (wasLoading !== result.isLoading) {
    setWasLoading(result.isLoading);
    if (!result.isLoading) setPendingIds([]);
  }
  const isMembers = view === "members";
  const title = isMembers ? "회원 관리" : "제재 이력";
  const headers = isMembers
    ? ["회원", "가입일", "게시글·댓글", "받은 신고", "누적 제재", "계정 상태", "최근 접속"]
    : ["작성자", "제재", "사유 분류", "기간", "상태", "보관", "관리", "처리"];

  async function setHold(row: SanctionRecord) {
    const held = !row.is_held;
    setHoldTarget(null);
    setPendingIds((ids) => [...ids, row.id]);
    try {
      await adminRequest({
        action: "retention_hold",
        target_type: "sanction",
        target_id: row.id,
        held,
      });
      showToast(held ? "보관 유지를 설정했습니다." : "보관 유지를 해제했습니다.", "success");
      result.refresh();
    } catch {
      setPendingIds((ids) => ids.filter((id) => id !== row.id));
      showToast("보관 유지를 처리하지 못했습니다.", "error");
    }
  }

  function showToast(message: string, variant: "success" | "error") {
    setToast((current) => ({ id: current.id + 1, message, variant, isVisible: true }));
  }

  return (
    <div className="report-screen operations-screen">
      <AdminSidebar email={email} activePage={view} reportsHref="#/reports" onLogout={onLogout} />
      <main className="report-main">
        <header className={`report-page-header ${isMembers ? "" : "operations-header--plain"}`}>
          <div>
            {isMembers && <p className="report-breadcrumb">커뮤니티 운영 / {title}</p>}
            <h1>{title}</h1>
            {!isMembers && (
              <p className="report-page-description">
                작성자에게 적용된 제재와 해제 내역을 모아 봅니다.
              </p>
            )}
          </div>
          {isMembers ? (
            <AdminBtn
              variant="outline"
              icon="refresh"
              disabled={result.isLoading}
              onClick={result.refresh}
            >
              새로고침
            </AdminBtn>
          ) : (
            <AdminBtn variant="outline" disabled={result.isLoading} onClick={result.refresh}>
              <AdminIcon asset="sanction-refresh-m" size={20} />
              새로고침
            </AdminBtn>
          )}
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
                      <SanctionRow
                        key={row.id}
                        row={row}
                        isPending={pendingIds.includes(row.id)}
                        onHold={() => setHoldTarget(row)}
                      />
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
      <HoldConfirmDialog
        target={holdTarget}
        onCancel={() => setHoldTarget(null)}
        onConfirm={(row) => void setHold(row)}
      />
      <div className="admin-toast-position">
        <AdminToast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          isVisible={toast.isVisible}
          onDismiss={dismissToast}
        />
      </div>
    </div>
  );
}

const SANCTION_STATE = {
  active: { label: "진행 중", tone: "danger" },
  record: { label: "기록", tone: "record" },
  released: { label: "해제됨", tone: "neutral" },
  expired: { label: "종료", tone: "neutral" },
} as const;

function dateParts(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  const short = `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
  return { full: `${parts.year}.${short}`, short };
}

function sanctionLabel(row: SanctionRecord) {
  if (row.kind !== "community_restricted" || !row.restricted_until) return ACCOUNT_STATUS[row.kind];
  const days = Math.round(
    (new Date(row.restricted_until).getTime() - new Date(row.created_at).getTime()) / 86_400_000,
  );
  return `${ACCOUNT_STATUS[row.kind]} ${days}일`;
}

function sanctionPeriod(row: SanctionRecord) {
  if (row.kind === "warning") return "-";
  const start = dateParts(row.created_at).full;
  return row.restricted_until
    ? `${start} ~ ${dateParts(row.restricted_until).short}`
    : `${start} ~ 해제 전까지`;
}

function SanctionRow({
  row,
  isPending,
  onHold,
}: {
  row: SanctionRecord;
  isPending: boolean;
  onHold: () => void;
}) {
  const state = SANCTION_STATE[row.state];
  return (
    <tr>
      <td className="operations-author">
        <strong>{row.nickname ?? "탈퇴한 회원"}</strong>
        <small title={row.user_id ?? row.target_id}>
          {(row.user_id ?? row.target_id).replace(/^(.{4}).*(.{5})$/, "$1…$2")}
        </small>
      </td>
      <td>{sanctionLabel(row)}</td>
      <td>{REASONS[row.reason_category]}</td>
      <td>{sanctionPeriod(row)}</td>
      <td>
        <span className={`operations-chip operations-chip--${state.tone}`}>{state.label}</span>
      </td>
      <td>
        <span className={`operations-chip operations-chip--${row.is_held ? "held" : "neutral"}`}>
          {row.is_held ? "보관 유지" : "삭제 예정"}
        </span>
      </td>
      <td>
        {isPending ? (
          <AdminBtn variant="disabled" size="s" aria-busy="true">
            <AdminIcon asset="sanction-refresh-s" size={16} />
            처리 중
          </AdminBtn>
        ) : (
          <AdminBtn variant="outline" size="s" onClick={onHold}>
            {row.is_held ? "유지 해제하기" : "보관 유지하기"}
          </AdminBtn>
        )}
      </td>
      <td>
        운영자 {row.handled_by.split("@")[0]}
        <br />
        {row.released_at
          ? `${dateParts(row.released_at).short} 해제`
          : dateParts(row.created_at).short}
      </td>
    </tr>
  );
}

function HoldConfirmDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: SanctionRecord | null;
  onCancel: () => void;
  onConfirm: (row: SanctionRecord) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // 닫히는 동안에도 문구가 바뀌지 않게 마지막 대상을 유지한다.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (target && dialog && !dialog.open) dialog.showModal();
    if (!target && dialog?.open) dialog.close();
  }, [target]);

  const isRelease = Boolean(shown?.is_held);
  return (
    <dialog
      ref={dialogRef}
      className="logout-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="logout-dialog__head">
        <span className="logout-dialog__icon">
          <AdminIcon asset="dialog-shield" size={22} />
        </span>
        <h2 id={titleId}>
          {isRelease ? "보관 유지를 해제하시겠습니까?" : "이 제재 기록을 보관 유지하시겠습니까?"}
        </h2>
        <p id={descriptionId}>
          {isRelease
            ? "보관 기간이 만료되면 기록이 자동으로 삭제됩니다."
            : "보관 기간이 만료되어도 기록이 자동으로 삭제되지 않습니다."}
        </p>
      </div>
      <div className="logout-dialog__actions">
        <AdminBtn variant="secondary" autoFocus onClick={onCancel}>
          취소할게요
        </AdminBtn>
        <AdminBtn
          variant={isRelease ? "danger" : "primary"}
          onClick={() => target && onConfirm(target)}
        >
          {isRelease ? "해제할게요" : "보관을 유지할게요"}
        </AdminBtn>
      </div>
    </dialog>
  );
}
