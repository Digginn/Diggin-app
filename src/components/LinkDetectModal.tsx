import { useRef, useState } from "react";
import { Linking, Platform } from "react-native";

import { useDetectedLink } from "@/hooks/useDetectedLink";
import { usePasteGuide } from "@/hooks/usePasteGuide";

import { FolderModal } from "./modal";
import { PasteGuideModal } from "./PasteGuideModal";

type LinkDetectModalProps = {
  /** 불러오기를 누르면 저장 시트로 넘긴다. 화면마다 띄울 자리가 달라 바깥에서 받는다. */
  onLoad: (url: string) => void;
  /** 저장 시트처럼 다른 창이 떠 있으면 안내를 미룬다. 겹치면 가린다. */
  isBusy?: boolean;
};

// 탭 화면 어디서든 떠야 해서 탭 레이아웃에서 한 번만 렌더함
export function LinkDetectModal({ onLoad, isBusy = false }: LinkDetectModalProps) {
  const { isDetected, readLink, handle, close, needsPasteGuide } = useDetectedLink();
  // 닫히는 애니메이션이 끝나면 넘길 링크. iOS 는 닫히는 중에 다른 모달을 띄우면 무시한다.
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const isReadingRef = useRef(false);
  const pasteGuide = usePasteGuide(
    needsPasteGuide && !isDetected && pendingLink === null && !isBusy,
  );

  async function load() {
    if (isReadingRef.current) return;
    isReadingRef.current = true;
    try {
      // iOS는 여기서 클립보드를 읽어 붙여넣기 허용 팝업이 뜬다(SAVE-017).
      const link = await readLink();
      if (!link) {
        close();
        return;
      }
      handle(link);
      setPendingLink(link);
      // 안드로이드는 이어서 띄워도 가려지지 않아 기다릴 필요가 없다.
      if (Platform.OS !== "ios") onLoad(link);
    } finally {
      isReadingRef.current = false;
    }
  }

  function handOff() {
    if (pendingLink === null) return;
    onLoad(pendingLink);
    setPendingLink(null);
  }

  return (
    <>
      <FolderModal
        visible={isDetected}
        title="위시 아이템을 찾았습니다."
        description="복사한 링크를 불러와 저장하시겠습니까?"
        onBack={() => handle(null)}
        onLoad={() => void load()}
        onDismiss={Platform.OS === "ios" ? handOff : undefined}
        onRequestClose={() => handle(null)}
      />

      <PasteGuideModal
        visible={pasteGuide.isVisible}
        onRequestClose={pasteGuide.dismiss}
        onOpenSettings={() => {
          pasteGuide.dismiss();
          // '다른 앱에서 붙여넣기' 항목이 앱 설정 페이지 안에 있다.
          void Linking.openSettings();
        }}
      />
    </>
  );
}
