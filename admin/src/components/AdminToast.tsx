import { useEffect } from "react";

import { AdminIcon } from "./AdminIcon";

export function AdminToast({
  message,
  isVisible,
  onDismiss,
}: {
  message: string;
  isVisible: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timer);
  }, [isVisible, message, onDismiss]);

  return isVisible ? (
    <div className="admin-toast" role="status">
      <AdminIcon asset="toast-check" size={18} />
      {message}
    </div>
  ) : null;
}
