import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json을 그대로 쓰고, 키가 필요한 플러그인만 .env 값으로 덧붙인다.
export default ({ config }: ConfigContext): ExpoConfig => {
  const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  if (!kakaoNativeAppKey) {
    console.warn("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY가 없어 카카오 SDK 설정을 건너뜁니다.");
    return config as ExpoConfig;
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        "@react-native-kakao/core",
        {
          nativeAppKey: kakaoNativeAppKey,
          android: { authCodeHandlerActivity: true },
          ios: { handleKakaoOpenUrl: true },
        },
      ],
    ],
  } as ExpoConfig;
};
