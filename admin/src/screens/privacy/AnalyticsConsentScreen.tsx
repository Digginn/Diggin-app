import { useCallback, useEffect, useId, useRef, useState } from "react";

import { withdrawAnalyticsConsent, type AnalyticsConsentItems } from "../../api/moderation";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";
import { AdminSidebar } from "../../components/AdminSidebar";
import { AdminToast } from "../../components/AdminToast";
import { CheckOption } from "../../components/CheckOption";
import { AdminApiError, errorMessage } from "../../lib/supabase";

import "./analytics-consent.css";

const NO_ITEMS: AnalyticsConsentItems = { usage_analysis: false, overseas_transfer: false };
const TEMPORARY_ERROR = "일시적인 오류로 처리하지 못했습니다. 다시 시도해 주세요.";

export function AnalyticsConsentScreen({
  email: adminEmail,
  onLogout,
}: {
  email: string;
  onLogout: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [items, setItems] = useState(NO_ITEMS);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
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
  const canSubmit = Boolean(email.trim()) && (items.usage_analysis || items.overseas_transfer);

  function showToast(message: string, variant: "success" | "error") {
    setToast((current) => ({ id: current.id + 1, message, variant, isVisible: true }));
  }

  async function withdraw() {
    setIsConfirmOpen(false);
    setIsSubmitting(true);
    setError("");
    try {
      await withdrawAnalyticsConsent(email.trim(), items);
      setEmail("");
      setItems(NO_ITEMS);
      showToast("동의 철회 완료 · 분석 데이터 삭제 요청이 접수되었습니다.", "success");
    } catch (failure) {
      // 입력값 문제·없는 회원은 사유를, 그 밖의 실패는 시안의 일시 오류 안내를 보여 준다.
      setError(
        failure instanceof AdminApiError && failure.status >= 400 && failure.status < 500
          ? errorMessage(failure)
          : TEMPORARY_ERROR,
      );
      showToast("분석 동의 철회를 처리하지 못했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="report-screen">
      <AdminSidebar
        email={adminEmail}
        activePage="analytics-consent"
        reportsHref="#/reports"
        onLogout={onLogout}
      />
      <main className="report-main">
        <header className="report-page-header analytics-consent-header">
          <div>
            <h1>서비스 이용 기록 분석 동의 철회</h1>
            <p className="report-page-description">
              개인정보 처리방침에 따라 회원이 요청한 동의 항목의 철회를 처리합니다.
              {error && (
                <>
                  <br />
                  직전 요청은 처리 중 오류로 완료되지 않았습니다.
                </>
              )}
            </p>
          </div>
        </header>
        <form
          className="analytics-consent-card"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !isSubmitting) setIsConfirmOpen(true);
          }}
        >
          <label className="analytics-consent-label" htmlFor="analytics-consent-email">
            회원 이메일
          </label>
          <input
            id="analytics-consent-email"
            className={`analytics-consent-input ${error ? "analytics-consent-input--error" : ""}`}
            type="email"
            autoComplete="off"
            maxLength={320}
            placeholder="철회를 요청한 회원의 가입 이메일을 입력해 주세요."
            value={email}
            disabled={isSubmitting}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "analytics-consent-error" : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          <fieldset className="analytics-consent-items" disabled={isSubmitting}>
            <legend className="analytics-consent-label">철회할 동의</legend>
            <CheckOption
              title="서비스 이용 기록 분석 동의"
              description="앱 이용 기록 분석을 중단합니다."
              checked={items.usage_analysis}
              onChange={(event) => setItems({ ...items, usage_analysis: event.target.checked })}
            />
            <CheckOption
              title="이용 기록의 국외 이전 동의"
              description="이용 기록의 국외 이전(미국 Amplitude)을 중단합니다."
              checked={items.overseas_transfer}
              onChange={(event) => setItems({ ...items, overseas_transfer: event.target.checked })}
            />
          </fieldset>
          {error && (
            <p id="analytics-consent-error" className="analytics-consent-error" role="alert">
              {error}
            </p>
          )}
          <div className="analytics-consent-actions">
            {isSubmitting ? (
              <AdminBtn variant="disabled" aria-busy="true">
                <span className="analytics-consent-loading">
                  <AdminIcon asset="button-loading" size={20} />
                </span>
                처리 중
              </AdminBtn>
            ) : (
              <AdminBtn type="submit" variant={canSubmit ? "primary" : "disabled"}>
                처리하기
              </AdminBtn>
            )}
          </div>
        </form>
      </main>
      <WithdrawConfirmDialog
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void withdraw()}
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

function WithdrawConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);

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
          <AdminIcon asset="dialog-unlock" size={22} />
        </span>
        <h2 id={titleId}>선택한 동의를 철회하시겠습니까?</h2>
        <p id={descriptionId}>분석 데이터 삭제가 요청되며 되돌릴 수 없습니다.</p>
      </div>
      <div className="logout-dialog__actions">
        <AdminBtn variant="secondary" autoFocus onClick={onCancel}>
          취소할게요
        </AdminBtn>
        <AdminBtn variant="danger" onClick={onConfirm}>
          철회할게요
        </AdminBtn>
      </div>
    </dialog>
  );
}
