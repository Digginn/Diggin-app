import { useState } from "react";

import { TOAST_MESSAGES } from "@/constants/messages";
import { useDetectedLink } from "@/hooks/useDetectedLink";

import { FolderModal } from "./modal";
import { Toast } from "./Toast";

// TODO: 크롤링 API 연결 전까지 쓰는 예시 데이터.
const MOCK_PRODUCT_NAME = "[매출 1위] 아주 귀여운 집들이 가구 엄청 귀여움";

// 어느 화면에서든 떠야 해서 루트 레이아웃에서 한 번만 렌더함
export function LinkDetectModal() {
  const { hasLink, dismiss, read } = useDetectedLink();
  const [failMessage, setFailMessage] = useState<string | null>(null);

  async function handleLoad() {
    const url = await read();
    if (!url) {
      setFailMessage(TOAST_MESSAGES.SAVE_003);
      return;
    }
    // TODO: 불러온 링크를 아이템 저장 API 로 넘긴다.
  }

  return (
    <>
      <FolderModal
        visible={hasLink}
        title="위시 아이템을 찾았어요."
        productName="상품명"
        description={MOCK_PRODUCT_NAME}
        onBack={dismiss}
        onLoad={handleLoad}
        onRequestClose={dismiss}
      />
      {failMessage ? <Toast message={failMessage} onHide={() => setFailMessage(null)} /> : null}
    </>
  );
}
