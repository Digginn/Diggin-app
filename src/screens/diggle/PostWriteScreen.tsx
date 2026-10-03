import { clsx } from "clsx";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { BodyTextField, HelperText } from "@/components/Field";
import { ActionModal } from "@/components/modal";
import type { PostItem } from "@/types/post";

import { MAX_ATTACH_COUNT, ProductAttachGrid } from "./components/ProductAttachGrid";

export function PostWriteScreen() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isBodyValid, setBodyValid] = useState(false);
  // TODO: 아이템 선택 화면에서 돌려받는 건 전역 상태가 정해지면 연결한다.
  const [items, setItems] = useState<PostItem[]>([]);

  const [isExitOpen, setExitOpen] = useState(false);

  // 빈 상태에서는 안내를 띄우지 않음
  const showBodyError = body.length > 0 && !isBodyValid;
  const canSubmit = isBodyValid && items.length > 0;
  const hasDraft = body.length > 0 || items.length > 0;

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
            onPress={() => router.back()}
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
            onRemove={(item) => setItems((prev) => prev.filter((it) => it.id !== item.id))}
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
