import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { ensureCommunityWriteAllowed, restrictionMessage } from "@/api/accountAccess";
import { AppBar } from "@/components/app-bar";
import { NotificationButton } from "@/components/app-bar/NotificationButton";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Fab } from "@/components/Fab";
import { Spinner } from "@/components/Loading";
import { LoginRequiredModal } from "@/components/modal";
import { Post } from "@/components/Post";
import { ReportFlow, type ReportTarget } from "@/components/ReportFlow";
import { TopTab } from "@/components/TopTab";
import { DIGGLE_EMPTY_MESSAGES } from "@/constants/messages";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";

import { useCommunityFeed } from "./queries/useCommunity";
import { communityErrorMessage, formatCommunityTime } from "./utils/formatCommunityTime";

const TABS = [
  { key: "all", label: "전체 게시글" },
  { key: "vote", label: "투표" },
];

export function DiggleScreen() {
  const router = useRouter();
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
  const tab = requestedTab === "vote" ? "vote" : "all";
  const { session, isRestoring } = useAuth();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [isLoginRequired, setLoginRequired] = useState(false);
  const showToast = useToast();
  const feed = useCommunityFeed(tab);
  const posts = feed.data?.pages.flat() ?? [];

  useEffect(() => {
    if (feed.error && posts.length > 0) showToast(communityErrorMessage(feed.error));
  }, [feed.error, posts.length, showToast]);

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        left="logo"
        right={
          <NotificationButton
            onPress={() => {
              if (!session) setLoginRequired(true);
              else router.push("/notifications");
            }}
          />
        }
      />
      <TopTab items={TABS} activeKey={tab} onChange={(key) => router.setParams({ tab: key })} />
      {isRestoring || feed.isPending ? (
        <View
          accessibilityLabel="게시글 불러오는 중"
          accessibilityState={{ busy: true }}
          className="gap-6 px-margin pt-6"
        >
          {[0, 1, 2].map((key) => (
            <View key={key} className="gap-3">
              <View className="h-4 w-3/4 rounded bg-gray-100" />
              <View className="h-32 rounded bg-gray-100" />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => void feed.refetch()}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError)
              void feed.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            feed.isError ? (
              <View className="items-center gap-4 px-margin py-12">
                <Text className="text-center text-gray-500 font-b1">
                  {communityErrorMessage(feed.error)}
                </Text>
                <View className="w-[156px]">
                  <Button onPress={() => void feed.refetch()}>다시 시도</Button>
                </View>
              </View>
            ) : (
              <View className="h-96">
                <EmptyState
                  variant={tab === "all" ? "post" : "vote"}
                  message={DIGGLE_EMPTY_MESSAGES[tab]}
                />
              </View>
            )
          }
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <View className="items-center py-5">
                <Spinner />
              </View>
            ) : feed.isFetchNextPageError ? (
              <Button onPress={() => void feed.fetchNextPage()}>다시 시도</Button>
            ) : null
          }
          renderItem={({ item }) => (
            <Post
              type={item.type === "vote" ? "vote" : "all"}
              isPreview={item.isPreview}
              body={item.body}
              items={item.items}
              timeLabel={formatCommunityTime(item.createdAt)}
              authorLabel={item.isMine ? "글쓴이 (나)" : "글쓴이"}
              likeCount={item.type === "post" ? (item.likeCount ?? undefined) : undefined}
              commentCount={item.commentCount ?? 0}
              onPressReport={
                session && !item.isMine
                  ? () => setReportTarget({ type: "post", id: item.id })
                  : undefined
              }
              onPress={() => {
                if (!session) setLoginRequired(true);
                else
                  router.push({
                    pathname: item.type === "vote" ? "/votes/[id]" : "/posts/[id]",
                    params: { id: item.id },
                  });
              }}
            />
          )}
        />
      )}
      <View className="absolute bottom-6 right-[27px]">
        <Fab
          accessibilityLabel={tab === "vote" ? "투표글 작성" : "게시글 작성"}
          isDisabled={isRestoring}
          onPress={() => {
            if (!session) setLoginRequired(true);
            else
              void ensureCommunityWriteAllowed()
                .then(() => router.push(tab === "vote" ? "/votes/write" : "/posts/write"))
                .catch((error) =>
                  showToast(
                    restrictionMessage(error) ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
                    restrictionMessage(error) ? "notice" : "error",
                  ),
                );
          }}
        />
      </View>
      <ReportFlow target={reportTarget} onClose={() => setReportTarget(null)} />
      <LoginRequiredModal
        visible={isLoginRequired && !session}
        onClose={() => setLoginRequired(false)}
        onLogin={() => {
          setLoginRequired(false);
          router.push("/login");
        }}
      />
    </View>
  );
}
