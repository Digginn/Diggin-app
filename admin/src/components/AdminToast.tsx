import { useEffect } from "react";

import { AdminIcon } from "./AdminIcon";

export function AdminToast({
  message,
  isVisible,
  onDismiss,
  variant = "success",
}: {
  message: string;
  isVisible: boolean;
  onDismiss: () => void;
  variant?: "success" | "refresh";
}) {
  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timer);
  }, [isVisible, message, onDismiss]);

  return isVisible ? (
    <div className={`admin-toast admin-toast--${variant}`} role="status">
      <AdminIcon asset={variant === "refresh" ? "toast-refresh" : "toast-check"} size={18} />
      {message}
    </div>
  ) : null;
}
