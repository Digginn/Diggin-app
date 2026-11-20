import type { CSSProperties } from "react";

// SVG 경로는 Figma 원본 그대로 사용하고 단색만 인스턴스의 currentColor로 바꾼다.
const ASSETS = import.meta.glob<string>("../assets/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

export const ICON_NAMES = [
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "search",
  "close",
  "report",
  "more",
  "info",
  "eye",
  "eye-off",
  "shield",
  "refresh",
  "check",
  "user",
  "clock",
  "ban",
  "warning",
  "unlock",
  "logout",
] as const;

export type AdminIconName = (typeof ICON_NAMES)[number];
export type IconAsset =
  | `icon-${AdminIconName}`
  | "status-received"
  | "status-reviewing"
  | "status-resolved"
  | "status-rejected"
  | "history-dot"
  | "row-chevron"
  | "button-refresh-m"
  | "button-refresh-s"
  | "sanction-check"
  | "visibility-eye"
  | "visibility-eye-off"
  | "visibility-hide"
  | "visibility-restore"
  | "toast-check"
  | "nav-report"
  | "nav-shield"
  | "nav-user"
  | "search-field"
  | "search-clear"
  | "detail-back"
  | "detail-eye"
  | "detail-avatar"
  | "detail-ban"
  | "detail-current-ban"
  | "detail-warning"
  | "select-chevron"
  | "pagination-left"
  | "pagination-right"
  | `summary-${"received" | "reviewing" | "resolved" | "rejected"}`;

export function AdminIcon({
  name,
  asset,
  size = 24,
}: ({ name: AdminIconName; asset?: never } | { asset: IconAsset; name?: never }) & {
  size?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 22 | 24;
}) {
  const source = ASSETS[`../assets/${asset ?? `icon-${name}`}.svg`];
  // 슬롯별 SVG의 혼합 색상도 보존한다. 색 전환이 필요한 행 화살표·이력 점만 마스크를 쓴다.
  if (
    asset &&
    !["history-dot", "row-chevron", "button-refresh-m", "button-refresh-s"].includes(asset)
  ) {
    return (
      <img
        className="admin-svg"
        src={source}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
      />
    );
  }
  const style: CSSProperties = {
    width: size,
    height: size,
    maskImage: `url("${source}")`,
    WebkitMaskImage: `url("${source}")`,
  };
  return <span className="admin-icon" style={style} aria-hidden="true" />;
}

export function AdminWordmark() {
  return (
    <img
      className="admin-wordmark"
      src={ASSETS["../assets/wordmark-admin.svg"]}
      alt="Diggin"
      width="80"
      height="25.6"
    />
  );
}
