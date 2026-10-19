import { ScrollView, Text, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";

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
        <Text className="text-gray-700 font-b3">
          상품과 관련된 내용을 작성해 주세요.{"\n\n"}서로 존중하며 대화하고, 광고·홍보성 게시글은
          삼가 주세요.{"\n\n"}다른 사람의 개인정보와 저작권 등 권리를 보호해 주세요.{"\n\n"}
          커뮤니티를 공정하게 이용해 주세요. 도배나 서비스 이용을 방해하는 행위는 제한됩니다.
          {"\n\n"}정책을 위반한 게시글은 숨김 처리될 수 있으며, 위반 정도에 따라 경고·7일 이용
          제한·영구 이용 제한이 적용될 수 있습니다.
        </Text>
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
