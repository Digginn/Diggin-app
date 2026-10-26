import { cssInterop } from "nativewind";
import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import IconBackRaw from "./icon-appbar-back.svg";
import IconKebabRaw from "./icon-appbar-kebab.svg";
import IconNotificationDotRaw from "./icon-appbar-notification-dot.svg";
import IconNotificationRaw from "./icon-appbar-notification.svg";
import IconReportRaw from "./icon-appbar-report.svg";
import IconSearchRaw from "./icon-appbar-search.svg";

export type SvgIcon = FC<SvgProps & { className?: string }>;

function withColorClass(Icon: FC<SvgProps>): SvgIcon {
  return cssInterop(Icon, {
    className: { target: false, nativeStyleToProp: { color: true } },
  }) as SvgIcon;
}

export const IconBack = withColorClass(IconBackRaw);
export const IconKebab = withColorClass(IconKebabRaw);
export const IconNotification = withColorClass(IconNotificationRaw);
export const IconNotificationDot = withColorClass(IconNotificationDotRaw);
export const IconReport = withColorClass(IconReportRaw);
export const IconSearch = withColorClass(IconSearchRaw);
