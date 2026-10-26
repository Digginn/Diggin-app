import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  type TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { restrictionMessage } from "@/api/accountAccess";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { Comment, type MenuAnchor } from "@/components/Comment";
import { CommentEditBanner } from "@/components/CommentEditBanner";
import { CommentInput } from "@/components/CommentInput";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import { Spinner } from "@/components/Loading";
import { ActionModal, LoginRequiredModal } from "@/components/modal";
import { ReportFlow, type ReportTarget } from "@/components/ReportFlow";
import { ToastText } from "@/components/ToastText";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { startLogin } from "@/lib/loginIntent";
import { normalizeText } from "@/utils/text";

import { COMMUNITY_PAGE_SIZE, communityKeys } from "./api/community";
import { communityWriteError, deleteCommunityPost } from "./api/communityWrite";
import { LikeCommentRow } from "./components/LikeCommentRow";
import { PostItemInfoSheet } from "./components/PostItemInfoSheet";
import { ProductImgGrid } from "./components/ProductImgGrid";
import { VoteBlock } from "./components/VoteBlock";
import { mergeComments } from "./domain/comments";
import { useCommentActions } from "./hooks/useCommentActions";
import { useCommunityLike } from "./hooks/useCommunityLike";
import { useCommunityVote } from "./hooks/useCommunityVote";
import { useCommunityVoteTiming } from "./hooks/useCommunityVoteTiming";
import { useCommunityComments, useCommunityPost } from "./queries/useCommunity";
import type { CommunityComment, CommunityItem } from "./types/community";
import { communityErrorMessage, formatCommunityTime } from "./utils/formatCommunityTime";

export function PostDetailScreen({ type = "all" }: { type?: "all" | "vote" }) {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const router = useRouter();
  const { session, isRestoring } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteIsRestricted, setDeleteRestricted] = useState(false);
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
  const vote = useCommunityVote(post, session?.user.id ?? null, voteTiming?.isClosed ?? false);
  const comments = useCommunityComments(id, !!post && !isWrongRoute);
  const actions = useCommentActions(id, session?.user.id ?? null);
  const like = useCommunityLike(post, session?.user.id ?? null);
  const commentRows = useMemo(
    () => mergeComments(comments.data?.pages.flat() ?? [], actions.changes),
    [comments.data, actions.changes],
  );
  const listRef = useRef<FlatList<CommunityComment>>(null);
  const shouldRevealNewComment = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [isKeyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const [menu, setMenu] = useState<{ comment: CommunityComment; anchor: MenuAnchor } | null>(null);
  const isBusy = isDeleting || actions.isSending || actions.isDeleting;
  usePreventRemove(isBusy, () => {});
  const scrollEditing = useCallback(() => {
    const index = commentRows.findIndex((row) => row.id === actions.editing?.id);
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 1 });
  }, [commentRows, actions.editing?.id]);
  useEffect(() => {
    if (!actions.editing) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      scrollEditing();
    });
    return () => cancelAnimationFrame(frame);
  }, [actions.editing, scrollEditing]);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setKeyboardVisible(true);
        requestAnimationFrame(scrollEditing);
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollEditing]);
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
  const goBack = () => {
    if (!isBusy) {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/diggle");
    }
  };

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
      if (returnTo === "my-posts")
        router.dismissTo({
          pathname: "/my-posts",
          params: { tab: post.type === "vote" ? "votes" : "posts" },
        });
      else if (returnTo === "liked") router.dismissTo("/my-liked-posts");
      else
        router.dismissTo({
          pathname: "/(tabs)/diggle",
          params: { tab: post.type === "vote" ? "vote" : "all" },
        });
      showToast(post.type === "vote" ? "투표글이 삭제되었습니다." : "게시글이 삭제되었습니다.");
    } catch (error) {
      if (currentViewer.current === viewer) {
        setDeleteError(communityWriteError(error));
        setDeleteRestricted(!!restrictionMessage(error));
      }
    } finally {
      deleting.current = false;
      setDeleting(false);
    }
  }

  async function sendComment() {
    const viewer = session?.user.id ?? null;
    const wasEditing = !!actions.editing;
    const saved = await actions.send();
    if (!saved || currentViewer.current !== viewer) return;
    Keyboard.dismiss();
    if (wasEditing) return;
    shouldRevealNewComment.current = true;
    // 새 댓글까지의 기존 페이지를 먼저 읽어 중간 대화가 생략되지 않게 한다.
    let data = queryClient.getQueryData<InfiniteData<CommunityComment[]>>(
      communityKeys.comments(viewer, id),
    );
    let hasStalled = false;
    while (
      data?.pages.at(-1)?.length === COMMUNITY_PAGE_SIZE &&
      !data.pages.some((page) => page.some((row) => row.id === saved.id))
    ) {
      const previousCursor = data.pages.at(-1)?.at(-1)?.id;
      const next = await comments.fetchNextPage({ cancelRefetch: false });
      if (currentViewer.current !== viewer || next.isError || !next.data) break;
      data = next.data;
      if (data.pages.at(-1)?.at(-1)?.id === previousCursor) {
        if (hasStalled) break;
        hasStalled = true;
      } else hasStalled = false;
    }
    if (currentViewer.current === viewer)
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  // 댓글 조회가 끝난 뒤 실패마다 한 번만 정한다. 댓글 영역이 다시 시도로 알리면 토스트는 띄우지 않는다(CMT-006).
  const toastedPostError = useRef<number | null>(null);
  useEffect(() => {
    if (!result.error || !post || comments.isFetching) return;
    if (toastedPostError.current === result.errorUpdatedAt) return;
    toastedPostError.current = result.errorUpdatedAt;
    if (!comments.isError) showToast(communityErrorMessage(result.error));
  }, [result.error, result.errorUpdatedAt, post, comments.isFetching, comments.isError, showToast]);

  useEffect(() => {
    if (!isRestoring && session && post && isWrongRoute) {
      router.replace({
        pathname: post.type === "vote" ? "/votes/[id]" : "/posts/[id]",
        params: { id: post.id, ...(returnTo ? { returnTo } : {}) },
      });
    }
  }, [isRestoring, session, post, isWrongRoute, router, returnTo]);

  if (!isRestoring && !session)
    return (
      <View className="flex-1 bg-gray-0">
        <AppBar left="back" onBack={goBack} />
        <LoginRequiredModal
          visible={isLoginPromptVisible}
          onClose={goBack}
          onLogin={() => {
            setLoginPromptVisible(false);
            startLogin(router);
          }}
        />
      </View>
    );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      className="bg-gray-0"
    >
      <AppBar
        left="back"
        onBack={goBack}
        isDisabled={infoItem !== null || isBusy}
        right={
          post?.isMine && !isWrongRoute ? (
            <AppBar.TextButton
              disabled={isBusy || infoItem !== null}
              onPress={() => {
                setDeleteError("");
                setDeleteOpen(true);
              }}
            >
              삭제
            </AppBar.TextButton>
          ) : post && !isWrongRoute ? (
            <AppBar.TextButton
              disabled={isBusy || infoItem !== null}
              onPress={() => setReportTarget({ type: "post", id: post.id })}
            >
              신고
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
        result.isError ? (
          <ErrorState
            message={communityErrorMessage(result.error)}
            onRetry={() => void result.refetch()}
          />
        ) : (
          <EmptyState
            variant={type === "vote" ? "vote" : "post"}
            message="게시글을 찾을 수 없습니다."
          />
        )
      ) : (
        <FlatList
          ref={listRef}
          className="flex-1"
          data={commentRows}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            shouldRevealNewComment.current = false;
            setMenu(null);
          }}
          onContentSizeChange={() => {
            if (shouldRevealNewComment.current) listRef.current?.scrollToEnd({ animated: true });
          }}
          onLayout={() => {
            if (actions.editing) scrollEditing();
            else if (shouldRevealNewComment.current)
              listRef.current?.scrollToEnd({ animated: true });
          }}
          onScrollToIndexFailed={({ averageItemLength, index }) =>
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })
          }
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
                    isReadOnly={vote.isPending}
                    onChoose={(choice) => void vote.choose(choice)}
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
              <LikeCommentRow
                likeCount={like.likeCount}
                commentCount={post.commentCount ?? 0}
                isLiked={like.isLiked}
                hasLike={post.type === "post"}
                // 본인 글은 좋아요를 누를 수 없다(BUG-074). 개수는 계속 보여 준다.
                onPressLike={
                  post.type === "post" && !post.isMine && !like.isPending
                    ? () => void like.toggle()
                    : undefined
                }
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
              body={normalizeText(comment.body ?? "").replace(/\n/g, " ")}
              timeLabel={formatCommunityTime(comment.createdAt)}
              isDeleted={comment.isWithdrawn}
              onPressReport={
                !comment.isMine && !comment.isWithdrawn && !isBusy
                  ? () => {
                      Keyboard.dismiss();
                      setReportTarget({ type: "comment", id: comment.id });
                    }
                  : undefined
              }
              isHighlighted={actions.editing?.id === comment.id}
              onPressMenu={
                comment.isMine && !comment.isWithdrawn && !isBusy
                  ? (anchor) => {
                      shouldRevealNewComment.current = false;
                      Keyboard.dismiss();
                      setMenu({ comment, anchor });
                    }
                  : undefined
              }
              onOpenLink={(url) =>
                void Linking.openURL(url).catch(() =>
                  showToast("링크를 열지 못했습니다. 다시 시도해 주세요.", "error"),
                )
              }
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
                    댓글을 불러올 수 없습니다. 다시 시도해 주세요.
                  </Text>
                  <View className="w-[156px]">
                    <Button
                      accessibilityLabel="댓글 다시 불러오기"
                      isDisabled={comments.isFetching}
                      onPress={() => {
                        if (comments.isFetchNextPageError)
                          void comments.fetchNextPage({ cancelRefetch: false });
                        else void comments.refetch();
                      }}
                    >
                      다시 시도
                    </Button>
                  </View>
                </View>
              )}
            </>
          }
        />
      )}
      {post && !isWrongRoute && !isRestoring && session && (
        <View>
          {actions.editing && (
            <CommentEditBanner
              onCancel={() => {
                if (!isBusy) {
                  actions.cancelEditing();
                  Keyboard.dismiss();
                }
              }}
            />
          )}
          <CommentInput
            ref={inputRef}
            value={actions.body}
            onChangeText={actions.setBody}
            isDisabled={isBusy}
            bottomInset={isKeyboardVisible ? 12 : Math.max(insets.bottom, 12)}
            isEditing={!!actions.editing}
            onSend={() => void sendComment()}
          />
        </View>
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
      <ReportFlow
        target={reportTarget}
        onClose={() => {
          setReportTarget(null);
          if (!post) goBack();
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
              <ToastText message={deleteError} variant={deleteIsRestricted ? "notice" : "error"} />
            </View>
          ) : undefined
        }
      />
      <ActionModal
        visible={actions.deleteTarget !== null}
        type="2Btn"
        title="댓글을 삭제하시겠습니까?"
        primaryAction={{
          label: actions.isDeleting ? "삭제 중…" : "삭제",
          onPress: () => void actions.remove(),
        }}
        secondaryAction={{ label: "취소", onPress: actions.cancelDelete }}
        onRequestClose={actions.cancelDelete}
        overlay={
          actions.deleteError ? (
            <View className="absolute bottom-12 self-center">
              <ToastText
                message={actions.deleteError}
                variant={actions.deleteIsRestricted ? "notice" : "error"}
              />
            </View>
          ) : undefined
        }
      />
      {menu && (
        <View className="absolute inset-0">
          <Pressable
            accessibilityLabel="댓글 메뉴 닫기"
            accessibilityRole="button"
            className="absolute inset-0"
            onPress={() => setMenu(null)}
          />
          <View
            className="absolute right-margin"
            style={{
              top: Math.max(
                insets.top + 56,
                Math.min(menu.anchor.y - 44, height - insets.bottom - 96),
              ),
            }}
          >
            <FloatingToolbar
              onEdit={() => {
                actions.startEditing(menu.comment);
                setMenu(null);
              }}
              onDelete={() => {
                actions.confirmDelete(menu.comment);
                setMenu(null);
              }}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
