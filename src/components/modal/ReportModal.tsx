import { cssInterop } from "nativewind";
import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { graphemeSegments } from "unicode-segmenter/grapheme";

import RadioActiveSvg from "@/assets/images/icon-radio-active.svg";
import RadioInactiveSvg from "@/assets/images/icon-radio-inactive.svg";
import { REPORT_REASONS, type ReportReason } from "@/constants/report";
import { colors } from "@/theme";
import { normalizeText } from "@/utils/text";

import { Modal, type ModalProps } from "./Modal";
import { ModalButton } from "./ModalButton";

type ReportFormProps = {
  onCancel: () => void;
  onReport: (reason: ReportReason, detail: string) => void;
  isPending?: boolean;
  error?: string;
};
type ReportModalProps = Omit<ModalProps, "children"> & ReportFormProps;

const RadioActiveIcon = cssInterop(RadioActiveSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const RadioInactiveIcon = cssInterop(RadioInactiveSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export function ReportModal({
  onCancel,
  onReport,
  isPending,
  error,
  ...modalProps
}: ReportModalProps) {
  return (
    <Modal isKeyboardAvoiding={Platform.OS === "android"} {...modalProps}>
      <ReportForm onCancel={onCancel} onReport={onReport} isPending={isPending} error={error} />
    </Modal>
  );
}

export function ReportForm({ onCancel, onReport, isPending = false, error }: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason>();
  const [detail, setDetail] = useState("");
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  const isOther = reason === "other";
  const canSubmit = reason !== undefined && !isPending;
  return (
    <>
      <Text className="text-gray-900 font-label-16-semibold">신고 사유</Text>
      <View className="w-[295px] gap-2">
        {REPORT_REASONS.map((item) => (
          <Pressable
            key={item.value}
            disabled={isPending}
            className="min-h-12 flex-row items-center gap-2 rounded-field border-[1.5px] border-gray-300 px-4 py-[11px]"
            onPress={() => {
              setReason(item.value);
              if (item.value !== "other") {
                setIsDetailFocused(false);
              }
            }}
          >
            {reason === item.value ? (
              <RadioActiveIcon className="size-5" />
            ) : (
              <RadioInactiveIcon className="size-5" />
            )}
            <Text className="flex-1 text-gray-900 font-label-16-medium">{item.label}</Text>
          </Pressable>
        ))}
        {isOther && (
          <View
            className={`min-h-[88px] w-full rounded-field border-[1.5px] px-4 py-2.5 ${isDetailFocused ? "border-semantic-focus" : "border-gray-300"}`}
          >
            <TextInput
              className="flex-1 p-0 text-gray-900 font-label-16-medium"
              multiline
              editable={!isPending}
              onChangeText={(value) =>
                setDetail(
                  Array.from(graphemeSegments(normalizeText(value)), ({ segment }) => segment)
                    .slice(0, 50)
                    .join(""),
                )
              }
              onFocus={() => setIsDetailFocused(true)}
              onBlur={() => setIsDetailFocused(false)}
              placeholder="신고 사유를 작성해 주세요."
              placeholderTextColor={colors.gray[400]}
              textAlignVertical="top"
              value={detail}
            />
            <Text
              className={`text-right font-label-12-regular ${isDetailFocused ? "text-semantic-focus" : "text-gray-400"}`}
            >
              최대 50자
            </Text>
          </View>
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" className="text-semantic-error font-b3">
          {error}
        </Text>
      )}
      <View className="w-[295px] flex-row gap-modal-action">
        <View className="w-[140px]">
          <ModalButton
            action={{ label: "취소", onPress: onCancel, isDisabled: isPending }}
            variant="secondary"
          />
        </View>
        <View className="w-[140px]">
          <ModalButton
            action={{
              label: isPending ? "신고 중…" : "신고하기",
              onPress: () => {
                if (canSubmit && reason) onReport(reason, detail);
              },
              isDisabled: !canSubmit,
            }}
            variant={canSubmit ? "primary" : "disabled"}
          />
        </View>
      </View>
    </>
  );
}
