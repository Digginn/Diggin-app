import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import FolderTopSmall from "@/assets/images/folder/image-closed-folder-top-small.svg";
import FolderTop from "@/assets/images/folder/image-closed-folder-top.svg";
import { colors } from "@/theme";

/** Figma FolderShape의 배경과 전경. PNG에 포함됐던 바깥 배경 없이 벡터로 표시한다. */
export function ClosedFolder({ isCompact }: { isCompact: boolean }) {
  const width = isCompact ? 74 : 112;
  const height = isCompact ? 56.173912048339844 : 85;
  const radius = isCompact ? 4.26 : 6.391;
  const border = isCompact ? 1 / 3 : 0.5;
  const top = (isCompact ? 2.95652174949646 : 5) - border / 2;

  return (
    <Svg width={width} height={height} style={{ overflow: "visible" }}>
      <Defs>
        <LinearGradient
          id="closedFolderBackground"
          x1={0}
          y1={0}
          x2={0}
          y2={height}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="24.118%" stopColor="#E5E5E5" />
          <Stop offset="100%" stopColor={colors.gray[0]} stopOpacity={0.68} />
        </LinearGradient>
      </Defs>
      <Rect
        x={border / 2}
        y={border / 2}
        width={width - border}
        height={height - border}
        rx={radius - border / 2}
        fill="url(#closedFolderBackground)"
        stroke={colors.gray[0]}
        strokeWidth={border}
      />
      {isCompact ? (
        <FolderTopSmall x={-border / 2} y={top} />
      ) : (
        <FolderTop x={-border / 2} y={top} />
      )}
    </Svg>
  );
}
