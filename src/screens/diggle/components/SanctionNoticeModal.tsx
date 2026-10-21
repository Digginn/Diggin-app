import { useCallback, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";

import { Modal } from "@/components/modal/Modal";
import { ModalButton } from "@/components/modal/ModalButton";
import { SUPPORT_CHANNEL_URL } from "@/screens/my/constants/supportChannel";

import { sanctionNoticeMessage, type SanctionNotice } from "../utils/sanctionMessages";

type SanctionNoticeModalProps = {
  visible: boolean;
  notice: SanctionNotice;
  onConfirm: () => void;
};

// 표시 조건·제재 건별 확인 기록·세션 종료는 관리자 API 연결 시 처리한다 (#114).
export function SanctionNoticeModal({ visible, notice, onConfirm }: SanctionNoticeModalProps) {
  const { title, description } = sanctionNoticeMessage(notice);
  const [error, setError] = useState("");
  const isOpening = useRef(false);
  const clearError = useCallback(() => setError(""), []);

  async function openSupport() {
    if (isOpening.current) return;
    isOpening.current = true;
    clearError();
    try {
      await Linking.openURL(SUPPORT_CHANNEL_URL);
    } catch {
      setError("카카오 채널로 이동하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      isOpening.current = false;
    }
  }

  return (
    <Modal
      visible={visible}
      onRequestClose={() => {}}
      scrimOpacity={0.36}
      className="px-2.5 pb-4 pt-2"
      toastMessage={error || undefined}
      onToastDismiss={clearError}
    >
      <View className="w-full items-center gap-4">
        <View className="w-full items-center gap-1 pt-2.5">
          <Text
            accessibilityRole="header"
            className="text-center text-gray-900 font-label-16-semibold"
          >
            {title}
          </Text>
          <Text className="text-center text-gray-700 font-b3">{description}</Text>
        </View>
        {notice.type !== "warning" && (
          <View className="w-full flex-row justify-center gap-2 rounded-lg bg-gray-50 px-4 py-3">
            <Text className="text-gray-600 font-label-14">제재 사유</Text>
            <Text className="max-w-[203px] shrink text-gray-900 font-label-14">
              {notice.reasonLabel}
            </Text>
          </View>
        )}
      </View>
      <View className="w-full flex-row gap-modal-action">
        {notice.type !== "warning" && (
          <View className="flex-1">
            <ModalButton
              variant="secondary"
              action={{ label: "1:1 문의", onPress: () => void openSupport() }}
            />
          </View>
        )}
        <View className="flex-1">
          <ModalButton action={{ label: "확인", onPress: onConfirm }} />
        </View>
      </View>
    </Modal>
  );
}
