import { clsx } from "clsx";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { AppBar } from "@/components/app-bar";
import { BodyTextField, HelperText } from "@/components/Field";
import { LoadingDialog } from "@/components/LoadingDialog";
import { ActionModal } from "@/components/modal";
import { DIGGLE_TOAST_MESSAGES } from "@/constants/messages";
import { usePostDraft } from "@/contexts/PostDraftContext";
import { usePosts } from "@/contexts/PostsContext";
import { useToast } from "@/hooks/useToast";

import { MAX_ATTACH_COUNT, ProductAttachGrid } from "./components/ProductAttachGrid";

export function PostWriteScreen({ type = "all" }: { type?: "all" | "vote" }) {
  const router = useRouter();
  const showToast = useToast();
  const isVote = type === "vote";
  const maxAttachCount = isVote ? 1 : MAX_ATTACH_COUNT;
  const [body, setBody] = useState("");
  const [isBodyValid, setBodyValid] = useState(false);
  const { items, setItems, reset } = usePostDraft();
  const { addVotePreview } = usePosts();

  const [isExitOpen, setExitOpen] = useState(false);
  const [isSubmitPreview, setSubmitPreview] = useState(false);

  // UI 확인용 등록 흐름이다. API 연결 시 타이머와 메모리 추가를 실제 요청으로 교체한다.
  useEffect(() => {
    if (!isSubmitPreview) return;
    const timeout = setTimeout(() => {
      addVotePreview(body, items);
      setSubmitPreview(false);
      router.dismissTo({ pathname: "/(tabs)/diggle", params: { tab: "vote" } });
      showToast(DIGGLE_TOAST_MESSAGES.VOTE_009);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [isSubmitPreview, addVotePreview, body, items, router, showToast]);

  // 빈 상태에서는 안내를 띄우지 않음
  const hasBodyError = body.length > 0 && !isBodyValid;
  const canSubmit = isBodyValid && items.length > 0 && items.length <= maxAttachCount;
  const hasDraft = body.length > 0 || items.length > 0;

  // 아이템 선택은 push 라 이 화면이 살아 있음. 진짜로 내려갈 때만 비움
  useEffect(() => reset, [reset]);

  // 쓴 게 없으면 물어볼 것도 없으니 그냥 나간다.
  const leave = useCallback(() => {
    if (hasDraft) setExitOpen(true);
    else router.back();
  }, [hasDraft, router]);

  // 안드로이드 하드웨어 뒤로 가기로 확인을 건너뛸 수 없게 막는다.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!hasDraft) return false;
        setExitOpen(true);
        return true;
      });
      return () => subscription.remove();
    }, [hasDraft]),
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-gray-0"
    >
      <AppBar
        title={isVote ? "투표글 작성" : "게시글 작성"}
        onBack={leave}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || isSubmitPreview }}
            className="size-12 items-center justify-center active:opacity-75"
            disabled={!canSubmit || isSubmitPreview}
            onPress={() => {
              if (isVote) {
                Keyboard.dismiss();
                setSubmitPreview(true);
                return;
              }
              // TODO: 게시글 등록 API 로 본문과 아이템을 넘긴다.
              router.back();
            }}
          >
            <Text
              className={clsx(
                "font-label-16-semibold",
                canSubmit ? "text-gray-900" : "text-gray-400",
              )}
            >
              등록
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        className="px-margin"
        contentContainerStyle={{ gap: 24, paddingTop: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <BodyTextField
          size={isVote ? "compact" : "default"}
          placeholder={
            isVote
              ? "구매가 고민되는 아이템은 투표를 올려 의견을 받아보세요. (최소 5글자)"
              : "저장한 아이템에 대해 다른 사람들과 의견을 나누어 보세요. (최소 5글자)"
          }
          value={body}
          onChangeText={setBody}
          onValidityChange={setBodyValid}
        />

        {hasBodyError ? (
          <HelperText
            status="error"
            message="공백을 제외하고 5자 이상 입력해 주세요. (이모지 포함)"
          />
        ) : null}

        <View className="w-full gap-3">
          <View className="w-full flex-row items-center justify-between">
            <Text className="text-gray-900 font-label-14">아이템 첨부</Text>
            <Text className="text-gray-500 font-meta">
              {items.length}/{maxAttachCount}
            </Text>
          </View>
          <ProductAttachGrid
            items={items}
            maxCount={maxAttachCount}
            onPressAdd={() =>
              router.push(isVote ? "/posts/item-select?type=vote" : "/posts/item-select")
            }
            onRemove={(item) => setItems(items.filter((it) => it.id !== item.id))}
          />
          <View className={isVote && items.length > 0 ? "gap-1" : undefined}>
            <HelperText
              className={isVote ? "min-h-5" : undefined}
              message="위시 아이템만 첨부할 수 있습니다."
            />
            {isVote ? (
              <HelperText
                className="min-h-5"
                message="BUY / NOT 투표는 등록 후 24시간 뒤 자동으로 종료됩니다."
              />
            ) : null}
          </View>
        </View>
      </ScrollView>

      {isSubmitPreview ? <LoadingDialog message="투표를 등록하는 중입니다." /> : null}

      <ActionModal
        visible={isExitOpen}
        type="2Btn"
        title="작성을 그만두시겠습니까?"
        description="작성 중인 내용은 저장되지 않습니다."
        secondaryAction={{ label: "계속 작성", onPress: () => setExitOpen(false) }}
        primaryAction={{
          label: "나가기",
          onPress: () => {
            setExitOpen(false);
            router.back();
          },
        }}
        onRequestClose={() => setExitOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
