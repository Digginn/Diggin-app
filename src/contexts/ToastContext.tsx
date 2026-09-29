import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { ToastText, type ToastVariant } from "@/components/ToastText";

const TOAST_DURATION_MS = 2000;
const ERROR_TOAST_DURATION_MS = 4000;
export const ToastContext = createContext<
  ((message: string, variant?: ToastVariant) => void) | undefined
>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; variant: ToastVariant }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((text: string, variant: ToastVariant = "default") => {
    clearTimeout(timer.current);
    setMessage({ text, variant });
    timer.current = setTimeout(
      () => setMessage(undefined),
      variant === "error" ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS,
    );
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={showToast}>
      <View className="flex-1">
        {children}
        {message && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 bottom-[160px] items-center px-margin"
          >
            <View className="w-full max-w-[327px] items-center">
              <ToastText message={message.text} variant={message.variant} />
            </View>
          </View>
        )}
      </View>
    </ToastContext.Provider>
  );
}
