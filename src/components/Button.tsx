import { clsx } from "clsx";
import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, Text } from "react-native";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "regular" | "large";

type ButtonProps = {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isDisabled?: boolean;
  bgColor?: string;
  accessibilityLabel?: string;
  className?: string;
};

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "regular",
  isDisabled = false,
  bgColor,
  accessibilityLabel,
  className,
}: ButtonProps) {
  const textClassName = clsx(
    "text-center",
    size === "large" ? "font-label-18-semibold" : "font-label-16-semibold",
    isDisabled ? "text-gray-500" : variant === "primary" ? "text-gray-0" : "text-gray-900",
  );

  function renderChildren(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (typeof child === "string" || typeof child === "number") {
        return (
          <Text numberOfLines={1} className={textClassName}>
            {child}
          </Text>
        );
      }
      if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
        return cloneElement(child, {}, renderChildren(child.props.children));
      }
      return child;
    });
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      className={clsx(
        "h-12 flex-row items-center justify-center gap-3 self-stretch rounded px-5",
        !isDisabled && "active:opacity-75",
        !bgColor &&
          (isDisabled ? "bg-gray-200" : variant === "primary" ? "bg-gray-900" : "bg-gray-100"),
        className,
      )}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {renderChildren(children)}
    </Pressable>
  );
}
