import { useContext } from "react";

import { ToastContext } from "@/contexts/ToastContext";

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used within ToastProvider");
  return showToast;
}
