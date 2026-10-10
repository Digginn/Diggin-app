import { Image as ExpoImage, type ImageSource } from "expo-image";
import { cssInterop } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { IconMyComments, IconMyReport } from "@/assets/images/my";

const Image = cssInterop(ExpoImage, { className: "style" });

export type VoteListItemData = {
  id: string;
  nickname: string;
  content: string;
  timeLabel: string;
  commentCount: number;
  imageSource: ImageSource | number;
};

type VoteListItemProps = {
  item: VoteListItemData;
  onPress?: () => void;
  onReport?: () => void;
};

export function VoteListItem({ item, onPress, onReport }: VoteListItemProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress && !onReport}
      onPress={onPress}
      className="border-b border-gray-200 px-margin pb-1 pt-4"
    >
      <View className="h-[120px]">
        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text numberOfLines={1} className="text-gray-800 font-nickname">
              {item.nickname}
            </Text>
            <Text numberOfLines={2} ellipsizeMode="tail" className="text-gray-1000 font-b4">
              {item.content}
            </Text>
          </View>
          <Image
            source={item.imageSource}
            contentFit="cover"
            className="h-20 w-20 rounded"
            accessibilityLabel="투표 아이템 이미지"
          />
        </View>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-gray-500 font-b3">{item.timeLabel}</Text>
            <Text className="text-gray-500 font-b1">·</Text>
            <View
              accessible
              accessibilityLabel={`댓글 ${item.commentCount}개`}
              className="flex-row items-center gap-1"
            >
              <IconMyComments width={16} height={16} />
              <Text className="text-gray-500 font-b3">{item.commentCount}</Text>
            </View>
          </View>
          {onReport && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.nickname}님의 투표글 신고`}
              onPress={(event) => {
                event.stopPropagation();
                onReport();
              }}
              className="h-12 w-12 items-end justify-center"
            >
              <View className="h-6 w-6 items-center justify-center">
                <IconMyReport width={18} height={18} />
              </View>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
