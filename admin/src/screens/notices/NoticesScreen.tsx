import { useCallback, useEffect, useId, useRef, useState } from "react";

import { formatDate, type PageResult } from "../../api/moderation";
import {
  EMPTY_NOTICE,
  isNoticeDraft,
  noticeValidation,
  noticeRequest,
  type Notice,
  type NoticeDraft,
} from "../../api/notices";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { AdminSidebar } from "../../components/AdminSidebar";
import { AdminToast } from "../../components/AdminToast";
import { Pagination, QueryState } from "../../components/QueryState";
import { useAdminMutationPlan } from "../../hooks/useAdminMutationPlan";
import { errorMessage } from "../../lib/supabase";

import { NoticePreview } from "./NoticePreview";
import "./notices.css";

// 조회는 route/page에 묶고, 화면을 떠난 요청의 응답은 무시한다.
function useNoticeQuery<T>(operation: "list" | "get", id: string | undefined, page = 1) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify({ operation, id, page, revision });
  const isEnabled = operation !== "get" || Boolean(id);
  const [result, setResult] = useState<{ key?: string; data?: T; error?: unknown }>({});
  useEffect(() => {
    if (!isEnabled) return;
    let isCurrent = true;
    noticeRequest<T>(operation, { page }, id).then(
      (data) => {
        if (isCurrent) setResult({ key, data });
      },
      (error) => {
        if (isCurrent) setResult({ key, error });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [operation, id, page, key, isEnabled]);
  const current = result.key === key ? result : {};
  return {
    ...current,
    isLoading: isEnabled && result.key !== key,
    refresh: useCallback(() => setRevision((value) => value + 1), []),
  };
}

export function NoticesScreen({
  route,
  email,
  adminId,
  onLogout,
}: {
  route: string;
  email: string;
  adminId: string;
  onLogout: () => Promise<void>;
}) {
  const [toast, setToast] = useState({ id: 0, message: "", isVisible: false, isRefresh: false });
  const dismiss = useCallback(() => setToast((current) => ({ ...current, isVisible: false })), []);
  const notify = (message: string, isRefresh = false) =>
    setToast((current) => ({ id: current.id + 1, message, isVisible: true, isRefresh }));
  const id = /^\/notices\/([1-9][0-9]*)\/edit$/.exec(route)?.[1];
  return (
    <div className="report-screen notice-screen">
      <AdminSidebar
        email={email}
        activePage="notices"
        reportsHref="#/reports"
        onLogout={onLogout}
      />
      {route === "/notices" ? (
        <NoticeList notify={notify} />
      ) : (
        <NoticeEditor
          key={id ?? "new"}
          id={id}
          adminId={adminId}
          onSaved={() => {
            notify(id ? "공지를 수정했습니다." : "공지를 등록했습니다.");
            window.location.hash = "/notices";
          }}
        />
      )}
      <div className="admin-toast-position">
        <AdminToast
          key={toast.id}
          message={toast.message}
          isVisible={toast.isVisible}
          onDismiss={dismiss}
          variant={toast.isRefresh ? "refresh" : "success"}
        />
      </div>
    </div>
  );
}

function NoticeList({ notify }: { notify: (message: string, isRefresh?: boolean) => void }) {
  const [page, setPage] = useState(1);
  const query = useNoticeQuery<PageResult<Notice>>("list", undefined, page);
  // 삭제나 다른 관리자의 변경으로 페이지 수가 줄면 마지막 유효 페이지를 다시 조회한다.
  const lastPage = query.data ? Math.max(1, Math.ceil(query.data.total / 20)) : page;
  if (page > lastPage) setPage(lastPage);
  const [target, setTarget] = useState<Notice | null>(null);
  const [isBusy, setBusy] = useState(false);
  const busy = useRef(false);
  const plan = useRef<{ signature: string; id: string } | null>(null);
  const [error, setError] = useState("");
  async function mutate(notice: Notice, operation: "visibility" | "delete") {
    if (busy.current) return;
    busy.current = true;
    setBusy(true);
    setError("");
    const payload = {
      revision: notice.revision,
      ...(operation === "visibility" ? { is_visible: !notice.is_visible } : {}),
    };
    const signature = JSON.stringify({ operation, id: notice.id, payload });
    if (plan.current?.signature !== signature)
      plan.current = { signature, id: crypto.randomUUID() };
    try {
      await noticeRequest(operation, payload, notice.id, plan.current.id);
      plan.current = null;
      setTarget(null);
      notify(
        operation === "delete"
          ? "공지를 삭제했습니다."
          : notice.is_visible
            ? "공지를 숨겼습니다."
            : "공지를 공개했습니다.",
      );
      query.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      busy.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="report-main">
      <header className="report-page-header notice-list-header">
        <div>
          <h1>공지 관리</h1>
          <p className="notice-description">업로드한 공지를 확인하고 수정하거나 숨깁니다.</p>
        </div>
        <AdminBtn
          variant="outline"
          icon="refresh"
          disabled={query.isLoading || isBusy}
          onClick={() => {
            query.refresh();
            notify("목록을 새로고침했습니다.", true);
          }}
        >
          새로고침
        </AdminBtn>
        <AdminBtn
          onClick={() => {
            window.location.hash = "/notices/new";
          }}
        >
          공지 작성
        </AdminBtn>
      </header>
      {error && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}
      <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refresh} />
      {query.data && (
        <>
          <div className="notice-table-scroll">
            <table className="notice-table" aria-label="공지 목록">
              <thead>
                <tr>
                  {["제목", "공개 상태", "등록일", "관리"].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.total === 0 && (
                  <tr>
                    <td colSpan={4}>등록된 공지가 없습니다.</td>
                  </tr>
                )}
                {query.data.rows.map((notice) => (
                  <tr key={notice.id}>
                    <td>
                      <strong>{notice.title}</strong>
                      <small>공지 #{notice.id}</small>
                    </td>
                    <td>
                      <span
                        className={`notice-visibility ${notice.is_visible ? "notice-visibility--public" : ""}`}
                      >
                        {notice.is_visible ? "공개 중" : "숨김"}
                      </span>
                    </td>
                    <td>
                      {formatDate(notice.created_at)
                        .replace(/\. /g, ".")
                        .replace(/\.(\d{2}:\d{2})$/, " $1")}
                    </td>
                    <td>
                      <div className="notice-row-actions">
                        <AdminBtn
                          size="s"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => {
                            window.location.hash = `/notices/${notice.id}/edit`;
                          }}
                        >
                          수정
                        </AdminBtn>
                        <AdminBtn
                          size="s"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => void mutate(notice, "visibility")}
                        >
                          {notice.is_visible ? "숨기기" : "공개하기"}
                        </AdminBtn>
                        <button
                          className="notice-trash"
                          aria-label={`${notice.title} 삭제`}
                          disabled={isBusy}
                          onClick={() => {
                            setError("");
                            setTarget(notice);
                          }}
                        >
                          <img
                            src={new URL("../../assets/notice-trash.svg", import.meta.url).href}
                            alt=""
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data.total > 20 && (
            <Pagination
              page={page}
              total={query.data.total}
              isLoading={query.isLoading || isBusy}
              onChange={setPage}
            />
          )}
        </>
      )}
      <DeleteNoticeDialog
        isOpen={target !== null}
        isBusy={isBusy}
        error={error}
        onCancel={() => {
          if (!isBusy) setTarget(null);
        }}
        onConfirm={() => {
          if (target) void mutate(target, "delete");
        }}
      />
    </main>
  );
}

function NoticeEditor({
  id,
  adminId,
  onSaved,
}: {
  id?: string;
  adminId: string;
  onSaved: () => void;
}) {
  const query = useNoticeQuery<Notice>("get", id);
  const [changes, setChanges] = useState<NoticeDraft | null>(null);
  const mutation = useAdminMutationPlan(`${adminId}:notice:${id ?? "new"}`, () => {});
  const isBusy = mutation.isApplying;
  const isLocked = isBusy || mutation.hasPendingPlan;
  const error = mutation.error;
  const lifetime = useRef({ isCurrent: true });
  useEffect(() => {
    const current = { isCurrent: true };
    lifetime.current = current;
    return () => {
      current.isCurrent = false;
    };
  }, []);
  const pendingPayload = mutation.operations[0]?.body.payload;
  const initial: NoticeDraft = isNoticeDraft(pendingPayload)
    ? pendingPayload
    : (query.data ?? EMPTY_NOTICE);
  const draft = changes ?? initial;
  const validation = noticeValidation(draft);
  const canSubmit = mutation.isReady && (mutation.hasPendingPlan || validation === "");
  const setField = <K extends keyof NoticeDraft>(key: K, value: NoticeDraft[K]) => {
    setChanges((current) => ({ ...(current ?? draft), [key]: value }));
  };
  async function save() {
    if (!canSubmit || isBusy) return;
    const current = lifetime.current;
    const payload = { ...draft, ...(id ? { revision: query.data?.revision } : {}) };
    const succeeded = await mutation.runPlan(
      mutation.hasPendingPlan
        ? undefined
        : [{ action: "notice", operation: id ? "update" : "create", notice_id: id, payload }],
    );
    if (succeeded && current.isCurrent) onSaved();
  }
  return (
    <main className="report-main notice-editor">
      <a className="notice-back" href="#/notices">
        <AdminIcon asset="detail-back" size={16} />
        공지 관리
      </a>
      <header>
        <h1>{id ? "공지 수정" : "공지 작성"}</h1>
        <p className="notice-description">제목과 본문을 작성해 {id ? "수정" : "등록"}합니다.</p>
      </header>
      {id && (query.isLoading || query.error) ? (
        <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refresh} />
      ) : (
        <div className="notice-editor-columns">
          <form
            className="notice-editor-card"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={isLocked}>
              <label>
                제목 <span>*</span>
                <input
                  required
                  value={draft.title}
                  placeholder="제목을 입력해 주세요."
                  onChange={(event) => setField("title", event.target.value)}
                />
              </label>
              <label>
                게시글 본문 <span>*</span>
                <textarea
                  required
                  className="notice-body-input"
                  value={draft.body}
                  placeholder="게시글 본문을 입력해 주세요."
                  onChange={(event) => setField("body", event.target.value)}
                />
              </label>
              <label>
                알림함 본문
                <textarea
                  value={draft.inbox_body}
                  placeholder="알림함에 표시할 내용을 입력해 주세요."
                  onChange={(event) => setField("inbox_body", event.target.value)}
                />
                <small>비워 두면 본문 앞부분이 2줄까지 표시되고, 넘치면 …로 표시됩니다.</small>
              </label>
              <div className="notice-exposure">
                <strong>노출 설정</strong>
                {(
                  [
                    [
                      "inbox_only",
                      "알림함에만 전송",
                      "알림함에만 노출되며 DIGGLE 상단 공지에서는 제외됩니다.",
                    ],
                    [
                      "comments_closed",
                      "댓글 닫기",
                      "기존 댓글과 입력창을 숨기고 새 댓글 작성·수정을 막습니다.",
                    ],
                  ] as const
                ).map(([key, label, help]) => (
                  <div key={key}>
                    <label className="notice-checkbox">
                      <input
                        type="checkbox"
                        checked={draft[key]}
                        onChange={(event) => setField(key, event.target.checked)}
                      />
                      <AdminIcon asset="notice-check" size={18} />
                      {label}
                    </label>
                    <span className="notice-tooltip" tabIndex={0} aria-label={help}>
                      <AdminIcon asset="notice-help" size={16} />
                      <span role="tooltip">{help}</span>
                    </span>
                  </div>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="notice-error">
                {error}
              </p>
            )}
            {draft.title && draft.body && validation && (
              <p role="alert" className="notice-error">
                {validation}
              </p>
            )}
            {mutation.hasPendingPlan && (
              <p role="status">
                직전 요청의 결과를 확인해 주세요. 입력값을 유지하고 같은 요청으로 재시도합니다.
              </p>
            )}
            <div className="notice-editor-actions">
              <AdminBtn
                variant="outline"
                disabled={isBusy}
                onClick={() => {
                  window.location.hash = "/notices";
                }}
              >
                취소
              </AdminBtn>
              <AdminBtn type="submit" disabled={!canSubmit || isBusy}>
                {isBusy
                  ? "처리 중…"
                  : mutation.hasPendingPlan
                    ? "처리 결과 확인"
                    : id
                      ? "수정"
                      : "등록"}
              </AdminBtn>
            </div>
          </form>
          <NoticePreview draft={draft} />
        </div>
      )}
    </main>
  );
}

function DeleteNoticeDialog({
  isOpen,
  isBusy,
  error,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  isBusy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (isOpen && !ref.current?.open) ref.current?.showModal();
    if (!isOpen && ref.current?.open) ref.current.close();
  }, [isOpen]);
  return (
    <dialog
      className="logout-dialog"
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="logout-dialog__head">
        <span className="logout-dialog__icon">
          <img src={new URL("../../assets/notice-trash-dialog.svg", import.meta.url).href} alt="" />
        </span>
        <h2 id={titleId}>공지를 삭제하시겠습니까?</h2>
        <p>삭제한 공지는 앱에서 바로 사라지며 복구할 수 없습니다.</p>
      </div>
      {error && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}
      <div className="logout-dialog__actions">
        <AdminBtn autoFocus variant="secondary" disabled={isBusy} onClick={onCancel}>
          취소할게요
        </AdminBtn>
        <AdminBtn variant="danger" disabled={isBusy} onClick={onConfirm}>
          {isBusy ? "처리 중…" : "삭제할게요"}
        </AdminBtn>
      </div>
    </dialog>
  );
}
