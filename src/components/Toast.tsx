import { clsx } from "clsx";
import { cssInterop } from "nativewind";
import { useEffect } from "react";
import { Text, View } from "react-native";

import IconErrorSvg from "@/assets/images/icon-toast-error.svg";

const ErrorIcon = cssInterop(IconErrorSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export type ToastType = "default" | "error";

const BOTTOM_OFFSET = 160;

export const TOAST_DURATION: Record<ToastType, number> = {
  default: 2000,
  error: 4000,
};

type ToastProps = {
  message: string;
  type?: ToastType;
  onHide: () => void;
};

export function Toast({ message, type = "default", onHide }: ToastProps) {
  const isError = type === "error";

  useEffect(() => {
    const timer = setTimeout(onHide, TOAST_DURATION[type]);
    return () => clearTimeout(timer);
  }, [message, type, onHide]);

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center px-margin"
      style={{ bottom: BOTTOM_OFFSET }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className={clsx(
          "max-w-[327px] flex-row rounded border p-3",
          isError
            ? "items-start gap-2 border-semantic-errorOnDark bg-semantic-errorBg"
            : "items-center border-gray-800 bg-gray-700",
        )}
      >
        {isError ? <ErrorIcon className="size-4" /> : null}
        <Text
          className={clsx(
            "shrink font-label-14",
            isError ? "text-semantic-errorOnDark" : "text-center text-gray-200",
          )}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}
