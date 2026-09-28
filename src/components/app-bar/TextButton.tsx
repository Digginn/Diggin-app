import { Pressable, type PressableProps, Text } from "react-native";

type TextButtonProps = Omit<PressableProps, "children"> & {
  children: string;
};

export function TextButton({ children, disabled, ...rest }: TextButtonProps) {
  const isDisabled = disabled ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      {...rest}
      disabled={isDisabled}
      className="h-[48px] items-center justify-center px-3"
    >
      <Text className={`font-label-16-semibold ${isDisabled ? "text-gray-400" : "text-gray-700"}`}>
        {children}
      </Text>
    </Pressable>
  );
}
