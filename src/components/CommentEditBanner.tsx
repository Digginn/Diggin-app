import { clsx } from "clsx";
import { Pressable, Text, View } from "react-native";

import MiniCloseSvg from "@/assets/images/icon-mini-close-light.svg";
import { colors } from "@/theme";

const ICON_SIZE = 24;

type CommentEditBannerProps = {
  onCancel: () => void;
  /** 있으면 답글 작성 중 배너로 바뀜 */
  replyTo?: string;
};

export function CommentEditBanner({ onCancel, replyTo }: CommentEditBannerProps) {
  return (
    <View
      className={clsx(
        "h-9 w-full flex-row items-center justify-between pl-margin pr-3",
        replyTo === undefined ? "bg-gray-100" : "bg-gray-50",
      )}
    >
      <Text numberOfLines={1} className="shrink pr-12 text-gray-700 font-label-14">
        {replyTo === undefined ? "댓글 수정 중" : `${replyTo}님에게 답글 작성 중`}
      </Text>
      {/* 보이는 높이는 36 이고 닫기 터치 영역 48 은 위아래로 넘침 */}
      <Pressable
        accessibilityLabel={replyTo === undefined ? "댓글 수정 취소" : "답글 작성 취소"}
        accessibilityRole="button"
        className="absolute right-3 size-12 items-center justify-center p-2.5 active:opacity-75"
        onPress={onCancel}
      >
        <MiniCloseSvg width={ICON_SIZE} height={ICON_SIZE} color={colors.gray[800]} />
      </Pressable>
    </View>
  );
}
