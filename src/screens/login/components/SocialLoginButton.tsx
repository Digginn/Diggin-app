import { View } from "react-native";

import AppleLogo from "@/assets/images/icon-login-apple.svg";
import GoogleLogo from "@/assets/images/icon-login-google.svg";
import KakaoLogo from "@/assets/images/icon-login-kakao.svg";
import { Button } from "@/components/Button";
import { colors } from "@/theme";

const PROVIDERS = {
  google: { label: "Google로 로그인", Icon: GoogleLogo, bgColor: colors.gray[100] },
  kakao: { label: "Kakao로 로그인", Icon: KakaoLogo, bgColor: colors.brand.kakao },
  apple: { label: "Apple로 로그인", Icon: AppleLogo, bgColor: colors.gray[900] },
} as const;

export type LoginProvider = keyof typeof PROVIDERS;

type SocialLoginButtonProps = {
  provider: LoginProvider;
  onPress: () => void;
};

export function SocialLoginButton({ provider, onPress }: SocialLoginButtonProps) {
  const { label, Icon, bgColor } = PROVIDERS[provider];

  return (
    <Button
      onPress={onPress}
      variant={provider === "apple" ? "primary" : "secondary"}
      bgColor={bgColor}
      accessibilityLabel={label}
      className="rounded-field"
    >
      <View className="size-6 items-center justify-center" accessible={false}>
        <Icon />
      </View>
      {label}
    </Button>
  );
}
