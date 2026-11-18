import { Pressable, Text, View } from "react-native";

import ChevronRight from "@/assets/images/icon-chevron-right-gray700.svg";
import CheckboxOff from "@/assets/images/icon-consent-checkbox-off.svg";
import CheckboxOn from "@/assets/images/icon-consent-checkbox-on.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import type { PolicyDocument } from "@/components/PolicyDocumentContent";

export type TermsConsent = {
  age: boolean;
  terms: boolean;
  privacy: boolean;
  usageAnalysis: boolean;
  overseasTransfer: boolean;
};

export const EMPTY_TERMS_CONSENT: TermsConsent = {
  age: false,
  terms: false,
  privacy: false,
  usageAnalysis: false,
  overseasTransfer: false,
};

const ROWS: { key: keyof TermsConsent; label: string; document?: PolicyDocument }[] = [
  { key: "age", label: "(필수) 만 14세 이상입니다." },
  { key: "terms", label: "(필수) 서비스 이용약관에 동의합니다.", document: "terms" },
  { key: "privacy", label: "(필수) 개인정보 처리방침에 동의합니다.", document: "privacy" },
  {
    key: "usageAnalysis",
    label: "(선택) 서비스 이용 기록 분석에 동의합니다.",
    document: "usage-analysis",
  },
  {
    key: "overseasTransfer",
    label: "(선택) 이용 기록의 국외 이전에 동의합니다.",
    document: "overseas-transfer",
  },
];

export const isRequiredConsented = (consent: TermsConsent) =>
  consent.age && consent.terms && consent.privacy;

function Checkbox({ isChecked }: { isChecked: boolean }) {
  return (
    <View className="size-12 items-center justify-center">
      {isChecked ? <CheckboxOn width={24} height={24} /> : <CheckboxOff width={24} height={24} />}
    </View>
  );
}

/**
 * AUTH-02 이용약관 동의 시트. 소셜 로그인 버튼을 누르면 띄우고, 필수 3개를 모두 체크해야 확인할 수 있다.
 * 체크해도 Toast는 띄우지 않는다. `>`로 여는 약관 상세는 비회원 화면이라 체크박스가 없다(MY-017).
 */
export function TermsConsentSheet({
  visible,
  consent,
  onChange,
  onOpenDocument,
  onConfirm,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  consent: TermsConsent;
  onChange: (consent: TermsConsent) => void;
  onOpenDocument: (document: PolicyDocument) => void;
  onConfirm: () => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const isAllChecked = ROWS.every(({ key }) => consent[key]);

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      handleClassName="mb-5 h-1 w-9 self-center rounded-sm bg-gray-300"
    >
      <View className="px-margin pb-1">
        <Text className="mt-2 text-gray-900 font-label-20">이용약관 동의</Text>
        <View className="mt-6 gap-4">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAllChecked }}
            onPress={() =>
              onChange(
                Object.fromEntries(ROWS.map(({ key }) => [key, !isAllChecked])) as TermsConsent,
              )
            }
            className="h-14 flex-row items-center rounded-xl bg-gray-50"
          >
            <Checkbox isChecked={isAllChecked} />
            <Text className="text-gray-1000 font-label-16-bold">모두 동의합니다.</Text>
          </Pressable>
          <View className="h-px bg-gray-200" />
          {ROWS.map(({ key, label, document }) => (
            <View key={key} className="h-12 flex-row items-center">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: consent[key] }}
                onPress={() => onChange({ ...consent, [key]: !consent[key] })}
                className="flex-1 flex-row items-center self-stretch"
              >
                <Checkbox isChecked={consent[key]} />
                <Text className="flex-1 text-[#333333] font-b3">{label}</Text>
              </Pressable>
              {document && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${label} 전문 보기`}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => onOpenDocument(document)}
                  className="h-12 w-6 items-center justify-center"
                >
                  <ChevronRight width={24} height={24} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
        <Button
          size="large"
          className="mt-6"
          isDisabled={!isRequiredConsented(consent)}
          onPress={onConfirm}
        >
          확인
        </Button>
      </View>
    </BottomSheet>
  );
}
