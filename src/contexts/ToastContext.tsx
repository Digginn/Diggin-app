import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { ToastText } from "@/components/ToastText";

const TOAST_DURATION_MS = 2000;
export const ToastContext = createContext<((message: string) => void) | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(undefined), TOAST_DURATION_MS);
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
              <ToastText message={message} />
            </View>
          </View>
        )}
      </View>
    </ToastContext.Provider>
  );
}
