import { BlurTargetView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import KebabSvg from "@/assets/images/icon-kebab.svg";
import ReportSvg from "@/assets/images/icon-report.svg";
import { AppBar } from "@/components/app-bar";
import { Comment, type MenuAnchor } from "@/components/Comment";
import { CommentEditBanner } from "@/components/CommentEditBanner";
import { COMMENT_MAX_LENGTH, CommentInput } from "@/components/CommentInput";
import { EmptyState } from "@/components/EmptyState";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import { ActionModal } from "@/components/modal";
import { ProductImg } from "@/components/ProductImg";
import { ReportFlow, type ReportTarget } from "@/components/ReportFlow";
import { DIGGLE_TOAST_MESSAGES, TOAST_MESSAGES } from "@/constants/messages";
import { useBlockedUsers } from "@/contexts/BlockedUsersContext";
import { usePosts } from "@/contexts/PostsContext";
import { useToast } from "@/hooks/useToast";
import {
  FolderManageSheet,
  type ManagedFolder,
} from "@/screens/item-detail/components/FolderManageSheet";
import { colors } from "@/theme";
import type { PostComment, PostItem, VoteChoice } from "@/types/post";

import { LikeCommentRow } from "./components/LikeCommentRow";
import { PostItemInfoSheet } from "./components/PostItemInfoSheet";
import { ProductImgGrid } from "./components/ProductImgGrid";
import { SaveToAllSheet, type SaveToAllValues } from "./components/SaveToAllSheet";
import { VoteBlock } from "./components/VoteBlock";
import { VoteReasonScreen } from "./components/VoteReasonScreen";
import {
  CURRENT_USER_ID,
  findMockComments,
  DEFAULT_FOLDER_ID,
  findMockVoteComments,
  MOCK_FOLDERS,
  MOCK_POSTS,
} from "./constants/mockPosts";
import { getVoteTiming } from "./utils/voteTiming";

// TODO: API 연결 시 아이템 상세 조회 응답으로 채운다.
const SAVE_INITIAL_VALUES: SaveToAllValues = {
  name: "Real Good Pants 엄청 좋은 바지",
  price: "70000",
  sourceUrl: "http://pf.kakao.com/_zIxnrX",
  thumbnailUrl: null,
  wishLevel: null,
};

export function PostDetailScreen({ type = "all" }: { type?: "all" | "vote" }) {
  const isVote = type === "vote";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useToast();
  const { isBlocked, block } = useBlockedUsers();
  const { findPost, deletePost, votes, chooseVote, deleteVote } = usePosts();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [storedPost, setPost] = useState(() => findPost(id) ?? MOCK_POSTS[0]);
  const vote = votes.find((item) => item.id === id);
  const post = isVote && vote ? vote : storedPost;
  const [comments, setComments] = useState(() =>
    isVote ? findMockVoteComments(id) : findMockComments(id),
  );
  const [draft, setDraft] = useState("");
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [editingComment, setEditingComment] = useState<PostComment | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const hasPendingReasonScroll = useRef(false);
  // 댓글마다 ScrollView 안에서의 y 좌표. 수정할 때 그 댓글로 스크롤하는 데 쓴다.
  const commentOffsets = useRef<Record<string, number>>({});
  const [isPostMenuOpen, setPostMenuOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  // 삭제 확인을 받는 동안 어떤 댓글이었는지 들고 있는다.
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [infoItem, setInfoItem] = useState<PostItem | null>(null);
  // 내 ALL에 저장은 정보 입력 -> 폴더 선택 두 단계로 이어진다.
  const [saveStep, setSaveStep] = useState<"form" | "folder" | null>(null);
  const [saveValues, setSaveValues] = useState<SaveToAllValues>(SAVE_INITIAL_VALUES);
  const [folders, setFolders] = useState<ManagedFolder[]>(MOCK_FOLDERS);
  const [reasonChoice, setReasonChoice] = useState<VoteChoice | null>(null);
  const blurTargetRef = useRef<View>(null);

  const isTooLong = draft.length > COMMENT_MAX_LENGTH;
  const menuComment = comments.find((comment) => comment.id === menuCommentId);
  const visibleComments = comments.filter((comment) => !isBlocked(comment.authorId));
  const isMyPost = post.authorId === CURRENT_USER_ID;

  function getMyCommentAuthor() {
    if (isMyPost) return "글쓴이 (나)";
    const existingAuthor = comments.find((comment) => comment.authorId === CURRENT_USER_ID)?.author;
    const anonymousAuthors = new Set(
      comments
        .filter((comment) => comment.authorId !== post.authorId)
        .map((comment) => comment.authorId),
    );
    return existingAuthor ?? `디기 ${anonymousAuthors.size + 1} (나)`;
  }

  function closeSave() {
    setSaveStep(null);
    setSaveValues(SAVE_INITIAL_VALUES);
  }

  function startEdit(comment: PostComment) {
    setMenuCommentId(null);
    setEditingComment(comment);
    setDraft(comment.body);
    inputRef.current?.focus();
    // 수정 배너가 그려진 뒤에 옮겨야 자리가 어긋나지 않는다.
    requestAnimationFrame(() => {
      const y = commentOffsets.current[comment.id];
      if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
    });
  }

  function deleteComment() {
    setComments((prev) => prev.filter((comment) => comment.id !== deletingCommentId));
    setDeletingCommentId(null);
  }

  function submitComment() {
    const body = draft.trim();
    if (!body) return;

    if (editingComment) {
      const targetId = editingComment.id;
      setComments((prev) =>
        prev.map((comment) => (comment.id === targetId ? { ...comment, body } : comment)),
      );
    } else {
      // TODO: 댓글 등록 API 연결. 지금은 화면 안에서만 더한다.
      setComments((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          authorId: CURRENT_USER_ID,
          author: getMyCommentAuthor(),
          body,
          timeLabel: "방금 전",
          isMine: true,
        },
      ]);
    }

    setDraft("");
    setEditingComment(null);
    inputRef.current?.blur();
  }

  // 글쓴이를 차단하면 이 게시글은 더 볼 수 없다
  function handleBlock(authorId: string) {
    block(authorId);
    showToast(DIGGLE_TOAST_MESSAGES.REPORT_004);
    if (authorId === post.authorId) router.back();
  }

  function cancelEdit() {
    setEditingComment(null);
    setDraft("");
    inputRef.current?.blur();
  }

  function closeReason() {
    Keyboard.dismiss();
    setReasonChoice(null);
  }

  function confirmReasonChoice() {
    if (!vote || !reasonChoice || vote.isClosed || getVoteTiming(vote.createdAt).isClosed) {
      closeReason();
      return false;
    }
    chooseVote(vote.id, reasonChoice);
    return true;
  }

  function skipReason() {
    confirmReasonChoice();
    closeReason();
  }

  function submitReason(body: string) {
    if (!confirmReasonChoice()) return;
    // UI 미리보기: 이유를 현재 화면의 익명 댓글에 추가한다. API 연결 시 교체한다.
    hasPendingReasonScroll.current = true;
    setComments((prev) => [
      ...prev,
      {
        id: `reason-${Date.now()}`,
        authorId: CURRENT_USER_ID,
        author: getMyCommentAuthor(),
        body,
        timeLabel: "방금 전",
        isMine: true,
        vote: reasonChoice === "BUY" ? "buy" : "not",
      },
    ]);
    closeReason();
  }

  if (isVote && !vote) {
    return (
      <View className="flex-1 bg-gray-0">
        <AppBar left="back" onBack={() => router.back()} />
        <EmptyState variant="vote" message="투표글을 찾을 수 없습니다." />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <BlurTargetView
        ref={blurTargetRef}
        style={{ flex: 1 }}
        importantForAccessibility={reasonChoice ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={reasonChoice !== null}
      >
        <View
          className="flex-1"
          pointerEvents={reasonChoice ? "none" : "auto"}
          importantForAccessibility={reasonChoice ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={reasonChoice !== null}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="bg-gray-0"
            // NativeWind의 flex가 키보드 회피 중 내부 flex: 0을 덮지 않게 한다.
            style={{ flex: 1 }}
          >
            <AppBar
              left="back"
              onBack={() => router.back()}
              right={
                isMyPost ? (
                  <Pressable
                    accessibilityLabel={isVote ? "투표글 메뉴" : "게시글 메뉴"}
                    accessibilityRole="button"
                    className="size-12 items-center justify-center active:opacity-75"
                    onPress={() => setPostMenuOpen(true)}
                  >
                    <KebabSvg width={16} height={16} color={colors.gray[900]} />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityLabel="신고하기"
                    accessibilityRole="button"
                    className="h-[52px] w-[55px] items-center justify-center active:opacity-75"
                    onPress={() => setReportTarget({ authorId: post.authorId })}
                  >
                    <ReportSvg width={18} height={18} color={colors.gray[400]} />
                  </Pressable>
                )
              }
            />

            <ScrollView
              ref={scrollRef}
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => {
                if (!hasPendingReasonScroll.current) return;
                hasPendingReasonScroll.current = false;
                scrollRef.current?.scrollToEnd({ animated: true });
              }}
            >
              <View className="w-full justify-center px-margin">
                <View className="w-full flex-row items-center">
                  <View className="flex-row items-center gap-1">
                    <Text className="text-gray-800 font-label-16-semibold">{post.author}</Text>
                    <Text className="text-gray-500 font-b1">·</Text>
                    <Text className="text-gray-500 font-b4">{post.timeLabel}</Text>
                  </View>
                </View>
              </View>

              <View className="w-full items-start gap-2.5 pt-2">
                <View className="w-full flex-row items-center px-margin">
                  <Text className="w-full text-gray-800 font-b3">{post.body}</Text>
                </View>

                <View className="w-full px-margin">
                  {isVote ? (
                    <ProductImg
                      url={post.items[0]?.imageUrl}
                      onPressInfo={() => {
                        const item = post.items[0];
                        if (item) router.push(`/items/${item.id}`);
                      }}
                    />
                  ) : (
                    <ProductImgGrid items={post.items} onPressInfo={setInfoItem} />
                  )}
                </View>

                {isVote && vote ? (
                  <VoteBlock
                    vote={vote}
                    isMyVote={isMyPost}
                    onChoose={(choice) => {
                      if (isMyPost) showToast(DIGGLE_TOAST_MESSAGES.VOTE_002);
                      else if (
                        !vote.isClosed &&
                        !getVoteTiming(vote.createdAt).isClosed &&
                        vote.myChoice !== choice
                      ) {
                        Keyboard.dismiss();
                        setReasonChoice(choice);
                      }
                    }}
                  />
                ) : null}

                <LikeCommentRow
                  likeCount={post.likeCount}
                  commentCount={isVote ? comments.length : post.commentCount}
                  isLiked={post.isLiked}
                  onPressLike={() => setPost((prev) => ({ ...prev, isLiked: !prev.isLiked }))}
                  hasLike={!isVote}
                />
              </View>

              <View className="h-3 w-full bg-gray-100" />

              {visibleComments.map((comment) => (
                <View
                  key={comment.id}
                  onLayout={(event) => {
                    commentOffsets.current[comment.id] = event.nativeEvent.layout.y;
                  }}
                >
                  <Comment
                    author={comment.author}
                    body={comment.body}
                    timeLabel={comment.timeLabel}
                    vote={comment.vote}
                    isDeleted={comment.isDeleted}
                    isHighlighted={
                      menuCommentId === comment.id || editingComment?.id === comment.id
                    }
                    onPressMenu={(anchor) => {
                      setMenuAnchor(anchor);
                      setMenuCommentId(comment.id);
                    }}
                  />
                </View>
              ))}
            </ScrollView>

            {menuComment ? (
              <>
                <Pressable
                  accessibilityLabel="메뉴 닫기"
                  className="absolute inset-0"
                  onPress={() => setMenuCommentId(null)}
                />
                <View
                  className="absolute right-margin"
                  style={{ top: (menuAnchor?.y ?? 0) + (menuAnchor?.height ?? 0) - 6 }}
                >
                  {menuComment.isMine ? (
                    <FloatingToolbar
                      onEdit={() => startEdit(menuComment)}
                      onDelete={() => {
                        setDeletingCommentId(menuComment.id);
                        setMenuCommentId(null);
                      }}
                    />
                  ) : (
                    <FloatingToolbar
                      onReport={() => {
                        setReportTarget({ authorId: menuComment.authorId });
                        setMenuCommentId(null);
                      }}
                    />
                  )}
                </View>
              </>
            ) : null}

            {isPostMenuOpen ? (
              <>
                <Pressable
                  accessibilityLabel="메뉴 닫기"
                  className="absolute inset-0"
                  onPress={() => setPostMenuOpen(false)}
                />
                <View className="absolute right-margin" style={{ top: insets.top + 50 }}>
                  <FloatingToolbar
                    onDelete={() => {
                      setPostMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                  />
                </View>
              </>
            ) : null}

            <PostItemInfoSheet
              visible={infoItem !== null}
              // TODO: API 연결 시 아이템 상세 정보를 받아 넣는다.
              brand="브랜드명"
              name="Real Good Pants 엄청 좋은 바지"
              price={70000}
              imageUrl={infoItem?.imageUrl}
              onOpenWebsite={() => setInfoItem(null)}
              onSaveToAll={() => {
                setInfoItem(null);
                setSaveValues(SAVE_INITIAL_VALUES);
                setSaveStep("form");
              }}
              onRequestClose={() => setInfoItem(null)}
            />

            {/* 폴더 선택 단계에서도 뒤에 깔려 있어야 해서 두 단계 모두 띄워 둔다. */}
            <SaveToAllSheet
              visible={saveStep !== null}
              values={saveValues}
              onChange={setSaveValues}
              onNext={() => setSaveStep("folder")}
              onRequestClose={closeSave}
              overlay={
                saveStep === "folder" ? (
                  <FolderManageSheet
                    title="저장할 폴더 선택"
                    completeLabel="저장하기"
                    folders={folders}
                    selectedFolderIds={[DEFAULT_FOLDER_ID]}
                    onBack={() => setSaveStep("form")}
                    // 2단계를 닫은 것이라 1단계로 돌아간다. 적어둔 정보를 날리지 않는다.
                    onClose={() => setSaveStep("form")}
                    onCreateFolder={(name) => {
                      // TODO: 폴더 생성 API 연결.
                      const folder = { id: `folder-${Date.now()}`, name };
                      setFolders((prev) => [folder, ...prev]);
                      return folder;
                    }}
                    onComplete={() => {
                      // TODO: 내 ALL에 저장 API 연결.
                      closeSave();
                      showToast(TOAST_MESSAGES.SAVE_011);
                    }}
                  />
                ) : undefined
              }
            />

            <ReportFlow
              target={reportTarget}
              onClose={() => setReportTarget(null)}
              onBlock={handleBlock}
            />

            <ActionModal
              visible={deletingCommentId !== null}
              type="2Btn"
              title="댓글을 삭제하시겠습니까?"
              description="삭제한 댓글은 복구할 수 없습니다."
              secondaryAction={{ label: "취소", onPress: () => setDeletingCommentId(null) }}
              primaryAction={{ label: "삭제하기", onPress: deleteComment }}
              onRequestClose={() => setDeletingCommentId(null)}
            />

            <ActionModal
              visible={isDeleteOpen}
              type="2Btn"
              title={isVote ? "투표글을 삭제하시겠습니까?" : "게시글을 삭제하시겠습니까?"}
              description={
                isVote
                  ? "삭제한 투표글은 복구할 수 없습니다.\n투표글의 댓글도 함께 삭제됩니다."
                  : "삭제한 게시글은 복구할 수 없습니다.\n게시글의 댓글도 함께 삭제됩니다."
              }
              secondaryAction={{ label: "취소", onPress: () => setDeleteOpen(false) }}
              primaryAction={{
                label: "삭제하기",
                onPress: () => {
                  // TODO: 게시글 삭제 API 연결.
                  setDeleteOpen(false);
                  if (isVote) deleteVote(post.id);
                  else deletePost(post.id);
                  showToast(DIGGLE_TOAST_MESSAGES.DIGGLE_009);
                  router.back();
                },
              }}
              onRequestClose={() => setDeleteOpen(false)}
            />

            <View className="w-full">
              {editingComment ? <CommentEditBanner onCancel={cancelEdit} /> : null}
              <CommentInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                errorMessage={isTooLong ? "댓글은 1~30자로 입력해 주세요." : undefined}
                onSend={submitComment}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </BlurTargetView>
      {reasonChoice && vote && !vote.isClosed ? (
        <VoteReasonScreen
          key={reasonChoice}
          choice={reasonChoice}
          blurTarget={blurTargetRef}
          onClose={closeReason}
          onSkip={skipReason}
          onSubmit={submitReason}
        />
      ) : null}
    </View>
  );
}
