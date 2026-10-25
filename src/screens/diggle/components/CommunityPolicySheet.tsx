import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, Text, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { PolicyDocumentContent } from "@/components/PolicyDocumentContent";

const SHEET_HEIGHT = 712;
const ACTION_CLASS = "!h-[52px] !rounded-lg";

export function CommunityPolicySheet({
  visible,
  isRequired,
  isBusy,
  error,
  onConfirm,
  onClose,
  onErrorDismiss,
}: {
  visible: boolean;
  isRequired: boolean;
  isBusy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
  onErrorDismiss: () => void;
}) {
  return (
    <BottomSheet
      visible={visible}
      onRequestClose={onClose}
      isScrimClosable={!isBusy}
      isCloseConfirmed={isBusy}
      height={SHEET_HEIGHT}
      maxHeight={SHEET_HEIGHT}
      toastMessage={error}
      toastVariant="error"
      onToastDismiss={onErrorDismiss}
    >
      {/* 본문만 스크롤하고 버튼은 시트 아래에 고정한다. */}
      <View className="flex-1 gap-4 px-margin">
        <Text className="text-gray-1000 font-label-18-semibold">커뮤니티 이용정책</Text>
        <View className="flex-1">
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
            <PolicyDocumentContent document="community" />
          </ScrollView>
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255, 255, 255, 0)", "#FFFFFF"]}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 48 }}
          />
        </View>
        {isRequired ? (
          <View className="flex-row gap-3">
            <Button
              variant="secondary"
              className={`w-32 ${ACTION_CLASS}`}
              isDisabled={isBusy}
              onPress={onClose}
            >
              취소
            </Button>
            <Button className={`flex-1 ${ACTION_CLASS}`} isDisabled={isBusy} onPress={onConfirm}>
              동의하고 작성하기
            </Button>
          </View>
        ) : (
          <Button className={ACTION_CLASS} isDisabled={isBusy} onPress={onConfirm}>
            확인
          </Button>
        )}
      </View>
    </BottomSheet>
  );
}
