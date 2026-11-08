import { clsx } from "clsx";
import { cssInterop } from "nativewind";
import { Pressable, Text } from "react-native";

import SortSvg from "@/assets/images/icon-sort.svg";

const SortIcon = cssInterop(SortSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export type SortOrder = "latest" | "oldest";

const SORT_LABELS: Record<SortOrder, string> = {
  latest: "최신 순",
  oldest: "오래된 순",
};

const NEXT_ORDER: Record<SortOrder, SortOrder> = {
  latest: "oldest",
  oldest: "latest",
};

type SortLabelProps = {
  value: SortOrder;
  onChange: (value: SortOrder) => void;
  className?: string;
};

export function SortLabel({ value, onChange, className }: SortLabelProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`정렬 ${SORT_LABELS[value]}, 누르면 ${SORT_LABELS[NEXT_ORDER[value]]}으로 바뀝니다`}
      className={clsx("h-12 shrink-0 flex-row items-center justify-end gap-1", className)}
      onPress={() => onChange(NEXT_ORDER[value])}
    >
      <Text className="text-gray-600 font-label-12-semibold">{SORT_LABELS[value]}</Text>
      <SortIcon className="size-4" />
    </Pressable>
  );
}
