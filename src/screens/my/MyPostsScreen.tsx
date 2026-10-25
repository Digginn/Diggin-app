import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ImageMyVotePlaceholder } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Loading";
import { LoginRequiredModal } from "@/components/modal";
import { Post } from "@/components/Post";
import { ReportFlow, type ReportTarget } from "@/components/ReportFlow";
import { TopTab } from "@/components/TopTab";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { startLogin } from "@/lib/loginIntent";
import { communityKeys } from "@/screens/diggle/api/community";
import type { CommunityPost } from "@/screens/diggle/types/community";
import {
  communityErrorMessage,
  formatCommunityTime,
} from "@/screens/diggle/utils/formatCommunityTime";

import type { ActivityKind } from "./api/communityActivity";
import { VoteListItem, type VoteListItemData } from "./components/VoteListItem";
import { useCommunityActivity } from "./queries/useCommunityActivity";
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

export function MyPostsScreen({ isLiked = false }: { isLiked?: boolean } = {}) {
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const activeKey = tab === "votes" ? "votes" : "posts";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { session, isRestoring } = useAuth();
  const queryClient = useQueryClient();
  const showToast = useToast();
  const kind: ActivityKind = isLiked ? "liked" : activeKey === "votes" ? "vote" : "post";
  const activity = useCommunityActivity(kind);
  const rows = activity.data?.pages.flat() ?? [];
  const title = isLiked ? "내가 좋아요한 글" : "내가 쓴 글";
  const viewer = session?.user.id ?? null;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/my-activity"));
  useFocusEffect(
    useCallback(() => {
      if (!isRestoring && viewer)
        void queryClient.invalidateQueries({ queryKey: communityKeys.activity(viewer, kind) });
    }, [isRestoring, viewer, kind, queryClient]),
  );
  useEffect(() => {
    if (activity.error && rows.length > 0) showToast(communityErrorMessage(activity.error));
  }, [activity.error, rows.length, showToast]);

  function openPost(post: CommunityPost) {
    try {
      router.push({
        pathname: post.type === "vote" ? "/votes/[id]" : "/posts/[id]",
        params: { id: post.id, returnTo: isLiked ? "liked" : "my-posts" },
      });
    } catch {
      showToast("요청을 처리하지 못했습니다. 다시 시도해 주세요.", "error");
    }
  }

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title={title} onBack={goBack} />
      {!isRestoring && !session ? (
        <LoginRequiredModal
          visible={isFocused}
          onClose={goBack}
          onLogin={() => startLogin(router)}
        />
      ) : isRestoring ? (
        <Spinner />
      ) : (
        <>
          {!isLiked && (
            <TopTab
              items={TABS}
              activeKey={activeKey}
              onChange={(key) => router.setParams({ tab: key })}
            />
          )}
          {activity.isPending ? (
            <View
              accessibilityLabel="내 활동 불러오는 중"
              className="flex-1 items-center justify-center"
            >
              <Spinner />
            </View>
          ) : (
            <FlatList
              key={kind}
              data={rows}
              keyExtractor={(item) => item.post.id}
              refreshing={activity.isRefetching && !activity.isFetchingNextPage}
              onRefresh={() => void activity.refetch()}
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (activity.hasNextPage && !activity.isFetching && !activity.isFetchNextPageError)
                  void activity.fetchNextPage();
              }}
              renderItem={({ item: { post } }) =>
                isLiked ? (
                  <Post
                    body={post.body}
                    items={post.items}
                    timeLabel={formatCommunityTime(post.createdAt)}
                    authorLabel={post.isMine ? "익명(나)" : "익명"}
                    likeCount={post.likeCount ?? 0}
                    commentCount={post.commentCount ?? 0}
                    onPressReport={
                      !post.isMine
                        ? () => setReportTarget({ type: "post", id: post.id })
                        : undefined
                    }
                    onPress={() => openPost(post)}
                  />
                ) : post.type === "post" ? (
                  <PostRow
                    item={{
                      id: post.id,
                      nickname: "글쓴이 (나)",
                      content: post.body,
                      dateLabel: formatCommunityTime(post.createdAt),
                    }}
                    onPress={() => openPost(post)}
                  />
                ) : (
                  <VoteListItem
                    item={{
                      id: post.id,
                      nickname: "글쓴이 (나)",
                      content: post.body,
                      timeLabel: formatCommunityTime(post.createdAt),
                      commentCount: post.commentCount ?? 0,
                      imageSource: post.items[0]?.imageUrl
                        ? { uri: post.items[0].imageUrl }
                        : ImageMyVotePlaceholder,
                    }}
                    onPress={() => openPost(post)}
                  />
                )
              }
              ListEmptyComponent={
                activity.isError ? (
                  <View className="items-center gap-4 px-margin py-12">
                    <Text className="text-center text-gray-500 font-b1">
                      {communityErrorMessage(activity.error)}
                    </Text>
                    <Button onPress={() => void activity.refetch()}>다시 시도</Button>
                  </View>
                ) : (
                  <View className="h-96">
                    <EmptyState
                      variant={kind === "vote" ? "vote" : "post"}
                      message={
                        isLiked
                          ? "좋아요한 글이 없습니다."
                          : kind === "vote"
                            ? "작성한 투표글이 없습니다."
                            : "작성한 게시글이 없습니다."
                      }
                    />
                  </View>
                )
              }
              ListFooterComponent={
                activity.isFetchingNextPage ? (
                  <View className="items-center py-5">
                    <Spinner />
                  </View>
                ) : activity.isFetchNextPageError ? (
                  <Button onPress={() => void activity.fetchNextPage()}>다시 시도</Button>
                ) : null
              }
              className="flex-1"
              contentContainerStyle={{ paddingBottom: insets.bottom }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
      <ReportFlow target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}
