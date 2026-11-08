import { Pressable, Text, View } from "react-native";

import MiniCloseSvg from "@/assets/images/icon-mini-close-light.svg";

const ICON_SIZE = 24;

type CommentEditBannerProps = {
  onCancel: () => void;
};

export function CommentEditBanner({ onCancel }: CommentEditBannerProps) {
  return (
    <View className="h-9 w-full flex-row items-center justify-between bg-gray-100 pl-margin pr-3">
      <Text className="text-gray-700 font-label-14">댓글 수정 중</Text>
      {/* 보이는 높이는 36 이고 닫기 터치 영역 48 은 위아래로 넘침 */}
      <Pressable
        accessibilityLabel="댓글 수정 취소"
        accessibilityRole="button"
        className="absolute right-3 size-12 items-center justify-center p-2.5 active:opacity-75"
        onPress={onCancel}
      >
        <MiniCloseSvg width={ICON_SIZE} height={ICON_SIZE} />
      </Pressable>
    </View>
  );
}
