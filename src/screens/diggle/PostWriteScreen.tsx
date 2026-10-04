import { clsx } from "clsx";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { BodyTextField, HelperText } from "@/components/Field";
import { ActionModal } from "@/components/modal";
import { usePostDraft } from "@/contexts/PostDraftContext";

import { MAX_ATTACH_COUNT, ProductAttachGrid } from "./components/ProductAttachGrid";

export function PostWriteScreen() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isBodyValid, setBodyValid] = useState(false);
  const { items, setItems, reset } = usePostDraft();

  const [isExitOpen, setExitOpen] = useState(false);

  // 빈 상태에서는 안내를 띄우지 않음
  const showBodyError = body.length > 0 && !isBodyValid;
  const canSubmit = isBodyValid && items.length > 0;
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
    <View className="flex-1 bg-gray-0">
      <AppBar
        title="게시글 작성"
        onBack={leave}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            className="size-12 items-center justify-center active:opacity-75"
            disabled={!canSubmit}
            onPress={() => {
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
          placeholder="저장한 아이템에 대해 다른 사람들과 의견을 나누어 보세요. (최소 5글자)"
          value={body}
          onChangeText={setBody}
          onValidityChange={setBodyValid}
        />

        {showBodyError ? (
          <HelperText
            status="error"
            message="공백을 제외하고 5자 이상 입력해 주세요. (이모지 포함)"
          />
        ) : null}

        <View className="w-full gap-3">
          <View className="w-full flex-row items-center justify-between">
            <Text className="text-gray-900 font-label-14">아이템 첨부</Text>
            <Text className="text-gray-500 font-meta">
              {items.length}/{MAX_ATTACH_COUNT}
            </Text>
          </View>
          <ProductAttachGrid
            items={items}
            onPressAdd={() => router.push("/posts/item-select")}
            onRemove={(item) => setItems(items.filter((it) => it.id !== item.id))}
          />
          <HelperText message="위시 아이템만 첨부할 수 있습니다." />
        </View>
      </ScrollView>

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
    </View>
  );
}
