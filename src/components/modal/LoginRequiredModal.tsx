import { ActionModal } from "./ActionModal";

type LoginRequiredModalProps = {
  visible: boolean;
  onClose: () => void;
  onLogin: () => void;
};

/** 비회원이 회원 전용 기능에 들어가려 할 때 띄운다. */
export function LoginRequiredModal({ visible, onClose, onLogin }: LoginRequiredModalProps) {
  return (
    <ActionModal
      visible={visible}
      onRequestClose={onClose}
      type="2Btn"
      title="로그인이 필요합니다."
      description={"위시 아이템 저장부터, 투표 참여까지.\n로그인 후 모든 기능을 이용해 보세요."}
      secondaryAction={{ label: "다음에 할게요", onPress: onClose }}
      primaryAction={{ label: "로그인", onPress: onLogin }}
    />
  );
}
