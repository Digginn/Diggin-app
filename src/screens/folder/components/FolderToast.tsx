import { View } from "react-native";

import { ToastText, type ToastVariant } from "@/components/ToastText";

export function FolderToast({ message, variant }: { message: string; variant?: ToastVariant }) {
  return (
    <View pointerEvents="none" className="w-full items-center px-margin">
      <ToastText message={message} variant={variant} />
    </View>
  );
}
