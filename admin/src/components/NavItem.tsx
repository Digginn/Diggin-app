import type { ComponentProps } from "react";

import { AdminIcon, type AdminIconName } from "./AdminIcon";

export function NavItem({
  label,
  count,
  isActive = false,
  icon = "report",
  ...props
}: Omit<ComponentProps<"a">, "children"> & {
  label: string;
  count?: number;
  isActive?: boolean;
  icon?: AdminIconName;
}) {
  return (
    <a {...props} className="nav-item" aria-current={isActive ? "page" : undefined}>
      {icon === "report" && !isActive ? (
        <AdminIcon asset="nav-report" size={20} />
      ) : (
        <AdminIcon name={icon} size={20} />
      )}
      <span className="nav-item__label">{label}</span>
      {count !== undefined && <span className="nav-item__count">{count}</span>}
    </a>
  );
}
