import { errorMessage } from "../lib/supabase";

import { AdminBtn } from "./AdminBtn";

export function QueryState({
  isLoading,
  error,
  onRetry,
}: {
  isLoading: boolean;
  error?: unknown;
  onRetry: () => void;
}) {
  if (isLoading)
    return (
      <p className="report-table__empty" role="status">
        불러오는 중…
      </p>
    );
  if (error)
    return (
      <div className="report-table__empty" role="alert">
        <p>{errorMessage(error)}</p>
        <AdminBtn variant="outline" onClick={onRetry}>
          다시 시도
        </AdminBtn>
      </div>
    );
  return null;
}

export function Pagination({
  page,
  total,
  pageSize = 20,
  isLoading = false,
  onChange,
}: {
  page: number;
  total: number;
  /** 서버 조회가 한 페이지에 돌려주는 개수와 같아야 한다. */
  pageSize?: number;
  isLoading?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <footer className="report-table__footer">
      <p>
        {total}건 · {page} / {Math.max(1, Math.ceil(total / pageSize))}페이지
      </p>
      <nav className="report-pagination" aria-label="목록 페이지">
        <button type="button" disabled={isLoading || page <= 1} onClick={() => onChange(page - 1)}>
          이전
        </button>
        <button
          type="button"
          disabled={isLoading || page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          다음
        </button>
      </nav>
    </footer>
  );
}
