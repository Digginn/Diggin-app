import { ScrollView, Text, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { PolicyDocumentContent } from "@/components/PolicyDocumentContent";

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
      toastMessage={error}
      toastVariant="error"
      onToastDismiss={onErrorDismiss}
    >
      <ScrollView className="px-margin" contentContainerStyle={{ gap: 16 }}>
        <Text className="text-gray-900 font-h2">커뮤니티 이용정책</Text>
        <PolicyDocumentContent document="community" />
        <View className="gap-3 pb-3">
          <Button isDisabled={isBusy} onPress={onConfirm}>
            {isRequired ? "동의하고 작성하기" : "확인"}
          </Button>
          {isRequired && (
            <Button variant="secondary" isDisabled={isBusy} onPress={onClose}>
              취소
            </Button>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
