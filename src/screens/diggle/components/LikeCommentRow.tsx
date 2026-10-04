import { Pressable, Text, View } from "react-native";

import CommentSvg from "@/assets/images/icon-comment.svg";
import LikeHeartFilledSvg from "@/assets/images/icon-like-heart-filled.svg";
import LikeHeartSvg from "@/assets/images/icon-like-heart.svg";
import { colors } from "@/theme";

const HEART = { width: 19.5, height: 18 };
const COMMENT = { width: 19.5, height: 16.93 };

type LikeCommentRowProps = {
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  onPressLike: () => void;
};

export function LikeCommentRow({
  likeCount,
  commentCount,
  isLiked,
  onPressLike,
}: LikeCommentRowProps) {
  const Heart = isLiked ? LikeHeartFilledSvg : LikeHeartSvg;

  return (
    <View className="w-full flex-row items-center gap-2.5 pl-3">
      <View className="flex-row items-center justify-center">
        <Pressable
          accessibilityLabel="좋아요"
          accessibilityRole="button"
          accessibilityState={{ selected: isLiked }}
          className="-mr-1.5 size-12 items-center justify-center active:opacity-75"
          onPress={onPressLike}
        >
          <Heart {...HEART} color={isLiked ? colors.semantic.error : colors.gray[900]} />
        </Pressable>
        <Text className="text-gray-500 font-label-14">{likeCount}</Text>
      </View>
      <View className="flex-row items-center justify-center">
        <View className="-mr-1.5 size-12 items-center justify-center">
          <CommentSvg {...COMMENT} color={colors.gray[900]} />
        </View>
        <Text className="text-gray-500 font-label-14">{commentCount}</Text>
      </View>
    </View>
  );
}
