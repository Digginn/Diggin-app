import { Linking } from "react-native";

import { useDetectedLink } from "@/hooks/useDetectedLink";
import { usePasteGuide } from "@/hooks/usePasteGuide";

import { FolderModal } from "./modal";
import { PasteGuideModal } from "./PasteGuideModal";

// 탭 화면 어디서든 떠야 해서 탭 레이아웃에서 한 번만 렌더함
type LinkDetectModalProps = {
  /** 불러오기를 누르면 저장 시트로 넘긴다. 화면마다 띄울 자리가 달라 바깥에서 받는다. */
  onLoad: (url: string) => void;
};

export function LinkDetectModal({ onLoad }: LinkDetectModalProps) {
  const { link, handle, hasReadClipboard } = useDetectedLink();
  // 링크 모달과 겹치지 않도록 그쪽을 닫은 뒤에 띄운다.
  const pasteGuide = usePasteGuide(hasReadClipboard && link === null);

  if (link !== null) {
    return (
      <FolderModal
        visible
        // TODO: 크롤링이 붙으면 productName 으로 아이템명을 넘긴다. 링크 아이콘과 배지가 같이 나온다.
        title="위시 아이템을 찾았어요."
        description="복사한 URL을 불러와 아이템을 저장할까요?"
        onBack={() => handle(link)}
        onLoad={() => onLoad(link)}
        onRequestClose={() => handle(link)}
      />
    );
  }

  return (
    <PasteGuideModal
      visible={pasteGuide.isVisible}
      onRequestClose={pasteGuide.dismiss}
      onOpenSettings={() => {
        pasteGuide.dismiss();
        // 앱의 설정 페이지로 보낸다. '다른 앱에서 붙여넣기' 항목이 그 안에 있다.
        void Linking.openSettings();
      }}
    />
  );
}
