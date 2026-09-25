import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState, type ReactNode } from "react";
import { Modal as NativeModal, Pressable, Text, TextInput, View } from "react-native";

import { colors } from "@/theme";

type ModalAction = {
  label: string;
  onPress: () => void;
};

type ModalProps = {
  type?: "1Btn" | "2Btn";
  title: string;
  description?: string;
  children?: ReactNode;
  onClose?: () => void;
  primaryAction: ModalAction;
  secondaryAction?: ModalAction;
};

type FolderModalProps = {
  onBack: () => void;
  onLoad: () => void;
  onSave: () => void;
};

type ReportModalProps = {
  onCancel: () => void;
  onReport: (reason: string, detail: string) => void;
};

type ModalOverlayProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
};

const REPORT_REASONS = [
  "욕설, 비방, 인신 공격",
  "게시글 도배",
  "부적절한 게시글 (선정적 / 홍보 / 유언비어 / 초상권 위배 등)",
  "직접 작성",
] as const;
const StyledImage = cssInterop(Image, { className: "style" });

export function ModalOverlay({ children, visible, onRequestClose }: ModalOverlayProps) {
  return (
    <NativeModal animationType="fade" onRequestClose={onRequestClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center px-margin">
        <View className="absolute inset-0 bg-black/40" />
        {children}
      </View>
    </NativeModal>
  );
}

function ModalButton({
  action,
  variant = "primary",
}: {
  action: ModalAction;
  variant?: "primary" | "secondary" | "disabled";
}) {
  const containerClassName =
    variant === "primary"
      ? "bg-gray-900 rounded-[5px]"
      : variant === "secondary"
        ? "bg-gray-100 rounded"
        : "bg-gray-200 rounded";
  const labelClassName =
    variant === "primary"
      ? "text-gray-0"
      : variant === "secondary"
        ? "text-gray-900"
        : "text-gray-500";
  return (
    <Pressable
      className={`h-12 w-full items-center justify-center px-5 ${containerClassName}`}
      disabled={variant === "disabled"}
      onPress={action.onPress}
    >
      <Text className={`font-label-16-semibold ${labelClassName}`}>{action.label}</Text>
    </Pressable>
  );
}

export function Modal({
  type = "1Btn",
  title,
  description,
  children,
  onClose,
  primaryAction,
  secondaryAction,
}: ModalProps) {
  const isTwoButton = type === "2Btn" && secondaryAction;
  const hasCloseButton = type === "1Btn" && onClose !== undefined;

  return (
    <View
      className={`w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 px-2.5 pb-4 shadow-lg ${hasCloseButton ? "pt-2" : "pt-4"}`}
    >
      <View className="w-[295px] items-center gap-[25px]">
        <View className="w-[295px] items-center gap-[30px]">
          <View className="w-[295px] items-center gap-1">
            {hasCloseButton ? (
              <View className="w-[295px] flex-row items-center overflow-hidden">
                <View className="size-12" />
                <Text className="flex-1 text-center text-gray-900 font-label-16-semibold">
                  {title}
                </Text>
                <Pressable
                  accessibilityLabel="모달 닫기"
                  className="size-12 items-center justify-center overflow-hidden"
                  onPress={onClose}
                >
                  <View className="size-4 items-center justify-center overflow-hidden">
                    <StyledImage
                      className="size-3"
                      source={require("@/assets/images/icon-close.svg")}
                    />
                  </View>
                </Pressable>
              </View>
            ) : (
              <Text className="text-center text-gray-900 font-label-16-semibold">{title}</Text>
            )}
            {description && (
              <Text className="text-center text-gray-700 font-b3">{description}</Text>
            )}
          </View>
          {children}
        </View>
        {isTwoButton ? (
          <View className="w-[295px] flex-row gap-[15px]">
            <View className="w-[140px]">
              <ModalButton action={secondaryAction} variant="secondary" />
            </View>
            <View className="w-[140px]">
              <ModalButton action={primaryAction} />
            </View>
          </View>
        ) : (
          <View className="w-[295px]">
            <ModalButton action={primaryAction} variant="disabled" />
          </View>
        )}
      </View>
    </View>
  );
}

export function FolderModal({ onBack, onLoad, onSave }: FolderModalProps) {
  return (
    <View className="w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 px-2.5 py-4 shadow-lg">
      <View className="w-[295px] items-center gap-[25px]">
        <View className="items-center gap-1">
          <View className="flex-row items-center gap-1">
            <View className="size-6 items-center justify-center overflow-hidden">
              <View className="-rotate-45">
                <StyledImage
                  source={require("@/assets/images/icon-link.svg")}
                  className="h-[10.5px] w-[21.3px]"
                />
              </View>
            </View>
            <Text className="text-gray-900 font-label-16-semibold">제목</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View className="rounded-[5px] bg-gray-200 px-1.5 py-1">
              <Text className="text-gray-600 font-name-s">상품명</Text>
            </View>
            <Text className="max-w-[235px] text-gray-600 font-b3" numberOfLines={1}>
              소제목 혹은 설명글이 들어갑니다. 1줄만 노출
            </Text>
          </View>
        </View>
        <View className="w-[295px] gap-2">
          <Text className="text-gray-1000 font-b3">폴더 선택</Text>
          <View className="h-12 flex-row items-center rounded-[5px] border border-gray-300 px-4">
            <Text className="flex-1 text-gray-900 font-label-16-medium">기본 폴더</Text>
            <StyledImage
              source={require("@/assets/images/icon-chevron-top.svg")}
              className="size-[18px] rotate-90 -scale-y-100"
            />
          </View>
        </View>
        <View className="w-[295px] flex-row gap-[15px]">
          <View className="w-[140px]">
            <ModalButton action={{ label: "돌아가기", onPress: onBack }} variant="secondary" />
          </View>
          <View className="w-[140px]">
            <ModalButton action={{ label: "불러오기", onPress: onLoad }} />
          </View>
        </View>
        <Pressable
          className="h-12 w-[295px] items-center justify-center rounded-[5px] bg-gray-900"
          onPress={onSave}
        >
          <Text className="text-gray-0 font-label-16-semibold">저장하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ReportModal({ onCancel, onReport }: ReportModalProps) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | undefined>();
  const [detail, setDetail] = useState("");
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  const isOther = reason === "직접 작성";
  return (
    <View className="w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 px-2.5 py-4 shadow-lg">
      <View className="w-[295px] items-center gap-[25px]">
        <Text className="text-gray-900 font-label-16-semibold">신고 사유</Text>
        <View className="w-[295px] gap-2">
          {REPORT_REASONS.map((item) => (
            <Pressable
              key={item}
              className="min-h-12 flex-row items-center gap-2 rounded-[5px] border-[1.5px] border-gray-300 px-4 py-[11px]"
              onPress={() => {
                setReason(item);
                if (item !== "직접 작성") {
                  setIsDetailFocused(false);
                }
              }}
            >
              <StyledImage
                source={
                  reason === item
                    ? require("@/assets/images/icon-radio-active.svg")
                    : require("@/assets/images/icon-radio-inactive.svg")
                }
                className="size-5"
              />
              <Text className="flex-1 text-gray-900 font-label-16-medium">{item}</Text>
            </Pressable>
          ))}
          {isOther && (
            <View
              className={`min-h-[88px] w-full rounded-[5px] border-[1.5px] px-4 py-2.5 ${isDetailFocused ? "border-semantic-focus" : "border-gray-300"}`}
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
        <View className="w-[295px] flex-row gap-[15px]">
          <View className="w-[140px]">
            <ModalButton action={{ label: "취소", onPress: onCancel }} variant="secondary" />
          </View>
          <View className="w-[140px]">
            <ModalButton
              action={{ label: "신고하기", onPress: () => onReport(reason ?? "", detail) }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
