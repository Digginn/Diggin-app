import { View } from "react-native";

import { ToastText } from "@/components/ToastText";

export function FolderToast({ message }: { message: string }) {
  return (
    <View pointerEvents="none" className="w-full items-center px-margin">
      <ToastText message={message} />
    </View>
  );
}
