import { ActionModal } from "@/components/modal";

type SessionExpiredModalProps = {
  visible: boolean;
  onConfirm: () => void;
};

// AUTH-010 확인 외에는 닫을 방법을 두지 않는다(ISS-035).
export function SessionExpiredModal({ visible, onConfirm }: SessionExpiredModalProps) {
  return (
    <ActionModal
      visible={visible}
      onRequestClose={() => {}}
      title="다시 로그인해 주세요."
      description="로그인 정보가 만료되어 다시 로그인이 필요합니다."
      primaryAction={{ label: "확인", onPress: onConfirm }}
      isPrimaryDisabled={false}
    />
  );
}
