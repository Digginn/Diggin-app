import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { IconNotification, IconSearch } from "@/assets/images/appbar";
import { AppBar } from "@/components/app-bar";
import { EmptyState } from "@/components/EmptyState";
import { Fab } from "@/components/Fab";
import { Post } from "@/components/Post";
import { ReportFlow, type ReportTarget } from "@/components/ReportFlow";
import { TopTab } from "@/components/TopTab";
import { DIGGLE_EMPTY_MESSAGES } from "@/constants/messages";
import { useBlockedUsers } from "@/contexts/BlockedUsersContext";
import { usePosts } from "@/contexts/PostsContext";
import type { PostTab } from "@/types/post";

const TABS = [
  { key: "all", label: "전체 게시글" },
  { key: "vote", label: "투표" },
];

export function DiggleScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<PostTab>("all");
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const { isBlocked, block } = useBlockedUsers();
  const { posts: allPosts } = usePosts();

  const posts = allPosts.filter((post) => !isBlocked(post.authorId));

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
              onPressReport={() => setReportTarget({ authorId: item.authorId })}
            />
          )}
        />
      )}

      <View className="absolute bottom-6 right-[27px]">
        <Fab accessibilityLabel="게시글 작성" onPress={() => router.push("/posts/write")} />
      </View>

      <ReportFlow target={reportTarget} onClose={() => setReportTarget(null)} onBlock={block} />
    </View>
  );
}
