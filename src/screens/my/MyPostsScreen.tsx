import { Image as ExpoImage, type ImageSource } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconMyComments } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { TopTab } from "@/components/TopTab";

const Image = cssInterop(ExpoImage, { className: "style" });
const TABS = [
  { key: "posts", label: "게시글" },
  { key: "votes", label: "투표" },
];

export type MyPost = {
  id: string;
  nickname: string;
  content: string;
  dateLabel: string;
};

export type MyVote = Omit<MyPost, "dateLabel"> & {
  timeLabel: string;
  commentCount: number;
  imageSource: ImageSource | number;
};

type MyPostsScreenProps = {
  posts: MyPost[];
  votes: MyVote[];
  onPressPost?: (id: string) => void;
  onPressVote?: (id: string) => void;
};

function PostRow({ item, onPress }: { item: MyPost; onPress?: () => void }) {
  return (
    <View className="px-margin">
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        disabled={!onPress}
        onPress={onPress}
        className="gap-[13px] border-b border-gray-300 px-2 py-5"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="flex-1 text-gray-1000 font-nickname">
            {item.nickname}
          </Text>
          <Text className="text-gray-500 font-b3">{item.dateLabel}</Text>
        </View>
        <Text numberOfLines={1} ellipsizeMode="tail" className="text-gray-800 font-b4">
          {item.content}
        </Text>
      </Pressable>
    </View>
  );
}

function VoteRow({ item, onPress }: { item: MyVote; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
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
            className="h-20 w-20 rounded-[2px]"
            accessibilityLabel="투표 상품 이미지"
          />
        </View>
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
      </View>
    </Pressable>
  );
}

export function MyPostsScreen({ posts, votes, onPressPost, onPressVote }: MyPostsScreenProps) {
  const [activeKey, setActiveKey] = useState("posts");
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내가 쓴 글" />
      <TopTab items={TABS} activeKey={activeKey} onChange={setActiveKey} />
      {activeKey === "posts" ? (
        <FlatList
          key="posts"
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostRow item={item} onPress={onPressPost ? () => onPressPost(item.id) : undefined} />
          )}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="votes"
          data={votes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VoteRow item={item} onPress={onPressVote ? () => onPressVote(item.id) : undefined} />
          )}
          ItemSeparatorComponent={() => <View className="h-px" />}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
