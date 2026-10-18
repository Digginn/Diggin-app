import { useCallback, useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";

import { PRODUCT_PAGE_SCRIPT, type ProductPageRaw } from "../domain/productPageScript";

// 페이지 스크립트는 로드 뒤 최대 8초를 기다린다. 로드가 끝나지 않거나 스크립트가 못 돌면(쿠팡 빈 화면) 여기서 끊는다.
const READER_TIMEOUT_MS = 12000;

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
      // 쇼핑몰이 딥링크로 앱을 열려고 해도 사용자 모르게 다른 앱이 뜨지 않게 웹 이동만 허용한다.
      onShouldStartLoadWithRequest={(request) => /^https?:\/\//i.test(request.url)}
      // 쿠키를 남기지 않아 매번 처음 방문처럼 연다.
      incognito
      pointerEvents="none"
      // 휴대폰 화면 크기로 그려야 쇼핑몰이 모바일 페이지를 준다. 투명하게 두고 화면 뒤에 깐다.
      style={{ position: "absolute", width, height, opacity: 0, zIndex: -1 }}
    />
  );
}
