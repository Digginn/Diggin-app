import { useState } from "react";
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
  const { link, handle, hasReadClipboard } = useDetectedLink();
  // 닫히는 애니메이션이 끝나면 넘길 링크. iOS 는 닫히는 중에 다른 모달을 띄우면 무시한다.
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const pasteGuide = usePasteGuide(
    hasReadClipboard && link === null && pendingLink === null && !isBusy,
  );

  function handOff() {
    if (pendingLink === null) return;
    onLoad(pendingLink);
    setPendingLink(null);
  }

  return (
    <>
      <FolderModal
        visible={link !== null}
        // TODO: 크롤링이 붙으면 productName 으로 아이템명을 넘긴다. 링크 아이콘과 배지가 같이 나온다.
        title="위시 아이템을 찾았어요."
        description="복사한 URL을 불러와 아이템을 저장할까요?"
        onBack={() => link && handle(link)}
        onLoad={() => {
          if (!link) return;
          setPendingLink(link);
          handle(link);
          // 안드로이드는 이어서 띄워도 가려지지 않아 기다릴 필요가 없다.
          if (Platform.OS !== "ios") onLoad(link);
        }}
        onDismiss={Platform.OS === "ios" ? handOff : undefined}
        onRequestClose={() => link && handle(link)}
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
