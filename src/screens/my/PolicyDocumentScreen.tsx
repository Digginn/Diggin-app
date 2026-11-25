import { StatusBar } from "expo-status-bar";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { ConsentBar } from "@/components/ConsentBar";
import { PolicyDocumentContent, type PolicyDocument } from "@/components/PolicyDocumentContent";
import { useAuth } from "@/contexts/AuthContext";

import { AnalyticsConsentBar } from "./components/AnalyticsConsentBar";

const DOCUMENT_TITLES: Record<PolicyDocument, string> = {
  "terms": "이용약관",
  "privacy": "개인정보 처리방침",
  "community": "커뮤니티 이용정책",
  "usage-analysis": "서비스 이용 기록 분석",
  "overseas-transfer": "이용 기록의 국외 이전",
  "terms-v1.0": "이용약관",
  "privacy-v1.0": "개인정보 처리방침",
};

// MY-009 필수 약관은 해제할 수 없어 체크된 회색 체크박스만 보여 준다.
const REQUIRED_CONSENT_LABELS: Partial<Record<PolicyDocument, string>> = {
  "terms": "(필수) 이용약관 동의",
  "privacy": "(필수) 개인정보 처리방침 동의",
  "terms-v1.0": "(필수) 이용약관 동의",
  "privacy-v1.0": "(필수) 개인정보 처리방침 동의",
};

/**
 * 약관 상세. 동의 체크박스는 회원에게만 하단에 띄운다.
 * 로그인 동의 화면에서 여는 약관 상세와 비회원 열람에는 체크박스를 두지 않는다(MY-017).
 */
export function PolicyDocumentScreen({ document }: { document: PolicyDocument }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id;
  const requiredLabel = REQUIRED_CONSENT_LABELS[document];
  const consentBar = !userId ? null : document === "usage-analysis" ||
    document === "overseas-transfer" ? (
    <AnalyticsConsentBar document={document} userId={userId} />
  ) : requiredLabel ? (
    <ConsentBar label={requiredLabel} state="disabled" />
  ) : null;

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title={DOCUMENT_TITLES[document]} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-margin pt-6"
        // 이용약관·개인정보 시안의 하단 여백은 문서 마지막 Spacer에 포함돼 있다.
        contentContainerStyle={{
          paddingBottom: (consentBar ? 0 : insets.bottom) + (requiredLabel ? 0 : 24),
        }}
      >
        <PolicyDocumentContent document={document} />
      </ScrollView>
      {consentBar}
    </View>
  );
}

export const POLICY_DOCUMENTS = Object.keys(DOCUMENT_TITLES) as PolicyDocument[];
