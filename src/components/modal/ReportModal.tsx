import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import RadioActiveSvg from "@/assets/images/icon-radio-active.svg";
import RadioInactiveSvg from "@/assets/images/icon-radio-inactive.svg";
import { colors } from "@/theme";

import { Modal, type ModalProps } from "./Modal";
import { ModalButton } from "./ModalButton";

type ReportModalProps = Omit<ModalProps, "children"> & {
  onCancel: () => void;
  onReport: (reason: string, detail: string) => void;
};

const REPORT_REASONS = [
  "욕설, 비방, 인신 공격",
  "게시글 도배",
  "부적절한 게시글 (선정적 / 홍보 / 유언비어 / 초상권 위배 등)",
  "직접 작성",
] as const;
const RadioActiveIcon = cssInterop(RadioActiveSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const RadioInactiveIcon = cssInterop(RadioInactiveSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export function ReportModal({
  visible,
  onRequestClose,
  onDismiss,
  onCancel,
  onReport,
}: ReportModalProps) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | undefined>();
  const [detail, setDetail] = useState("");
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  const isOther = reason === "직접 작성";
  const canSubmit = reason !== undefined && (!isOther || detail.trim().length > 0);
  return (
    <Modal visible={visible} onRequestClose={onRequestClose} onDismiss={onDismiss}>
      <Text className="text-gray-900 font-label-16-semibold">신고 사유</Text>
      <View className="w-[295px] gap-2">
        {REPORT_REASONS.map((item) => (
          <Pressable
            key={item}
            className="min-h-12 flex-row items-center gap-2 rounded-field border-[1.5px] border-gray-300 px-4 py-[11px]"
            onPress={() => {
              setReason(item);
              if (item !== "직접 작성") {
                setIsDetailFocused(false);
              }
            }}
          >
            {reason === item ? (
              <RadioActiveIcon className="size-5" />
            ) : (
              <RadioInactiveIcon className="size-5" />
            )}
            <Text className="flex-1 text-gray-900 font-label-16-medium">{item}</Text>
          </Pressable>
        ))}
        {isOther && (
          <View
            className={`min-h-[88px] w-full rounded-field border-[1.5px] px-4 py-2.5 ${isDetailFocused ? "border-semantic-focus" : "border-gray-300"}`}
          >
            <TextInput
              className="flex-1 p-0 text-gray-900 font-label-16-medium"
              multiline
              maxLength={50}
              onChangeText={setDetail}
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
      <View className="w-[295px] flex-row gap-modal-action">
        <View className="w-[140px]">
          <ModalButton action={{ label: "취소", onPress: onCancel }} variant="secondary" />
        </View>
        <View className="w-[140px]">
          <ModalButton
            action={{ label: "신고하기", onPress: () => onReport(reason ?? "", detail) }}
            variant={canSubmit ? "primary" : "disabled"}
          />
        </View>
      </View>
    </Modal>
  );
}
