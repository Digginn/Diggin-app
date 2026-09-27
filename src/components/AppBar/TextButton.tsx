import { Pressable, Text } from "react-native";

type TextButtonProps = {
  children: string;
  onPress: () => void;
  disabled?: boolean;
};

export function TextButton({ children, onPress, disabled = false }: TextButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="h-[48px] items-center justify-center px-3"
    >
      <Text className={`font-label-16-semibold ${disabled ? "text-gray-400" : "text-gray-900"}`}>
        {children}
      </Text>
    </Pressable>
  );
}
