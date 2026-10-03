import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { IconWithdrawalClose } from "@/assets/images/my";
import { Button } from "@/components/Button";
import { Modal } from "@/components/modal";

type AccountWithdrawalModalProps = {
  isVisible: boolean;
  onClose: () => void;
  // 완료 창의 확인에서 계정 삭제·로그아웃·온보딩 이동을 실행합니다.
  onWithdraw?: () => Promise<void>;
};

export function AccountWithdrawalModal({
  isVisible,
  onClose,
  onWithdraw,
}: AccountWithdrawalModalProps) {
  const [modalToast, setModalToast] = useState<string>();
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const isWithdrawingRef = useRef(false);

  const handleClose = () => {
    if (isWithdrawingRef.current) return;
    setIsCompletionOpen(false);
    setModalToast(undefined);
    onClose();
  };
  const handleAgree = () => {
    if (!onWithdraw) {
      setModalToast("회원탈퇴 기능은 준비 중입니다.");
      return;
    }
    setIsCompletionOpen(true);
  };
  const handleWithdraw = async () => {
    if (!onWithdraw || isWithdrawingRef.current) return;
    isWithdrawingRef.current = true;
    setIsWithdrawing(true);
    try {
      await onWithdraw();
      setIsCompletionOpen(false);
      setModalToast(undefined);
      onClose();
    } catch {
      setIsCompletionOpen(false);
      setModalToast("회원탈퇴를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      isWithdrawingRef.current = false;
      setIsWithdrawing(false);
    }
  };

  return (
    <Modal
      visible={isVisible}
      onRequestClose={handleClose}
      scrimOpacity={0.36}
      backdropClassName={isCompletionOpen ? "bg-gray-0" : undefined}
      toastMessage={modalToast}
      onToastDismiss={() => setModalToast(undefined)}
      className="px-4 pb-4 pt-2"
    >
      <View className="w-full items-center gap-1">
        <View className="h-12 w-full items-center justify-center">
          <Text className="text-center text-gray-900 font-label-16-semibold">
            {isCompletionOpen ? "회원 탈퇴가 완료되었습니다." : "회원 탈퇴하시겠습니까?"}
          </Text>
          {isCompletionOpen && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="회원탈퇴 완료 창 닫기"
              accessibilityState={{ disabled: isWithdrawing }}
              disabled={isWithdrawing}
              onPress={handleClose}
              className="absolute right-0 h-12 w-12 items-center justify-center"
            >
              <View className="size-4 items-center justify-center">
                <IconWithdrawalClose />
              </View>
            </Pressable>
          )}
        </View>
        <Text className="text-center text-gray-700 font-b3">
          {isCompletionOpen
            ? "지금까지 Diggin을 이용해 주셔서 감사합니다."
            : "탈퇴 후 모든 정보는 복구가 불가능합니다."}
        </Text>
      </View>
      {isCompletionOpen ? (
        <View className="w-full">
          <Button isDisabled={isWithdrawing} onPress={handleWithdraw}>
            확인
          </Button>
        </View>
      ) : (
        <View className="w-full flex-row gap-modal-action">
          <View className="flex-1">
            <Button variant="secondary" isDisabled={isWithdrawing} onPress={handleAgree}>
              동의 후 탈퇴
            </Button>
          </View>
          <View className="flex-1">
            <Button isDisabled={isWithdrawing} onPress={handleClose}>
              돌아가기
            </Button>
          </View>
        </View>
      )}
    </Modal>
  );
}
