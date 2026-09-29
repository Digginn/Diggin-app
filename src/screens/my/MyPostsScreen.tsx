import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { TopTab } from "@/components/TopTab";

import { VoteListItem, type VoteListItemData } from "./components/VoteListItem";
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

export type MyVote = VoteListItemData;

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
            <VoteListItem
              item={item}
              onPress={onPressVote ? () => onPressVote(item.id) : undefined}
            />
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
