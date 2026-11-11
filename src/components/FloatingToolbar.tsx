import { clsx } from "clsx";
import type { FC } from "react";
import { Pressable, Text, View } from "react-native";

import BlockSvg from "@/assets/images/icon-block.svg";
import EditSvg from "@/assets/images/icon-edit.svg";
import ReportBlockDivider from "@/assets/images/icon-report-block-divider.svg";
import ReportMenuSvg from "@/assets/images/icon-report-menu.svg";
import ReportSvg from "@/assets/images/icon-report.svg";
import TrashSvg from "@/assets/images/icon-trash.svg";
import { colors } from "@/theme";

const ICON_SIZE = 18;
const WIDTH = 92;

type Row = {
  key: string;
  label: string;
  Icon: FC<{ width?: number; height?: number; color: string }>;
  color: string;
  onPress: () => void;
};

type FloatingToolbarProps = {
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
};

export function FloatingToolbar({ onEdit, onDelete, onReport, onBlock }: FloatingToolbarProps) {
  const rows: Row[] = [];
  if (onEdit) {
    rows.push({
      key: "edit",
      label: "수정하기",
      Icon: EditSvg,
      color: colors.gray[900],
      onPress: onEdit,
    });
  }
  if (onDelete) {
    rows.push({
      key: "delete",
      label: "삭제하기",
      Icon: TrashSvg,
      color: colors.semantic.error,
      onPress: onDelete,
    });
  }
  if (onReport) {
    rows.push({
      key: "report",
      label: "신고하기",
      Icon: onBlock ? ReportMenuSvg : ReportSvg,
      color: colors.semantic.error,
      onPress: onReport,
    });
  }
  if (onBlock)
    rows.push({
      key: "block",
      label: "차단하기",
      Icon: BlockSvg,
      color: colors.gray[900],
      onPress: onBlock,
    });
  const isReportBlock = !!onReport && !!onBlock;

  // 신고만 있는 구성은 높이 40, 나머지는 48 임
  const isReportOnly = rows.length === 1 && rows[0].key === "report";

  return (
    <View
      className="items-center justify-center"
      style={{ boxShadow: `0px 0px 10px ${colors.gray[1000]}33` }}
    >
      {rows.map((row, index) => (
        <View key={row.key} style={{ width: WIDTH }}>
          <Pressable
            accessibilityRole="button"
            className={clsx(
              "w-full flex-row items-center justify-between bg-gray-0 pl-2.5 pr-3 active:opacity-75",
              isReportOnly ? "h-10 rounded border-b border-gray-300" : "h-12",
              !isReportOnly && index === 0 && "rounded-t py-1",
              !isReportOnly && index === rows.length - 1 && "rounded-b",
            )}
            onPress={(event) => {
              event.stopPropagation();
              row.onPress();
            }}
          >
            {isReportBlock ? (
              <View className="size-6 items-center justify-center">
                <row.Icon color={row.color} />
              </View>
            ) : (
              <row.Icon width={ICON_SIZE} height={ICON_SIZE} color={row.color} />
            )}
            <Text
              className={clsx(
                "font-label-12-semibold",
                row.key === "edit"
                  ? "text-gray-800"
                  : row.key === "block"
                    ? "text-gray-900"
                    : "text-semantic-error",
              )}
            >
              {row.label}
            </Text>
          </Pressable>
          {index < rows.length - 1 ? (
            isReportBlock ? (
              <View pointerEvents="none" className="absolute -left-[0.75px] top-[47.25px]">
                <ReportBlockDivider />
              </View>
            ) : (
              <View className="h-px w-full bg-gray-300" />
            )
          ) : null}
        </View>
      ))}
    </View>
  );
}
