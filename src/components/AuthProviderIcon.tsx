import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { View } from "react-native";

const ICONS = {
  kakao: require("@/assets/images/my/icon-auth-kakao.png"),
  google: require("@/assets/images/my/icon-auth-google.png"),
  apple: require("@/assets/images/my/icon-auth-apple.png"),
} as const;

const StyledImage = cssInterop(Image, { className: "style" });

export type AuthProvider = keyof typeof ICONS;

export function AuthProviderIcon({ provider }: { provider: AuthProvider }) {
  return (
    <View className="size-4" accessible={false}>
      <StyledImage source={ICONS[provider]} contentFit="contain" className="size-4" />
    </View>
  );
}
