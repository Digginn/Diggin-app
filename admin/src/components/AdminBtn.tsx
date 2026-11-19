import type { ComponentProps } from "react";

import { AdminIcon, type AdminIconName } from "./AdminIcon";

export type AdminBtnVariant = "primary" | "secondary" | "outline" | "danger" | "disabled";

export function AdminBtn({
  variant = "primary",
  size = "m",
  icon,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant?: AdminBtnVariant;
  size?: "m" | "s";
  icon?: AdminIconName;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || variant === "disabled"}
      className={`admin-btn admin-btn--${variant} admin-btn--${size} ${className}`}
    >
      {icon === "refresh" ? (
        <AdminIcon asset={`button-refresh-${size}`} size={size === "m" ? 20 : 16} />
      ) : icon ? (
        <AdminIcon name={icon} size={size === "m" ? 20 : 16} />
      ) : null}
      {children}
    </button>
  );
}
