import { existsSync } from "node:fs";

import type { ConfigContext, ExpoConfig } from "expo/config";

type Plugins = NonNullable<ExpoConfig["plugins"]>;

const GOOGLE_SIGNIN_PLUGIN = "@react-native-google-signin/google-signin";

// 구글 iOS URL 스킴은 iOS 클라이언트 ID를 뒤집은 값이라 클라이언트 ID에서 만든다.
function withGoogleSignIn(plugins: Plugins): Plugins {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return plugins;
  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(".apps.googleusercontent.com", "")}`;
  return plugins.map((plugin) =>
    plugin === GOOGLE_SIGNIN_PLUGIN ? [GOOGLE_SIGNIN_PLUGIN, { iosUrlScheme }] : plugin,
  );
}

function withKakao(plugins: Plugins): Plugins {
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  if (!nativeAppKey) {
    console.warn("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY가 없어 카카오 SDK 설정을 건너뜁니다.");
    return plugins;
  }
  return [
    ...plugins,
    [
      "@react-native-kakao/core",
      {
        nativeAppKey,
        android: { authCodeHandlerActivity: true },
        ios: { handleKakaoOpenUrl: true },
      },
    ],
  ];
}

// TestFlight 앱과 같은 번들 ID로 출시한다. 카카오·구글·애플 콘솔에도 이 값으로 등록돼 있다.
// app.json에 값이 들어오면 그 값을 쓴다.
const IOS_BUNDLE_ID = "com.diggin.app.preview";

// app.json을 그대로 쓰고, 키가 필요한 플러그인과 Firebase 파일 경로만 환경에서 채운다.
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    config.android?.googleServicesFile ??
    (existsSync("./google-services.json") ? "./google-services.json" : undefined);
  if (
    process.env.EAS_BUILD_PLATFORM === "android" &&
    process.env.EAS_BUILD_PROFILE === "production" &&
    !googleServicesFile
  ) {
    throw new Error(
      "Android 운영 빌드에는 GOOGLE_SERVICES_JSON 또는 google-services.json 설정이 필요합니다.",
    );
  }
  return {
    ...config,
    ios: { ...config.ios, bundleIdentifier: config.ios?.bundleIdentifier ?? IOS_BUNDLE_ID },
    android: { ...config.android, googleServicesFile },
    plugins: withKakao(withGoogleSignIn(config.plugins ?? [])),
  } as ExpoConfig;
};
