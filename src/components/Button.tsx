import { type ReactNode } from "react";
import clsx from "clsx";
import { Pressable, Text } from "react-native";


export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "regular" | "large";

type ButtonProps = {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  bgColor?: string;
  accessibilityLabel?: string;
  className?: string;
};

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "regular",
  disabled = false,
  bgColor,
  accessibilityLabel,
  className,
}: ButtonProps) {
  const textClassName = clsx(
    "text-center",
    size === "large" ? "font-label-18-semibold" : "font-label-16-semibold",
    disabled
      ? "text-gray-500"
      : variant === "primary"
        ? "text-gray-0"
        : "text-gray-900",
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      className={clsx(
        "h-12 self-stretch flex-row items-center justify-center gap-3 rounded-[5px] px-5",
        !disabled && "active:opacity-75",
        !bgColor && (disabled ? "bg-gray-200" : variant === "primary" ? "bg-gray-900" : "bg-gray-100"),
        className,
      )}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          numberOfLines={1}
          className={textClassName}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
