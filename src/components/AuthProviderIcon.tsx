import { Image } from "expo-image";
import { View } from "react-native";

import AppleLogo from "@/assets/images/my/icon-auth-apple.svg";
import GoogleLogo from "@/assets/images/my/icon-auth-google.svg";

export type AuthProvider = "kakao" | "google" | "apple";

export function AuthProviderIcon({ provider }: { provider: AuthProvider }) {
  return (
    <View
      className={`size-4 items-center justify-center overflow-hidden rounded-full ${
        provider === "apple" ? "bg-black pb-px pr-[0.5px]" : provider === "google" ? "bg-white" : ""
      }`}
      accessible={false}
    >
      {provider === "google" ? (
        <GoogleLogo />
      ) : provider === "apple" ? (
        <AppleLogo />
      ) : (
        <Image
          source={require("@/assets/images/my/icon-auth-kakao.png")}
          contentFit="cover"
          style={{ width: 16, height: 16 }}
        />
      )}
    </View>
  );
}
