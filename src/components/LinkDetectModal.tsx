import { useDetectedLink } from "@/hooks/useDetectedLink";

import { FolderModal } from "./modal";

// 어느 화면에서든 떠야 해서 루트 레이아웃에서 한 번만 렌더함
export function LinkDetectModal() {
  const { link, handle } = useDetectedLink();

  if (link === null) return null;

  return (
    <FolderModal
      visible
      // TODO: 크롤링이 붙으면 productName 으로 아이템명을 넘긴다. 링크 아이콘과 배지가 같이 나온다.
      title="위시 아이템을 찾았어요."
      description="복사한 URL을 불러와 아이템을 저장할까요?"
      onBack={() => handle(link)}
      onLoad={() => {
        // TODO: SAVE-07 · SAVE-08 등록 창으로 URL 을 채워 넘긴다.
        handle(link);
      }}
      onRequestClose={() => handle(link)}
    />
  );
}
