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
