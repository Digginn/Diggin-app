import type { ItemSaveValues } from "@/types/wish-item";

import type { CommunityItem } from "../types/community";

export function snapshotSaveValues(item: CommunityItem): ItemSaveValues {
  return {
    name: item.name ?? "",
    brand: item.brand ?? "",
    price: item.price === null ? "" : String(item.price),
    sourceUrl: item.url ?? "",
    thumbnailUrl: item.imageUrl,
    wishLevel: null,
  };
}

export function normalizeSaveValues(values: ItemSaveValues): ItemSaveValues {
  return {
    ...values,
    name: values.name.normalize("NFC").trim(),
    brand: values.brand.normalize("NFC").trim(),
  };
}

export function communitySaveErrors(values: ItemSaveValues) {
  const normalized = normalizeSaveValues(values);
  const nameLength = [...normalized.name].length;
  return {
    name: nameLength < 1 || nameLength > 100 ? "아이템명은 1~100자로 입력해 주세요." : undefined,
    brand: [...normalized.brand].length > 30 ? "브랜드명은 최대 30자로 입력해 주세요." : undefined,
    price:
      values.price !== "" && (!/^\d+$/.test(values.price) || Number(values.price) > 2147483647)
        ? "가격은 0~2,147,483,647원으로 입력해 주세요."
        : undefined,
  };
}

// 저장을 마치고 돌아간 상세가 상품 정보 시트를 다시 열지 않게 남긴다. 그냥 뒤로 가면 시트로 돌아간다.
let savedItemId: string | null = null;

export function markCommunityItemSaved(itemId: string) {
  savedItemId = itemId;
}

export function takeCommunityItemSaved(itemId: string) {
  const isSaved = savedItemId === itemId;
  savedItemId = null;
  return isSaved;
}
