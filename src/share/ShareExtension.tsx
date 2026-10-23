import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { close, openHostApp, type InitialProps } from "expo-share-extension";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ToastProvider } from "@/contexts/ToastContext";
import { keepShareLink } from "@/lib/pendingShareLink";
import { queryClient } from "@/lib/queryClient";
import { ShareSaveScreen } from "@/screens/save/ShareSaveScreen";

/** SYS-014 다른 앱 위에 뜨는 공유 확장. 쇼핑 앱을 떠나지 않고 아이템 정보 시트(SAVE-06)에서 저장한다. */
export default function ShareExtension({ url, text }: InitialProps) {
  // 확장은 Info.plist의 폰트만으로는 Pretendard가 그려지지 않아, 앱처럼 직접 불러온 뒤 그린다.
  const [isFontLoaded, fontError] = useFonts({
    "Pretendard-Regular": require("@/assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("@/assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("@/assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("@/assets/fonts/Pretendard-Bold.otf"),
  });
  if (!isFontLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {/* 링크 칸에 앱 주소를, 글자 칸에 웹 링크를 함께 넘기는 앱이 있어 둘 다 본다. */}
          <ShareSaveScreen
            shared={[url, text].filter(Boolean).join(" ")}
            onClose={close}
            onLogin={(link) => {
              keepShareLink(link);
              openHostApp("login");
            }}
            onOpenItem={(id) => openHostApp(`items/${id}`)}
          />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
