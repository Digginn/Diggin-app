import type { ComponentProps } from "react";

import { AdminIcon } from "./AdminIcon";

export function CheckOption({
  title,
  description,
  ...props
}: Omit<ComponentProps<"input">, "type" | "className"> & { title: string; description: string }) {
  return (
    <label className="check-option">
      <input {...props} type="checkbox" className="check-option__input" />
      <span className="check-option__top">
        <span className="check-option__box" aria-hidden="true">
          {props.checked && <AdminIcon asset="sanction-check" size={12} />}
        </span>
        <span className="check-option__title">{title}</span>
      </span>
      <span className="check-option__description">{description}</span>
    </label>
  );
}
