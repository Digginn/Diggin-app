import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { IconNotification, IconSearch } from "@/assets/images/appbar";
import { AppBar } from "@/components/app-bar";
import { EmptyState } from "@/components/EmptyState";
import { Fab } from "@/components/Fab";
import { Post } from "@/components/Post";
import { TopTab } from "@/components/TopTab";
import { DIGGLE_EMPTY_MESSAGES } from "@/constants/messages";
import type { FeedPost, PostTab } from "@/types/post";

const TABS = [
  { key: "all", label: "전체 게시글" },
  { key: "vote", label: "투표" },
];

// TODO: API 연결 전까지 쓰는 임시 데이터. 연결 시 TanStack Query 로 교체한다.
const MOCK_POSTS: FeedPost[] = Array.from({ length: 4 }, (_, index) => ({
  id: String(index),
  body: "본문 텍스트는 1줄만 노출됩니다. 본문 텍스트는 1줄만 노출됩니다. 본문 텍스트는 1줄만 노출됩니다.",
  items: Array.from({ length: 4 }, (_, item) => ({ id: `${index}-${item}`, imageUrl: null })),
  timeLabel: "N분 전",
  authorLabel: "익명",
  likeCount: 1,
  commentCount: 1,
}));

export function DiggleScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<PostTab>("all");

  const posts = MOCK_POSTS;

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        left="logo"
        right={
          <>
            <AppBar.IconButton icon={IconSearch} accessibilityLabel="검색" />
            <AppBar.IconButton icon={IconNotification} accessibilityLabel="알림" />
          </>
        }
      />
      <TopTab items={TABS} activeKey={tab} onChange={(key) => setTab(key as PostTab)} />

      {posts.length === 0 ? (
        <EmptyState
          variant={tab === "all" ? "post" : "vote"}
          message={DIGGLE_EMPTY_MESSAGES[tab]}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => (
            <Post
              type={tab}
              body={item.body}
              items={item.items}
              timeLabel={item.timeLabel}
              authorLabel={item.authorLabel}
              likeCount={tab === "all" ? item.likeCount : undefined}
              commentCount={item.commentCount}
              // TODO: 투표 상세는 다른 작업자가 맡아 아직 연결하지 않음
              onPress={tab === "all" ? () => router.push(`/posts/${item.id}`) : undefined}
            />
          )}
        />
      )}

      <View className="absolute bottom-6 right-[27px]">
        <Fab accessibilityLabel="게시글 작성" onPress={() => router.push("/posts/write")} />
      </View>
    </View>
  );
}
