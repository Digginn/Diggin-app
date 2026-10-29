import { useRef, useState } from "react";
import { Linking } from "react-native";

import { ActionModal } from "@/components/modal";
import { SUPPORT_CHANNEL_URL } from "@/screens/my/constants/supportChannel";

const UNDERAGE_NOTICE_DESCRIPTION =
  "이용이 중단되었습니다. 한 달 이내에\n정정을 요청하지 않으면 계정이 삭제됩니다.";

/** MSG-AUTH-007 가입 후 만 14세 미만으로 확인돼 이용을 중단한 계정 안내 (AUTH-11). */
export function UnderageNoticeModal({ onConfirm }: { onConfirm: () => void }) {
  const [error, setError] = useState("");
  const isOpening = useRef(false);

  async function openSupport() {
    if (isOpening.current) return;
    isOpening.current = true;
    setError("");
    try {
      await Linking.openURL(SUPPORT_CHANNEL_URL);
    } catch {
      setError("카카오 채널로 이동하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      isOpening.current = false;
    }
  }

  return (
    <ActionModal
      visible
      type="2Btn"
      title="만 14세 미만은 이용할 수 없습니다."
      description={UNDERAGE_NOTICE_DESCRIPTION}
      onRequestClose={() => {}}
      scrimOpacity={0.36}
      secondaryAction={{ label: "확인", onPress: onConfirm }}
      primaryAction={{ label: "1:1 문의로 이동", onPress: () => void openSupport() }}
      toastMessage={error || undefined}
      onToastDismiss={() => setError("")}
    />
  );
}
