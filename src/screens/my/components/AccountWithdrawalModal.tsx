import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { IconWithdrawalClose } from "@/assets/images/my";
import { Button } from "@/components/Button";
import { Modal } from "@/components/modal";

import { AccountWithdrawalSurvey, type WithdrawalSurvey } from "./AccountWithdrawalSurvey";

type AccountWithdrawalModalProps = {
  isVisible: boolean;
  onClose: () => void;
  // 실제 탈퇴 요청은 설문 제출 시 실행하며, 성공한 뒤에만 완료 창을 표시합니다.
  onWithdraw?: (survey: WithdrawalSurvey) => Promise<void>;
};

export function AccountWithdrawalModal({
  isVisible,
  onClose,
  onWithdraw,
}: AccountWithdrawalModalProps) {
  const [modalToast, setModalToast] = useState<string>();
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const isWithdrawingRef = useRef(false);

  useEffect(() => {
    if (!modalToast) return;
    const timer = setTimeout(() => setModalToast(undefined), 2000);
    return () => clearTimeout(timer);
  }, [modalToast]);

  const handleClose = () => {
    if (isWithdrawingRef.current) return;
    setIsCompletionOpen(false);
    setIsSurveyOpen(false);
    setModalToast(undefined);
    onClose();
  };
  const handleAgree = () => {
    setIsSurveyOpen(true);
    setModalToast(undefined);
  };
  const handleWithdraw = async (survey: WithdrawalSurvey) => {
    if (isWithdrawingRef.current) return;
    if (!onWithdraw) {
      setModalToast("회원탈퇴 기능은 준비 중입니다.");
      return;
    }
    isWithdrawingRef.current = true;
    setIsWithdrawing(true);
    try {
      await onWithdraw(survey);
      setIsSurveyOpen(false);
      setIsCompletionOpen(true);
      setModalToast(undefined);
    } catch {
      setIsCompletionOpen(false);
      setModalToast("회원탈퇴를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      isWithdrawingRef.current = false;
      setIsWithdrawing(false);
    }
  };

  if (isSurveyOpen && isVisible) {
    return (
      <AccountWithdrawalSurvey
        isSubmitting={isWithdrawing}
        onClose={handleClose}
        onSubmit={handleWithdraw}
        toastMessage={modalToast}
      />
    );
  }

  return (
    <Modal
      visible={isVisible}
      onRequestClose={handleClose}
      scrimOpacity={0.36}
      backdropClassName={isCompletionOpen ? "bg-gray-0" : undefined}
      toastMessage={modalToast}
      onToastDismiss={() => setModalToast(undefined)}
      className="px-4 pb-4 pt-[18px]"
    >
      <View className="w-full items-center gap-1">
        <View className="h-[26px] w-full items-center justify-center">
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
          <Button isDisabled={isWithdrawing} onPress={handleClose}>
            확인
          </Button>
        </View>
      ) : (
        <View className="w-full flex-row gap-modal-action">
          <View className="flex-1">
            <Button isDisabled={isWithdrawing} onPress={handleClose}>
              취소
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="secondary" isDisabled={isWithdrawing} onPress={handleAgree}>
              탈퇴하기
            </Button>
          </View>
        </View>
      )}
    </Modal>
  );
}
