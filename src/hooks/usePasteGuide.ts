import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// TODO: 팀 확인이 끝나면 아래 주석을 풀어 1회만 뜨게 되돌린다.
// import AsyncStorage from "@react-native-async-storage/async-storage";
// const STORAGE_KEY = "paste-guide-seen";

/**
 * 붙여넣기 설정 안내를 띄운다.
 *
 * iOS 는 클립보드를 읽을 때마다 시스템 팝업이 뜨는데, 설정에서 '허용'으로 바꾸면 다시 묻지 않는다.
 * 그 경로를 알려주는 안내라 팝업을 한 번 겪은 뒤에 띄운다. 안드로이드는 이 팝업 자체가 없다.
 *
 * 원래는 평생 한 번만 띄우는데, 팀이 화면을 확인할 수 있도록 그 제한을 잠시 꺼뒀다.
 * 지금은 앱을 켤 때마다 한 번씩 뜬다.
 */
export function usePasteGuide(hasReadClipboard: boolean) {
  const [isVisible, setVisible] = useState(false);
  const isCheckedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "ios" || !hasReadClipboard || isCheckedRef.current) return;
    isCheckedRef.current = true;
    setVisible(true);

    // AsyncStorage.getItem(STORAGE_KEY)
    //   .then((seen) => {
    //     if (!seen) setVisible(true);
    //   })
    //   .catch(() => {
    //     // 저장소를 못 읽으면 안내를 건너뛴다. 반복해서 띄우는 것보다 낫다.
    //   });
  }, [hasReadClipboard]);

  // 어느 버튼을 눌렀든 다시 띄우지 않는다.
  const dismiss = useCallback(() => {
    setVisible(false);
    // void AsyncStorage.setItem(STORAGE_KEY, "1");
  }, []);

  return { isVisible, dismiss };
}
