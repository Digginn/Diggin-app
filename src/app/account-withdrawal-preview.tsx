import { useRouter } from "expo-router";
import { useRef } from "react";

import { AccountWithdrawalModal } from "@/screens/my/components/AccountWithdrawalModal";
import { MyScreen } from "@/screens/my/MyScreen";

export default function AccountWithdrawalPreview() {
  const router = useRouter();
  const attempts = useRef(0);
  // 실제 계정 삭제 없이 첫 요청 실패 → 재시도 성공 흐름을 확인합니다.
  const handleWithdraw = async () => {
    attempts.current += 1;
    if (attempts.current === 1) throw new Error("회원탈퇴 실패 미리보기");
  };
  return (
    <>
      <MyScreen />
      <AccountWithdrawalModal isVisible onClose={() => router.back()} onWithdraw={handleWithdraw} />
    </>
  );
}
