import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import KebabSvg from "@/assets/images/icon-kebab.svg";
import ReportSvg from "@/assets/images/icon-report.svg";
import { AppBar } from "@/components/app-bar";
import { Comment, type MenuAnchor } from "@/components/Comment";
import { CommentEditBanner } from "@/components/CommentEditBanner";
import { COMMENT_MAX_LENGTH, CommentInput } from "@/components/CommentInput";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import { ActionModal } from "@/components/modal";
import { colors } from "@/theme";
import type { PostComment, PostDetail, PostItem } from "@/types/post";

import { LikeCommentRow } from "./components/LikeCommentRow";
import { PostItemInfoSheet } from "./components/PostItemInfoSheet";
import { ProductImgGrid } from "./components/ProductImgGrid";
import { SaveToAllSheet } from "./components/SaveToAllSheet";

// TODO: API 연결 전까지 쓰는 임시 데이터.
const MOCK_POST: PostDetail = {
  id: "0",
  author: "디기",
  timeLabel: "N분 전",
  body: "본문 텍스트",
  items: [
    { id: "0", imageUrl: null },
    { id: "1", imageUrl: null },
  ],
  likeCount: 1,
  commentCount: 1,
  isLiked: false,
};

// TODO: API 연결 시 내 글 여부를 서버 값으로 바꾼다.
const IS_MY_POST = true;

const MOCK_COMMENTS: PostComment[] = [
  {
    id: "0",
    author: "디기 1 (나)",
    body: "저는 왼쪽이 더 예쁜 것 같아요!",
    timeLabel: "N분 전",
    isMine: true,
  },
  {
    id: "1",
    author: "(탈퇴한 사용자)",
    body: "",
    timeLabel: "N분 전",
    isMine: false,
    isDeleted: true,
  },
  {
    id: "2",
    author: "디기 2",
    body: "여기가 더 싸요 https://diggin.link/a1",
    timeLabel: "N분 전",
    isMine: false,
  },
];

export function PostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState(MOCK_POST);
  const [draft, setDraft] = useState("");
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [editingComment, setEditingComment] = useState<PostComment | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [isPostMenuOpen, setPostMenuOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [infoItem, setInfoItem] = useState<PostItem | null>(null);
  const [isSaveOpen, setSaveOpen] = useState(false);

  const isTooLong = draft.length > COMMENT_MAX_LENGTH;
  const menuComment = MOCK_COMMENTS.find((comment) => comment.id === menuCommentId);

  function startEdit(comment: PostComment) {
    setMenuCommentId(null);
    setEditingComment(comment);
    setDraft(comment.body);
    inputRef.current?.focus();
  }

  function cancelEdit() {
    setEditingComment(null);
    setDraft("");
    inputRef.current?.blur();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-gray-0"
    >
      <AppBar
        left="back"
        onBack={() => router.back()}
        right={
          IS_MY_POST ? (
            <Pressable
              accessibilityLabel="게시글 메뉴"
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
              onPress={() => {}}
            >
              <ReportSvg width={18} height={18} color={colors.gray[400]} />
            </Pressable>
          )
        }
      />

      <ScrollView keyboardShouldPersistTaps="handled">
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
            <ProductImgGrid items={post.items} onPressInfo={setInfoItem} />
          </View>

          <LikeCommentRow
            likeCount={post.likeCount}
            commentCount={post.commentCount}
            isLiked={post.isLiked}
            onPressLike={() => setPost((prev) => ({ ...prev, isLiked: !prev.isLiked }))}
          />
        </View>

        <View className="h-3 w-full bg-gray-100" />

        {MOCK_COMMENTS.map((comment) => (
          <Comment
            key={comment.id}
            author={comment.author}
            body={comment.body}
            timeLabel={comment.timeLabel}
            isDeleted={comment.isDeleted}
            isHighlighted={menuCommentId === comment.id || editingComment?.id === comment.id}
            onPressMenu={(anchor) => {
              setMenuAnchor(anchor);
              setMenuCommentId(comment.id);
            }}
          />
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
                onDelete={() => setMenuCommentId(null)}
              />
            ) : (
              <FloatingToolbar onReport={() => setMenuCommentId(null)} />
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
          setSaveOpen(true);
        }}
        onRequestClose={() => setInfoItem(null)}
      />

      <SaveToAllSheet
        key={isSaveOpen ? "open" : "closed"}
        visible={isSaveOpen}
        initialValues={{
          name: "Real Good Pants 엄청 좋은 바지",
          price: "70000",
          sourceUrl: "http://pf.kakao.com/_zIxnrX",
          thumbnailUrl: null,
          folder: "기본 폴더",
        }}
        onPressFolder={() => {}}
        onSubmit={() => setSaveOpen(false)}
        onRequestClose={() => setSaveOpen(false)}
      />

      <ActionModal
        visible={isDeleteOpen}
        type="2Btn"
        title="게시글을 삭제하시겠습니까?"
        description={"삭제한 게시글은 복구할 수 없습니다.\n게시글의 댓글도 함께 삭제됩니다."}
        secondaryAction={{ label: "취소", onPress: () => setDeleteOpen(false) }}
        primaryAction={{ label: "삭제하기", onPress: () => setDeleteOpen(false) }}
        onRequestClose={() => setDeleteOpen(false)}
      />

      <View className="w-full">
        {editingComment ? <CommentEditBanner onCancel={cancelEdit} /> : null}
        <CommentInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          errorMessage={isTooLong ? "댓글은 1~30자로 입력해 주세요." : undefined}
          onSend={() => {
            setDraft("");
            setEditingComment(null);
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
