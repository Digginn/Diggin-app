import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { ToastText } from "@/components/ToastText";
import { SanctionNoticeModal } from "@/screens/diggle/components/SanctionNoticeModal";
import { DiggleScreen } from "@/screens/diggle/DiggleScreen";
import {
  restrictionToastMessage,
  type SanctionNotice,
} from "@/screens/diggle/utils/sanctionMessages";
import { LoginScreen } from "@/screens/login/LoginScreen";

const RESTRICTED_UNTIL = "2026-10-23T14:59:59Z";
const REASON_LABEL = "욕설, 비방, 인신 공격";
const PREVIEWS = [
  { type: "warning", label: "경고 안내 (MSG-REPORT-006)" },
  { type: "restricted", label: "7일 제한 안내 (MSG-REPORT-007)" },
  { type: "toast", label: "참여 제한 Toast (MSG-REPORT-008)" },
  { type: "suspended", label: "영구 제한 안내 (MSG-REPORT-009)" },
] as const;

export default function SanctionPreview() {
  return __DEV__ ? <PreviewContent /> : <Redirect href="/" />;
}

function PreviewContent() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const close = () => router.replace("/sanction-preview" as Href);
  const notice: SanctionNotice | null =
    type === "warning"
      ? { type: "warning" }
      : type === "restricted"
        ? {
            type: "community_restricted",
            restrictedUntil: RESTRICTED_UNTIL,
            reasonLabel: REASON_LABEL,
          }
        : type === "suspended"
          ? { type: "suspended", reasonLabel: REASON_LABEL }
          : null;

  if (notice || type === "toast")
    return (
      <View className="flex-1 bg-gray-0">
        {type === "suspended" ? <LoginScreen /> : <DiggleScreen />}
        {notice && <SanctionNoticeModal visible notice={notice} onConfirm={close} />}
        {type === "toast" && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 bottom-[160px] items-center px-margin"
          >
            <ToastText message={restrictionToastMessage(RESTRICTED_UNTIL)} variant="notice" />
          </View>
        )}
      </View>
    );

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="제재 안내 미리보기" />
      <ScrollView contentContainerClassName="gap-4 px-margin py-6">
        <Text className="text-gray-700 font-b3">
          예시 제재 정보로 UI만 확인합니다. 실제 계정 상태는 변경하지 않습니다.
        </Text>
        {PREVIEWS.map((preview) => (
          <Button key={preview.type} onPress={() => router.setParams({ type: preview.type })}>
            {preview.label}
          </Button>
        ))}
      </ScrollView>
    </View>
  );
}
