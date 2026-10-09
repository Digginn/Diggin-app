import type { ItemSaveValues } from "./components/ItemSaveSheet";

/**
 * 링크에서 아이템 정보를 불러온다.
 *
 * TODO: 크롤링 API 로 교체한다. 지금은 불러오기에 성공했다고 보고 샘플을 돌려준다.
 * 실패를 돌려줄 때는 null 을 주면 저장 시트가 직접 입력 상태로 열린다.
 */
export async function fetchItemPreview(sourceUrl: string): Promise<ItemSaveValues | null> {
  return {
    name: "Real Good Pants 엄청 좋은 바지",
    brand: "리얼굿",
    price: "70,000원",
    sourceUrl,
    thumbnailUrl: "https://picsum.photos/id/1027/400/400",
    wishLevel: null,
  };
}
