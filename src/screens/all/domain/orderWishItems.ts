import type { WishItem } from "@/types/wish-item";

/** 일반 아이템 순서는 유지하고, 소장템은 뒤에서 최근 소장 순으로 표시한다. */
export function orderWishItems(items: readonly WishItem[]): WishItem[] {
  return [...items].sort((left, right) => {
    const ownershipOrder = Number(Boolean(left.isOwned)) - Number(Boolean(right.isOwned));
    if (ownershipOrder !== 0) return ownershipOrder;
    return left.isOwned ? (right.ownedAt ?? 0) - (left.ownedAt ?? 0) : 0;
  });
}
