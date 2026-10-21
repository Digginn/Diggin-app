import type { ComponentProps } from "react";

import { IconNotification, IconNotificationDot } from "@/assets/images/appbar";
import { useHasUnreadNotifications } from "@/hooks/useHasUnreadNotifications";

import { IconButton } from "./IconButton";

type NotificationButtonProps = Omit<
  ComponentProps<typeof IconButton>,
  "icon" | "accessibilityLabel"
>;

export function NotificationButton(props: NotificationButtonProps) {
  const hasUnread = useHasUnreadNotifications();
  return (
    <IconButton
      {...props}
      icon={hasUnread ? IconNotificationDot : IconNotification}
      accessibilityLabel={hasUnread ? "알림, 새 알림 있음" : "알림"}
    />
  );
}
