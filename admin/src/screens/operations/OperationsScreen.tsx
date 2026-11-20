import { useCallback, useState } from "react";

import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { AdminSidebar } from "../../components/AdminSidebar";
import { AdminToast } from "../../components/AdminToast";
import { MEMBER_ROWS, SANCTION_ROWS } from "../../preview-data/operations";

import "./operations.css";

export function OperationsScreen({
  view,
  email,
  isPreview = false,
  onLogout,
}: {
  view: "sanctions" | "members";
  email: string;
  isPreview?: boolean;
  onLogout: () => Promise<void>;
}) {
  const [toast, setToast] = useState({ id: 0, isVisible: false });
  const dismissToast = useCallback(() => setToast((t) => ({ ...t, isVisible: false })), []);
  const isSanctions = view === "sanctions";
  const title = isSanctions ? "제재 이력" : "회원 관리";
  const headers = isSanctions
    ? ["작성자", "제재", "사유 분류", "기간", "상태", "처리"]
    : ["회원", "가입일", "게시글·댓글", "받은 신고", "누적 제재", "계정 상태", "최근 접속"];

  return (
    <div className="report-screen report-screen--after-action operations-screen">
      <AdminSidebar
        email={email}
        count={5}
        activePage={view}
        reportsHref={isPreview ? "#/preview/reports" : "#/designs/reports"}
        onLogout={onLogout}
      />
      <main className="report-main">
        <header className="report-page-header">
          <div>
            <p className="report-breadcrumb">커뮤니티 운영 / {title}</p>
            <h1>{title}</h1>
            <p className="report-page-description">
              {isSanctions
                ? "작성자에게 적용된 제재와 해제 내역을 모아 봅니다."
                : "커뮤니티 활동 회원의 계정 상태와 신고 현황을 확인합니다."}
            </p>
          </div>
          <AdminBtn
            variant="outline"
            onClick={() => setToast((t) => ({ id: t.id + 1, isVisible: true }))}
          >
            <AdminIcon asset="operations-button-refresh-m" size={20} />
            새로고침
          </AdminBtn>
        </header>
        <div
          className="operations-table-scroll"
          role="region"
          aria-label={`${title} 표`}
          tabIndex={0}
        >
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
              {isSanctions
                ? SANCTION_ROWS.map(
                    ([name, id, sanction, reason, period, status, action], index) => (
                      <tr key={`${id}-${index}`}>
                        <td className="operations-author">
                          <strong>{name}</strong>
                          <small>{id}</small>
                        </td>
                        <td>{sanction}</td>
                        <td>{reason}</td>
                        <td>{period}</td>
                        <td>
                          <span
                            className={`operations-chip operations-chip--${status === "진행 중" ? "danger" : status === "기록" ? "record" : "neutral"}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>{action}</td>
                      </tr>
                    ),
                  )
                : MEMBER_ROWS.map(
                    ([name, id, joined, posts, reports, sanctions, status, lastSeen]) => (
                      <tr key={id}>
                        <td className="operations-author">
                          <strong>{name}</strong>
                          <small>{id}</small>
                        </td>
                        <td>{joined}</td>
                        <td>{posts}</td>
                        <td>{reports}</td>
                        <td>{sanctions}</td>
                        <td>
                          <span
                            className={`operations-chip operations-chip--${status === "정상 이용" ? "normal" : "danger"}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>{lastSeen}</td>
                      </tr>
                    ),
                  )}
            </tbody>
          </table>
        </div>
      </main>
      <div className="admin-toast-position">
        <AdminToast
          key={toast.id}
          message="목록을 새로고침했어요."
          variant="refresh"
          isVisible={toast.isVisible}
          onDismiss={dismissToast}
        />
      </div>
    </div>
  );
}
