import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { HelperText, TextField } from "@/components/Field";
import { TOAST_MESSAGES } from "@/constants/messages";
import { findItemLink, isItemLink } from "@/utils/itemLink";

type ItemLinkSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  onSubmit: (url: string) => void;
};

export function ItemLinkSheet({ visible, onRequestClose, onSubmit }: ItemLinkSheetProps) {
  const [url, setUrl] = useState("");
  const [isError, setError] = useState(false);
  const [toast, setToast] = useState<string>();

  function handleSubmit() {
    if (!isItemLink(url)) {
      setError(true);
      setToast(TOAST_MESSAGES.SAVE_004);
      return;
    }
    onSubmit(url.trim());
  }

  return (
    <BottomSheet
      visible={visible}
      isScrimClosable={false}
      toastMessage={toast}
      onToastDismiss={() => setToast(undefined)}
      onRequestClose={onRequestClose}
    >
      <ScrollView
        className="px-margin"
        contentContainerStyle={{ gap: 25 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-[30px]">
          <View className="items-center gap-1">
            <Text className="text-gray-1000 font-label-16-semibold">아이템 추가</Text>
            <Text className="text-center text-gray-700 font-b3">
              저장할 아이템 링크를 붙여넣어 주세요.{"\n"}링크를 붙여넣으면 아이템 정보를 불러옵니다.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-gray-900 font-b3">아이템 링크</Text>
            <TextField
              autoCapitalize="none"
              isError={isError}
              keyboardType="url"
              placeholder="아이템 링크를 붙여넣어 주세요."
              value={url}
              onChangeText={(next) => {
                // 상품명과 링크를 같이 복사하는 앱이 많아 링크만 남긴다.
                setUrl(findItemLink(next) ?? next);
                setError(false);
              }}
            />
            {isError ? (
              <HelperText
                status="error"
                message="http 또는 https로 시작하는 아이템 링크를 입력해 주세요."
              />
            ) : null}
          </View>
        </View>

        <View className="flex-row gap-[17px]">
          <Button className="flex-1" variant="secondary" onPress={onRequestClose}>
            취소
          </Button>
          <Button className="flex-1" isDisabled={url.trim().length === 0} onPress={handleSubmit}>
            불러오기
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
