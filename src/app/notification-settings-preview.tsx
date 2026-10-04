import { NotificationSettingsScreen } from "@/screens/my/NotificationSettingsScreen";

// 실제 API 없이 토글 변경 시 저장 실패·원래 상태 복원·토스트를 확인하는 화면입니다.
export default function NotificationSettingsPreview() {
  return (
    <NotificationSettingsScreen
      onSaveSettings={async () => {
        throw new Error("저장 실패 미리보기");
      }}
    />
  );
}
