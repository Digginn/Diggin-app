import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, View } from "react-native";

import { ensureCommunityWriteAllowed, restrictionMessage } from "@/api/accountAccess";
import { AppBar } from "@/components/app-bar";
import { NotificationButton } from "@/components/app-bar/NotificationButton";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Fab } from "@/components/Fab";
import { Spinner } from "@/components/Loading";
import { Post } from "@/components/Post";
import { ReportFlow, type ReportTarget } from "@/components/ReportFlow";
import { TopTab } from "@/components/TopTab";
import { DIGGLE_EMPTY_MESSAGES } from "@/constants/messages";
import { useAuth } from "@/contexts/AuthContext";
import { useLoginGate } from "@/hooks/useLoginGate";
import { useToast } from "@/hooks/useToast";
import { trackEvent } from "@/lib/analytics";

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
  const { requireLogin, loginModal } = useLoginGate();
  const showToast = useToast();
  const feed = useCommunityFeed(tab);
  const posts = feed.data?.pages.flat() ?? [];
  const isOpeningWriter = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isOpeningWriter.current = false;
      trackEvent("community_view", { view_type: "feed" });
    }, []),
  );

  useEffect(() => {
    if (feed.error && posts.length > 0) showToast(communityErrorMessage(feed.error));
  }, [feed.error, posts.length, showToast]);

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        left="logo"
        right={<NotificationButton onPress={() => router.push("/notifications")} />}
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
      ) : feed.isError && posts.length === 0 ? (
        <ErrorState
          message={communityErrorMessage(feed.error)}
          onRetry={() => void feed.refetch()}
        />
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
            <View className="h-96">
              <EmptyState
                variant={tab === "all" ? "post" : "vote"}
                message={DIGGLE_EMPTY_MESSAGES[tab]}
              />
            </View>
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
              authorLabel={item.isMine ? "익명(나)" : "익명"}
              likeCount={item.type === "post" ? (item.likeCount ?? undefined) : undefined}
              commentCount={item.commentCount ?? 0}
              onPressReport={
                session && !item.isMine
                  ? () => setReportTarget({ type: "post", id: item.id })
                  : undefined
              }
              onPress={() =>
                requireLogin(() =>
                  router.push({
                    pathname: item.type === "vote" ? "/votes/[id]" : "/posts/[id]",
                    params: { id: item.id },
                  }),
                )
              }
            />
          )}
        />
      )}
      <View className="absolute bottom-6 right-[27px]">
        <Fab
          accessibilityLabel={tab === "vote" ? "투표글 작성" : "게시글 작성"}
          isDisabled={isRestoring}
          onPress={() =>
            requireLogin(() => {
              if (isOpeningWriter.current) return;
              isOpeningWriter.current = true;
              void ensureCommunityWriteAllowed()
                .then(() => router.navigate(tab === "vote" ? "/votes/write" : "/posts/write"))
                .catch((error) => {
                  isOpeningWriter.current = false;
                  showToast(
                    restrictionMessage(error) ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
                    restrictionMessage(error) ? "notice" : "error",
                  );
                });
            })
          }
        />
      </View>
      <ReportFlow target={reportTarget} onClose={() => setReportTarget(null)} />
      {loginModal}
    </View>
  );
}
