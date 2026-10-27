import { ActionModal } from "@/components/modal";

type LogoutModalProps = {
  isVisible: boolean;
  isLoggingOut: boolean;
  onClose: () => void;
  onConfirm: () => void;
  toastMessage?: string;
  onToastDismiss?: () => void;
};

export function LogoutModal({
  isVisible,
  isLoggingOut,
  onClose,
  onConfirm,
  toastMessage,
  onToastDismiss,
}: LogoutModalProps) {
  return (
    <ActionModal
      visible={isVisible}
      onRequestClose={onClose}
      scrimOpacity={0.36}
      toastMessage={toastMessage}
      onToastDismiss={onToastDismiss}
      type="2Btn"
      title="로그아웃하시겠습니까?"
      description="저장된 정보는 안전하게 보관됩니다."
      secondaryAction={{ label: "로그아웃", isDisabled: isLoggingOut, onPress: onConfirm }}
      primaryAction={{ label: "취소", isDisabled: isLoggingOut, onPress: onClose }}
    />
  );
}
