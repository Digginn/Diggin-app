import { useEffect, useId, useRef, useState } from "react";

import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";

export function LogoutDialog({
  isOpen,
  onCancel,
  onLogout,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onLogout: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitLock = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      setError("");
      dialog.showModal();
    }
    if (!isOpen && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [isOpen]);

  function cancel() {
    if (submitLock.current) return;
    dialogRef.current?.close();
    onCancel();
  }

  async function handleLogout() {
    if (submitLock.current) return;
    submitLock.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      await onLogout();
    } catch {
      setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="logout-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={isSubmitting}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          cancel();
      }}
    >
      <div className="logout-dialog__head">
        <span className="logout-dialog__icon">
          <AdminIcon name="logout" size={22} />
        </span>
        <h2 id={titleId}>로그아웃합니까?</h2>
        <p id={descriptionId}>
          로그아웃하면 다시 로그인하기 전까지 신고·제재 내역을 확인할 수 없습니다.
        </p>
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <div className="logout-dialog__actions">
        <AdminBtn variant="secondary" autoFocus disabled={isSubmitting} onClick={cancel}>
          취소
        </AdminBtn>
        <AdminBtn disabled={isSubmitting} onClick={handleLogout}>
          {isSubmitting ? "로그아웃 중…" : "로그아웃"}
        </AdminBtn>
      </div>
    </dialog>
  );
}
