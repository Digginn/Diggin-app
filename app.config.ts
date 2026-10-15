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

// app.json을 그대로 쓰고, 키가 필요한 플러그인만 .env 값으로 채운다.
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    plugins: withKakao(withGoogleSignIn(config.plugins ?? [])),
  }) as ExpoConfig;
