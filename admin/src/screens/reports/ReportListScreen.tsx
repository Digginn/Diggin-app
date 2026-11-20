import { useEffect, useId, useRef, useState } from "react";

import { AdminBrand } from "../../components/AdminBrand";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { REPORT_STATUS, REPORT_STATUSES, type ContentType } from "../../components/Badges";
import { FilterTab, type ReportFilter } from "../../components/FilterTab";
import { NavItem } from "../../components/NavItem";
import { ReportRow, type ReportRowData } from "../../components/ReportRow";
import { LogoutDialog } from "../auth/LogoutDialog";

const STATUS_DESCRIPTIONS = {
  received: "아직 확인하지 않은 신고",
  reviewing: "담당자가 확인하고 있는 신고",
  resolved: "조치를 마친 신고",
  rejected: "위반이 아닌 것으로 판단한 신고",
};

export function ReportListScreen({
  reports,
  email,
  initialProfileOpen = false,
  initialLogoutOpen = false,
  onLogout,
  onRefresh,
  onOpenReport,
}: {
  reports: ReportRowData[];
  email: string;
  initialProfileOpen?: boolean;
  initialLogoutOpen?: boolean;
  onLogout: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenReport: (id: string) => void;
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(initialProfileOpen);
  const [isLogoutOpen, setIsLogoutOpen] = useState(initialLogoutOpen);
  const [selected, setSelected] = useState<ReportFilter>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContentType>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const refreshLock = useRef(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isProfileOpen) return;
    function dismissOutside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target))
        setIsProfileOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsProfileOpen(false);
        profileButtonRef.current?.focus();
      }
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        menuItemRef.current?.focus();
      }
    }
    menuItemRef.current?.focus();
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isProfileOpen]);

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

  function closeLogout() {
    setIsLogoutOpen(false);
    profileButtonRef.current?.focus();
  }
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
    <div className="report-screen">
      <aside className="admin-sidebar" aria-label="관리자 내비게이션">
        <div className="admin-sidebar__brand">
          <AdminBrand />
        </div>
        <p className="admin-sidebar__group">커뮤니티 운영</p>
        <nav>
          <NavItem
            href="#/preview/reports"
            label="신고 관리"
            count={counts.received + counts.reviewing}
            isActive
          />
          <NavItem label="제재 이력" icon="shield" aria-disabled="true" />
          <NavItem label="회원 관리" icon="user" aria-disabled="true" />
        </nav>
        <div className="admin-profile" ref={profileRef}>
          <button
            ref={profileButtonRef}
            className="admin-profile__button"
            type="button"
            aria-label={`운영자 ${email} 프로필 메뉴`}
            aria-haspopup="menu"
            aria-expanded={isProfileOpen}
            aria-controls={menuId}
            onClick={() => setIsProfileOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIsProfileOpen(true);
              }
            }}
          >
            <span className="admin-profile__avatar">D</span>
            <span className="admin-profile__info">
              <span>운영자</span>
              <span>{email}</span>
            </span>
          </button>
          {isProfileOpen && (
            <div className="profile-menu" id={menuId} role="menu" aria-label="프로필 메뉴">
              <button
                ref={menuItemRef}
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsProfileOpen(false);
                  setIsLogoutOpen(true);
                }}
              >
                <AdminIcon name="logout" size={18} />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </aside>
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
              <FilterTab
                selected={selected}
                onChange={setSelected}
                counts={countReports(candidates)}
              />
              <div className="report-search-controls">
                <label className="report-search">
                  <AdminIcon asset="search-field" size={18} />
                  <span className="sr-only">신고 검색</span>
                  <input
                    type="search"
                    placeholder="콘텐츠 ID, 내용, 작성자 검색"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="report-type-select">
                  <span className="sr-only">콘텐츠 유형</span>
                  <select
                    aria-label="콘텐츠 유형"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as "all" | ContentType)}
                  >
                    <option value="all">전체 유형</option>
                    <option value="post">게시글</option>
                    <option value="comment">댓글</option>
                  </select>
                  <AdminIcon asset="select-chevron" size={16} />
                </label>
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
      <LogoutDialog isOpen={isLogoutOpen} onCancel={closeLogout} onLogout={onLogout} />
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
