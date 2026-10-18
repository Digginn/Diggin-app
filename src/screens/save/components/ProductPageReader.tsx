import { useCallback, useEffect, useRef } from "react";
import { View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";

import { PRODUCT_PAGE_SCRIPT, type ProductPageRaw } from "../domain/productPageScript";

// 페이지 스크립트는 페이지마다 최대 8초를 기다린다. 앱 공유 링크는 중간 페이지를 한 번 더 거친다.
// 로드가 끝나지 않거나 스크립트가 못 돌면(쿠팡 빈 화면) 여기서 끊는다.
const READER_TIMEOUT_MS = 15000;

type ProductPageReaderProps = {
  url: string;
  /** 다 읽으면 페이지 재료를, 실패하면 null을 한 번만 넘긴다. */
  onDone: (raw: ProductPageRaw | null) => void;
};

/**
 * SAVE-005 사용자가 넣은 링크 한 페이지만 숨긴 WebView로 열어 공개 정보를 읽는다.
 * 서버가 아니라 사용자 기기에서 여는 건 쇼핑몰의 서버 차단과 한 곳에서의 대량 수집을 피하려는 것이다(#84).
 */
export function ProductPageReader({ url, onDone }: ProductPageReaderProps) {
  const { width, height } = useWindowDimensions();
  const isDoneRef = useRef(false);
  const finish = useCallback(
    (raw: ProductPageRaw | null) => {
      if (isDoneRef.current) return;
      isDoneRef.current = true;
      onDone(raw);
    },
    [onDone],
  );

  useEffect(() => {
    const timer = setTimeout(() => finish(null), READER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [finish]);

  return (
    // iOS 웹뷰는 투명해도 터치를 가져갈 수 있어 크기 0인 틀 안에 넣는다. 안의 웹뷰는 휴대폰 화면 크기로 그려야 쇼핑몰이 모바일 페이지를 준다.
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <WebView
        source={{ uri: url }}
        injectedJavaScript={PRODUCT_PAGE_SCRIPT}
        onMessage={(event) => {
          try {
            finish(JSON.parse(event.nativeEvent.data) as ProductPageRaw);
          } catch {
            finish(null);
          }
        }}
        onError={() => finish(null)}
        // 쇼핑몰이 딥링크(ably:// 등)로 앱을 열려고 해도 사용자 모르게 다른 앱이 뜨지 않게 웹 이동만 허용한다.
        // originWhitelist 밖의 주소는 WebView가 Linking.openURL로 바깥 앱을 열어 버리므로 전부 아래 판단으로 보낸다.
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(request) => /^https?:\/\//i.test(request.url)}
        // 쿠키를 남기지 않아 매번 처음 방문처럼 연다.
        incognito
        // window.open·target=_blank도 새 창 없이 이 웹뷰 안에서만 연다.
        setSupportMultipleWindows={false}
        style={{ width, height }}
      />
    </View>
  );
}
