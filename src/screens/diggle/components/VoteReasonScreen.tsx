import { clsx } from "clsx";
import { BlurView } from "expo-blur";
import { type RefObject, useEffect, useState } from "react";
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import CloseSvg from "@/assets/images/icon-vote-reason-close.svg";
import { Button } from "@/components/Button";
import { COMMENT_MAX_LENGTH } from "@/components/CommentInput";
import { colors, typography } from "@/theme";
import type { VoteChoice } from "@/types/post";

type VoteReasonScreenProps = {
  choice: VoteChoice;
  blurTarget: RefObject<View | null>;
  onClose: () => void;
  onSkip: () => void;
  onSubmit: (body: string) => void;
};

export function VoteReasonScreen({
  choice,
  blurTarget,
  onClose,
  onSkip,
  onSubmit,
}: VoteReasonScreenProps) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [isKeyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [isFocused, setFocused] = useState(false);
  const count = Array.from(splitGraphemes(reason)).length;
  const canSubmit = reason.trim().length > 0 && count <= COMMENT_MAX_LENGTH;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => {
      show.remove();
      hide.remove();
      back.remove();
    };
  }, [onClose]);

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurView"
        intensity={10}
        tint="systemUltraThinMaterialLight"
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
      />
      <View className="absolute inset-0 bg-gray-0 opacity-[0.88]" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          className="h-14 flex-row items-center justify-end pr-2"
          style={{ marginTop: insets.top }}
        >
          <Pressable
            accessibilityLabel="이유 입력 닫기"
            accessibilityRole="button"
            className="size-12 items-center justify-center"
            onPress={onClose}
          >
            <View className="size-6 items-center justify-center">
              <CloseSvg />
            </View>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="gap-3 px-margin pt-1.5">
            <View
              className={clsx(
                "self-start rounded-full px-2.5 py-[5px]",
                choice === "BUY" ? "bg-gray-900" : "bg-gray-200",
              )}
            >
              <Text
                className={clsx(
                  "font-label-12-semibold",
                  choice === "BUY" ? "text-gray-0" : "text-gray-800",
                )}
              >
                {choice}에 투표함
              </Text>
            </View>
            <Text className="text-gray-900 font-h2">
              {choice}
              {choice === "BUY" ? "를" : "을"} 선택한 이유를{"\n"}알려 주세요.
            </Text>
            <Text className="text-gray-500 font-b3">입력한 이유는 익명 댓글로 공개됩니다.</Text>
            <View
              className={clsx(
                "mt-6 justify-between rounded-xl bg-gray-reason-background px-4 pb-3 pt-3.5",
                isKeyboardVisible ? "h-24" : "h-32",
                isFocused && isKeyboardVisible
                  ? "border-field border-gray-900"
                  : "border border-gray-reason-border",
              )}
            >
              <TextInput
                accessibilityLabel="투표 이유"
                className="min-h-0 flex-1 p-0 text-gray-900 font-b2-input"
                style={{
                  lineHeight: typography.b2.size * typography.b2.ratio,
                  textAlignVertical: "top",
                }}
                multiline
                placeholder="이유를 입력해 주세요. (최대 30자)"
                placeholderTextColor={colors.gray[400]}
                value={reason}
                onChangeText={(value) =>
                  setReason(Array.from(splitGraphemes(value)).slice(0, COMMENT_MAX_LENGTH).join(""))
                }
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
              <Text className="mt-1.5 self-end text-gray-500 font-label-12-regular">
                {count}/{COMMENT_MAX_LENGTH}
              </Text>
            </View>
          </View>
          <View className="mt-[21px] items-center gap-4 px-margin py-3">
            <Button
              size="large"
              isDisabled={!canSubmit}
              onPress={() => {
                if (canSubmit) onSubmit(reason.trim());
              }}
            >
              의견 남기기
            </Button>
            <Pressable
              accessibilityRole="button"
              className="h-12 min-w-12 items-center justify-center"
              onPress={onSkip}
            >
              <Text className="text-gray-500 underline font-b3">이번엔 스킵하기</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
