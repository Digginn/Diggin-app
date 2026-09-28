import { Pressable, Text } from "react-native";

export type ModalAction = {
  label: string;
  onPress: () => void;
};

export function ModalButton({
  action,
  variant = "primary",
}: {
  action: ModalAction;
  variant?: "primary" | "secondary" | "disabled";
}) {
  const containerClassName =
    variant === "primary"
      ? "bg-gray-900 rounded-[5px]"
      : variant === "secondary"
        ? "bg-gray-100 rounded"
        : "bg-gray-200 rounded";
  const labelClassName =
    variant === "primary"
      ? "text-gray-0"
      : variant === "secondary"
        ? "text-gray-900"
        : "text-gray-500";
  return (
    <Pressable
      className={`h-12 w-full items-center justify-center px-5 ${containerClassName}`}
      disabled={variant === "disabled"}
      onPress={action.onPress}
    >
      <Text className={`font-label-16-semibold ${labelClassName}`}>{action.label}</Text>
    </Pressable>
  );
}
