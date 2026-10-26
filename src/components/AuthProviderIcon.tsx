import { Image } from "expo-image";
import { View } from "react-native";

import AppleLogo from "@/assets/images/my/icon-auth-apple.svg";
import GoogleLogo from "@/assets/images/my/icon-auth-google.svg";

export type AuthProvider = "kakao" | "google" | "apple";

export function AuthProviderIcon({ provider }: { provider: AuthProvider }) {
  return (
    <View
      className={`size-4 items-center justify-center overflow-hidden rounded-full ${provider === "apple" ? "bg-black" : ""}`}
      accessible={false}
    >
      {provider === "google" ? (
        <View style={{ width: 24, height: 24, transform: [{ scale: 16 / 24 }] }}>
          <GoogleLogo />
        </View>
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
