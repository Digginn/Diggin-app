import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import CheckOff from "@/assets/images/icon-withdrawal-check-off.svg";
import CheckOn from "@/assets/images/icon-withdrawal-check-on.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { ToastText } from "@/components/ToastText";
import { colors } from "@/theme";

const WITHDRAWAL_REASONS = [
  "자주 사용하지 않아요.",
  "원하는 기능이 없어요.",
  "다른 서비스를 이용해요.",
  "사용이 어렵고 불편해요.",
  "오류가 자주 생겨요.",
  "직접 작성",
] as const;
const DETAIL_MAX_LENGTH = 30;

export type WithdrawalSurvey = {
  reasons: string[];
  detail: string;
};

type AccountWithdrawalSurveyProps = {
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (survey: WithdrawalSurvey) => void;
  toastMessage?: string;
};

export function AccountWithdrawalSurvey({
  isSubmitting,
  onClose,
  onSubmit,
  toastMessage,
}: AccountWithdrawalSurveyProps) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => Keyboard.isVisible());
  const hasCustomReason = reasons.includes("직접 작성");
  const count = Array.from(splitGraphemes(detail)).length;
  const canSubmit =
    reasons.some((reason) => reason !== "직접 작성") ||
    (hasCustomReason && detail.trim().length > 0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <BottomSheet
      visible
      onRequestClose={onClose}
      scrimOpacity={0.36}
      isScrimClosable={false}
      className="rounded-t-[20px] px-margin"
      handleClassName="mb-5 h-1 w-8 self-center rounded-full bg-gray-500 opacity-40"
      overlay={
        toastMessage ? (
          <View pointerEvents="none" className="absolute inset-x-6 bottom-[100px] items-center">
            <ToastText message={toastMessage} />
          </View>
        ) : undefined
      }
    >
      <View className="gap-1.5 pb-5">
        <Text accessibilityRole="header" className="text-gray-900 font-label-20">
          탈퇴하시는 이유를 알려주세요.
        </Text>
        <Text className="text-gray-700 font-b3">
          {"해당하는 이유를 모두 선택해 주세요.\n선택하신 내용은 서비스 개선에 참고하겠습니다."}
        </Text>
      </View>
      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerClassName="gap-2 pb-4 pt-4"
        className="border-y border-[#E8E8E8]"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {WITHDRAWAL_REASONS.map((reason) => {
          const isSelected = reasons.includes(reason);
          return (
            <Pressable
              key={reason}
              accessibilityLabel={reason}
              accessibilityRole="checkbox"
              aria-checked={isSelected}
              accessibilityState={{ checked: isSelected, disabled: isSubmitting }}
              disabled={isSubmitting}
              className={`h-[46px] flex-row items-center gap-2 rounded px-4 ${isSelected ? "bg-[#F5F5F5]" : "bg-gray-0"}`}
              onPress={() => {
                setReasons(
                  isSelected ? reasons.filter((value) => value !== reason) : [...reasons, reason],
                );
                if (reason === "직접 작성" && isSelected) Keyboard.dismiss();
              }}
            >
              <Text className="flex-1 text-gray-900 font-b2">{reason}</Text>
              <View className="size-6 items-center justify-center">
                {isSelected ? <CheckOn /> : <CheckOff />}
              </View>
            </Pressable>
          );
        })}
        {hasCustomReason && (
          <View
            className={`justify-between rounded-xl border-field border-gray-900 bg-gray-reason-background px-4 pb-3 pt-3.5 ${isKeyboardVisible ? "h-24" : "h-32"}`}
          >
            <TextInput
              accessibilityLabel="탈퇴 이유 직접 작성"
              className="min-h-0 flex-1 p-0 text-gray-900 font-b2-input"
              multiline
              editable={!isSubmitting}
              textAlignVertical="top"
              placeholder="이유를 입력해 주세요. (최대 30자)"
              placeholderTextColor={colors.gray[900]}
              value={detail}
              onChangeText={(value) =>
                setDetail(Array.from(splitGraphemes(value)).slice(0, DETAIL_MAX_LENGTH).join(""))
              }
            />
            <Text className="mt-1.5 self-end text-gray-500 font-label-12-regular">
              {count}/{DETAIL_MAX_LENGTH}
            </Text>
          </View>
        )}
      </ScrollView>
      <View className="flex-row gap-modal-action pt-5">
        <View className="flex-1">
          <Button
            variant="secondary"
            bgColor={colors.gray[0]}
            className="border border-gray-900"
            isDisabled={isSubmitting}
            onPress={onClose}
          >
            취소
          </Button>
        </View>
        <View className="flex-1">
          <Button
            isDisabled={!canSubmit || isSubmitting}
            bgColor={colors.gray[900]}
            className={!canSubmit || isSubmitting ? "opacity-30" : undefined}
            onPress={() => {
              if (!canSubmit || isSubmitting) return;
              Keyboard.dismiss();
              onSubmit({ reasons, detail: hasCustomReason ? detail.trim() : "" });
            }}
          >
            <Text className="text-gray-0 font-label-16-semibold">탈퇴하기</Text>
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}
