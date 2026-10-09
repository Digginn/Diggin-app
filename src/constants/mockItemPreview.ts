import type { ItemSaveValues } from "@/types/wish-item";

// TODO: 크롤링 연결 전까지 쓰는 임시 데이터. 연결 시 실제 응답으로 교체한다.
export const MOCK_ITEM_PREVIEW: Omit<ItemSaveValues, "sourceUrl"> = {
  name: "Real Good Pants 엄청 좋은 바지",
  brand: "리얼굿",
  price: "70,000원",
  thumbnailUrl: "https://picsum.photos/id/1027/400/400",
  wishLevel: null,
};
