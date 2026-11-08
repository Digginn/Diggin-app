import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { colors } from "@/theme/colors";

type FolderManageButtonProps = {
  folderCount: number;
  onPress: () => void;
};

export function FolderManageButton({ folderCount, onPress }: FolderManageButtonProps) {
  const isSaved = folderCount > 0;

  return (
    <Button
      variant={isSaved ? "secondary" : "primary"}
      bgColor={isSaved ? colors.gray[0] : undefined}
      className={`gap-1.5 ${isSaved ? "border border-gray-900" : ""}`}
      accessibilityLabel={isSaved ? `폴더 관리, ${folderCount}개 폴더에 저장됨` : "폴더에 추가"}
      onPress={onPress}
    >
      {isSaved ? "폴더 관리" : "폴더에 추가"}
      {folderCount > 1 && (
        <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gray-900 px-[5px]">
          <Text className="text-center text-gray-0 font-label-12-semibold">
            {folderCount > 99 ? "99+" : folderCount}
          </Text>
        </View>
      )}
    </Button>
  );
}
