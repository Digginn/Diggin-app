import type { ComponentProps } from "react";

import { AdminIcon, type AdminIconName, type IconAsset } from "./AdminIcon";

export function NavItem({
  label,
  count,
  isActive = false,
  icon = "report",
  iconAsset,
  className = "",
  ...props
}: Omit<ComponentProps<"a">, "children"> & {
  label: string;
  count?: number;
  isActive?: boolean;
  icon?: AdminIconName;
  iconAsset?: IconAsset;
}) {
  return (
    <a {...props} className={`nav-item ${className}`} aria-current={isActive ? "page" : undefined}>
      {iconAsset ? (
        <AdminIcon asset={iconAsset} size={20} />
      ) : icon === "report" && !isActive ? (
        <AdminIcon asset="nav-report" size={20} />
      ) : icon === "shield" || icon === "user" ? (
        <AdminIcon asset={`nav-${icon}${isActive ? "-active" : ""}`} size={20} />
      ) : (
        <AdminIcon name={icon} size={20} />
      )}
      <span className="nav-item__label">{label}</span>
      {count !== undefined && <span className="nav-item__count">{count}</span>}
    </a>
  );
}
