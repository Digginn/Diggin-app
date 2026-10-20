import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Linking, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { Comment } from "@/components/Comment";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Loading";
import { ActionModal, LoginRequiredModal } from "@/components/modal";
import { ToastText } from "@/components/ToastText";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";

import { communityKeys } from "./api/community";
import { communityWriteError, deleteCommunityPost } from "./api/communityWrite";
import { LikeCommentRow } from "./components/LikeCommentRow";
import { PostItemInfoSheet } from "./components/PostItemInfoSheet";
import { ProductImgGrid } from "./components/ProductImgGrid";
import { VoteBlock } from "./components/VoteBlock";
import { useCommunityVoteTiming } from "./hooks/useCommunityVoteTiming";
import { useCommunityComments, useCommunityPost } from "./queries/useCommunity";
import type { CommunityItem } from "./types/community";
import { communityErrorMessage, formatCommunityTime } from "./utils/formatCommunityTime";

export function PostDetailScreen({ type = "all" }: { type?: "all" | "vote" }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, isRestoring } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleting = useRef(false);
  const currentViewer = useRef(session?.user.id);
  useEffect(() => {
    currentViewer.current = session?.user.id;
    return () => {
      currentViewer.current = undefined;
    };
  }, [session?.user.id]);
  const result = useCommunityPost(id);
  const post = result.data;
  const isWrongRoute = !!post && post.type !== (type === "vote" ? "vote" : "post");
  const voteTiming = useCommunityVoteTiming(post, result.dataUpdatedAt);
  const comments = useCommunityComments(id, !!post && !isWrongRoute);
  const [infoItem, setInfoItem] = useState<CommunityItem | null>(null);
  const returnItem = useRef<CommunityItem | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (returnItem.current) {
        setInfoItem(returnItem.current);
        returnItem.current = null;
      }
    }, []),
  );
  const [isLoginPromptVisible, setLoginPromptVisible] = useState(true);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/diggle"));

  async function removePost() {
    if (!post?.isMine || deleting.current) return;
    const viewer = session?.user.id;
    deleting.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteCommunityPost(post.id);
      if (currentViewer.current !== viewer) return;
      setDeleteOpen(false);
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
      router.dismissTo({
        pathname: "/(tabs)/diggle",
        params: { tab: post.type === "vote" ? "vote" : "all" },
      });
      showToast(post.type === "vote" ? "투표글이 삭제되었습니다." : "게시글이 삭제되었습니다.");
    } catch (error) {
      if (currentViewer.current === viewer) setDeleteError(communityWriteError(error));
    } finally {
      deleting.current = false;
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (result.error && post) showToast(communityErrorMessage(result.error));
  }, [result.error, post, showToast]);

  useEffect(() => {
    if (!isRestoring && session && post && isWrongRoute) {
      router.replace({
        pathname: post.type === "vote" ? "/votes/[id]" : "/posts/[id]",
        params: { id: post.id },
      });
    }
  }, [isRestoring, session, post, isWrongRoute, router]);

  if (!isRestoring && !session)
    return (
      <View className="flex-1 bg-gray-0">
        <AppBar left="back" onBack={goBack} />
        <LoginRequiredModal
          visible={isLoginPromptVisible}
          onClose={goBack}
          onLogin={() => {
            setLoginPromptVisible(false);
            router.push("/login");
          }}
        />
      </View>
    );

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        left="back"
        onBack={goBack}
        isDisabled={infoItem !== null || isDeleting}
        right={
          post?.isMine && !isWrongRoute ? (
            <AppBar.TextButton
              disabled={isDeleting || infoItem !== null}
              onPress={() => {
                setDeleteError("");
                setDeleteOpen(true);
              }}
            >
              삭제
            </AppBar.TextButton>
          ) : null
        }
      />
      {isRestoring || result.isPending || isWrongRoute ? (
        <View
          accessibilityLabel="게시글 불러오는 중"
          className="flex-1 items-center justify-center"
        >
          <Spinner />
        </View>
      ) : !post ? (
        <View className="flex-1 gap-4">
          <EmptyState
            variant={type === "vote" ? "vote" : "post"}
            message={
              result.isError ? communityErrorMessage(result.error) : "게시글을 찾을 수 없습니다."
            }
          />
          {result.isError && (
            <View className="self-center pb-6">
              <Button onPress={() => void result.refetch()}>다시 시도</Button>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          className="flex-1"
          data={comments.data?.pages.flat() ?? []}
          keyExtractor={(comment) => comment.id}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (comments.hasNextPage && !comments.isFetching && !comments.isFetchNextPageError)
              void comments.fetchNextPage({ cancelRefetch: false });
          }}
          ListHeaderComponent={
            <>
              <View className="gap-3 px-margin pb-4">
                <Text className="text-gray-500 font-b4">
                  {post.isMine ? "글쓴이 (나)" : "글쓴이"} · {formatCommunityTime(post.createdAt)}
                </Text>
                <Text className="text-gray-800 font-b3">{post.body}</Text>
                <ProductImgGrid
                  items={post.items}
                  onPressInfo={(item) =>
                    setInfoItem(post.items.find((snapshot) => snapshot.id === item.id) ?? null)
                  }
                />
                {post.type === "vote" && voteTiming && (
                  <VoteBlock
                    isReadOnly
                    isMyVote={post.isMine}
                    hasResults={post.buyCount !== null && post.notCount !== null}
                    vote={{
                      buyCount: post.buyCount ?? 0,
                      notCount: post.notCount ?? 0,
                      myChoice:
                        post.myChoice === "buy" ? "BUY" : post.myChoice === "not" ? "NOT" : null,
                      ...voteTiming,
                    }}
                  />
                )}
              </View>
              {/* 좋아요·댓글 쓰기는 #97에서 연결한다. */}
              <LikeCommentRow
                likeCount={post.likeCount ?? 0}
                commentCount={post.commentCount ?? 0}
                isLiked={post.isLiked}
                hasLike={post.type === "post"}
              />
              <View className="h-3 bg-gray-100" />
            </>
          }
          renderItem={({ item: comment }) => (
            <Comment
              key={comment.id}
              author={
                comment.isWithdrawn
                  ? "(탈퇴한 사용자)"
                  : comment.isPostAuthor
                    ? "글쓴이"
                    : `디기 ${comment.anonNumber ?? ""}${comment.isMine ? "(나)" : ""}`
              }
              body={comment.body?.replace(/\r?\n/g, " ") ?? ""}
              timeLabel={formatCommunityTime(comment.createdAt)}
              isDeleted={comment.isWithdrawn}
            />
          )}
          ListFooterComponent={
            <>
              {(comments.isPending || comments.isFetchingNextPage) && (
                <View className="items-center py-4">
                  <Spinner />
                </View>
              )}
              {comments.isError && (
                <View className="items-center gap-3 px-margin py-4">
                  <Text className="text-center text-gray-500 font-b3">
                    {communityErrorMessage(comments.error, "댓글")}
                  </Text>
                  <Button
                    isDisabled={comments.isFetching}
                    onPress={() => {
                      if (comments.isFetchNextPageError)
                        void comments.fetchNextPage({ cancelRefetch: false });
                      else void comments.refetch();
                    }}
                  >
                    댓글 다시 불러오기
                  </Button>
                </View>
              )}
            </>
          }
        />
      )}
      <PostItemInfoSheet
        visible={infoItem !== null}
        brand={infoItem?.brand ?? ""}
        name={infoItem?.name ?? ""}
        price={infoItem?.price ?? null}
        imageUrl={infoItem?.imageUrl}
        onRequestClose={() => setInfoItem(null)}
        onSaveToAll={
          infoItem?.name && infoItem.url && post
            ? () => {
                returnItem.current = infoItem;
                setInfoItem(null);
                router.push({
                  pathname: "/posts/save",
                  params: { postId: post.id, itemId: infoItem.id },
                });
              }
            : undefined
        }
        onOpenWebsite={() => {
          const url = infoItem?.url;
          if (!url || !/^https:\/\//i.test(url)) {
            showToast("아이템 링크를 확인하고 다시 시도해 주세요.");
            return;
          }
          void Linking.openURL(url).catch(() =>
            showToast("아이템 페이지를 열지 못했습니다. 다시 시도해 주세요."),
          );
        }}
      />
      <ActionModal
        visible={isDeleteOpen}
        type="2Btn"
        title={post?.type === "vote" ? "투표글을 삭제하시겠습니까?" : "게시글을 삭제하시겠습니까?"}
        description="댓글도 함께 삭제되며 복구할 수 없습니다."
        primaryAction={{
          label: isDeleting ? "삭제 중…" : "삭제",
          onPress: () => void removePost(),
        }}
        secondaryAction={{
          label: "취소",
          onPress: () => {
            if (!deleting.current) setDeleteOpen(false);
          },
        }}
        onRequestClose={() => {
          if (!deleting.current) setDeleteOpen(false);
        }}
        overlay={
          deleteError ? (
            <View className="absolute bottom-12 self-center">
              <ToastText message={deleteError} variant="error" />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
