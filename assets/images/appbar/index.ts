import { cssInterop } from "nativewind";
import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import IconBackRaw from "./icon-appbar-back.svg";
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
export const IconNotification = withColorClass(IconNotificationRaw);
export const IconReport = withColorClass(IconReportRaw);
export const IconSearch = withColorClass(IconSearchRaw);
