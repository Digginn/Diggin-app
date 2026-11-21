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
  isLoading = false,
  onChange,
}: {
  page: number;
  total: number;
  isLoading?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <footer className="report-table__footer">
      <p>
        {total}건 · {page} / {Math.max(1, Math.ceil(total / 20))}페이지
      </p>
      <nav className="report-pagination" aria-label="목록 페이지">
        <button type="button" disabled={isLoading || page <= 1} onClick={() => onChange(page - 1)}>
          이전
        </button>
        <button
          type="button"
          disabled={isLoading || page * 20 >= total}
          onClick={() => onChange(page + 1)}
        >
          다음
        </button>
      </nav>
    </footer>
  );
}
