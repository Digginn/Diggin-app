import { useRef, useState } from "react";

import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { AdminSidebar } from "../../components/AdminSidebar";
import { REPORT_STATUS, REPORT_STATUSES } from "../../components/Badges";
import { FilterTab, type ReportFilter } from "../../components/FilterTab";
import { ReportRow, type ReportRowData } from "../../components/ReportRow";

import { ContentTypeSelect, type ContentTypeFilter } from "./components/ContentTypeSelect";

const STATUS_DESCRIPTIONS = {
  received: "아직 확인하지 않은 신고",
  reviewing: "담당자가 확인하고 있는 신고",
  resolved: "조치를 마친 신고",
  rejected: "위반이 아닌 것으로 판단한 신고",
};

export function ReportListScreen({
  reports,
  email,
  className = "",
  initialProfileOpen = false,
  initialLogoutOpen = false,
  initialSelected = "all",
  initialTypeFilter = "all",
  initialQuery = "",
  initialTypeOpen = false,
  onLogout,
  onRefresh,
  onOpenReport,
}: {
  reports: ReportRowData[];
  email: string;
  className?: string;
  initialProfileOpen?: boolean;
  initialLogoutOpen?: boolean;
  initialSelected?: ReportFilter;
  initialTypeFilter?: ContentTypeFilter;
  initialQuery?: string;
  initialTypeOpen?: boolean;
  onLogout: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenReport: (id: string) => void;
}) {
  const [selected, setSelected] = useState<ReportFilter>(initialSelected);
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>(initialTypeFilter);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const refreshLock = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = countReports(reports);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const candidates = reports.filter(
    (report) =>
      (typeFilter === "all" || report.type === typeFilter) &&
      (!normalizedQuery ||
        `${report.title} ${report.excerpt} ${report.author} ${report.authorId}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)),
  );
  const filtered = candidates.filter((report) => selected === "all" || report.status === selected);

  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setIsRefreshing(true);
    setRefreshError("");
    try {
      await onRefresh();
    } catch {
      setRefreshError("신고 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      refreshLock.current = false;
      setIsRefreshing(false);
    }
  }

  return (
    <div className={`report-screen ${className}`}>
      <AdminSidebar
        email={email}
        count={counts.received + counts.reviewing}
        initialProfileOpen={initialProfileOpen}
        initialLogoutOpen={initialLogoutOpen}
        onLogout={onLogout}
      />
      <main className="report-main">
        <header className="report-page-header">
          <div>
            <p className="report-breadcrumb">커뮤니티 운영 / 신고 관리</p>
            <h1>신고 목록</h1>
            <p className="report-page-description">
              신고된 게시글·댓글을 콘텐츠별로 모아 확인하고 처리합니다.
            </p>
          </div>
          <AdminBtn variant="outline" icon="refresh" disabled={isRefreshing} onClick={refresh}>
            {isRefreshing ? "새로고침 중…" : "새로고침"}
          </AdminBtn>
        </header>
        <section className="report-summary" aria-label="신고 현황">
          {REPORT_STATUSES.map((status) => (
            <div className="report-stat" key={status}>
              <div className="report-stat__label">
                <AdminIcon asset={`summary-${status}`} size={8} />
                <span>{REPORT_STATUS[status]}</span>
              </div>
              <p className="report-stat__value">
                <strong>{counts[status]}</strong>
                <span>건</span>
              </p>
              <p className="report-stat__description">{STATUS_DESCRIPTIONS[status]}</p>
            </div>
          ))}
        </section>
        {refreshError && (
          <p className="login-error" role="alert">
            {refreshError}
          </p>
        )}
        <div className="report-table-scroll" role="region" aria-label="신고 목록 표" tabIndex={0}>
          <section className="report-table">
            <div className="report-toolbar">
              <FilterTab selected={selected} onChange={setSelected} counts={counts} />
              <div className="report-search-controls">
                <div className={`report-search ${query ? "report-search--filled" : ""}`}>
                  {query ? (
                    <AdminIcon name="search" size={18} />
                  ) : (
                    <AdminIcon asset="search-field" size={18} />
                  )}
                  <input
                    ref={searchRef}
                    aria-label="신고 검색"
                    type="search"
                    placeholder="콘텐츠 ID, 내용, 작성자 검색"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      className="report-search__clear"
                      type="button"
                      aria-label="검색어 지우기"
                      onClick={() => {
                        setQuery("");
                        searchRef.current?.focus();
                      }}
                    >
                      <AdminIcon asset="search-clear" size={12} />
                    </button>
                  )}
                </div>
                <ContentTypeSelect
                  value={typeFilter}
                  onChange={setTypeFilter}
                  initialOpen={initialTypeOpen}
                />
              </div>
            </div>
            <div className="report-table__head" aria-hidden="true">
              <span>콘텐츠</span>
              <span>작성자</span>
              <span>신고 수</span>
              <span>신고 사유</span>
              <span>최근 신고</span>
              <span>상태</span>
              <span />
            </div>
            <div className="report-table__body">
              {filtered.map((report) => (
                <ReportRow
                  key={`${report.type}-${report.id}`}
                  report={report}
                  onOpen={onOpenReport}
                />
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="report-table__empty" role="status">
                조건에 맞는 신고가 없습니다.
              </p>
            )}
            <footer className="report-table__footer">
              <p aria-live="polite">{filtered.length}건 표시 중</p>
              <nav className="report-pagination" aria-label="신고 목록 페이지">
                <button type="button" aria-label="이전 페이지" disabled>
                  <AdminIcon asset="pagination-left" size={16} />
                </button>
                <button type="button" aria-label="1페이지" aria-current="page">
                  1
                </button>
                <button type="button" aria-label="다음 페이지" disabled>
                  <AdminIcon asset="pagination-right" size={16} />
                </button>
              </nav>
            </footer>
          </section>
        </div>
      </main>
    </div>
  );
}

function countReports(reports: ReportRowData[]): Record<ReportFilter, number> {
  return reports.reduce(
    (counts, report) => {
      counts[report.status] += 1;
      return counts;
    },
    { all: reports.length, received: 0, reviewing: 0, resolved: 0, rejected: 0 },
  );
}
