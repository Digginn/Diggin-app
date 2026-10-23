import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Linking } from "react-native";

import { MemberOnly } from "@/components/MemberOnly";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { formatCommunityTime } from "@/screens/diggle/utils/formatCommunityTime";
import type { NotificationItem } from "@/screens/notification/components/NotificationRow";
import { useDevicePushOff } from "@/screens/notification/hooks/useDevicePushOff";
import { NotificationScreen } from "@/screens/notification/NotificationScreen";
import { useNotificationCheck } from "@/screens/notification/queries/useNotificationCheck";
import { useNotifications } from "@/screens/notification/queries/useNotifications";

// 개발 빌드에서 ?preview= 로 화면 상태를 확인하는 샘플이다. 운영에서는 실제 알림만 보인다.
const PREVIEW_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "vote-unread",
    title: "투표 결과가 나왔어요",
    message:
      "'이 가격에 사도 괜찮을까요? 할인할 때까지 기다릴지 계속 정말 고민돼요' 투표가 종료됐어요. BUY 6,789 · NOT 5,556",
    timeLabel: "방금 전",
    isRead: false,
  },
  {
    id: "comment-unread",
    title: "내 게시글에 댓글이 달렸어요",
    message: "디기 999: 왼쪽이 훨씬 예뻐요! 오늘 할인하던데 지금 꼭 사세요!",
    timeLabel: "1시간 전",
    isRead: false,
  },
  {
    id: "like-read",
    title: "내 게시글에 좋아요가 달렸어요",
    message:
      "'그레이랑 블랙 둘 다 너무 예쁜데 데일리로 입기엔 어떤 색이 더 나을까요?' 게시글을 누군가 좋아해요.",
    timeLabel: "3시간 전",
    isRead: true,
  },
  {
    id: "vote-read",
    title: "투표 결과가 나왔어요",
    message:
      "'이 가격에 사도 괜찮을까요? 할인할 때까지 기다릴지 계속 정말 고민돼요' 투표가 종료됐어요. BUY 1,234 · NOT 5,678",
    timeLabel: "2026.09.12",
    isRead: true,
  },
];

const PUSH_OFF_PREVIEW_MESSAGES = [
  "'이 가격에 사도 괜찮을까요?' 투표가 종료됐어요. BUY 12 · NOT 5",
  "디기 1: 둘 다 예쁜데 왼쪽이 더 데일리로 좋아요",
  "'둘 다 너무 예뻐서 고민 중이에요...' 게시글을 누군가 좋아해요.",
  "'겨울 패딩 이거 괜찮나요?' 투표가 종료됐어요. BUY 3 · NOT 9",
];

function NotificationsContent() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = __DEV__ && preview !== undefined;
  const isErrorPreview = __DEV__ && preview === "error";
  const devicePush = useDevicePushOff();
  const showToast = useToast();
  const list = useNotifications();
  const check = useNotificationCheck();
  const items = list.data?.pages.flat() ?? [];
  return (
    <NotificationScreen
      isError={isPreview ? isErrorPreview : list.isError}
      isDevicePushEnabled={!(__DEV__ && preview === "push-off") && !devicePush.isPushOff}
      bannerDismissedUntil={devicePush.dismissedUntil}
      onDismissPushBanner={devicePush.dismiss}
      onOpenNotificationSettings={() => {
        Linking.openSettings().catch(() =>
          Alert.alert("설정을 열지 못했습니다", "기기 설정에서 앱 알림을 허용해 주세요."),
        );
      }}
      onRetry={
        isErrorPreview
          ? () => router.setParams({ preview: undefined })
          : isPreview
            ? undefined
            : () => void list.refetch()
      }
      isLoading={isPreview ? preview === "loading" : list.isPending || check.isPending}
      isLoadingMore={!isPreview && list.isFetchingNextPage}
      onEndReached={() => {
        if (!isPreview && list.hasNextPage && !list.isFetching && !list.isFetchNextPageError)
          void list.fetchNextPage();
      }}
      notifications={
        isPreview
          ? preview === "empty"
            ? []
            : preview === "push-off"
              ? PREVIEW_NOTIFICATIONS.map((notification, index) => ({
                  ...notification,
                  message: PUSH_OFF_PREVIEW_MESSAGES[index],
                }))
              : PREVIEW_NOTIFICATIONS
          : items.map((notification) => ({
              id: notification.id,
              title: notification.title,
              message: notification.body,
              timeLabel: formatCommunityTime(notification.createdAt),
              // 확인 처리에 실패하면 점이 남아 있으니 목록은 모두 읽은 모양으로 둔다.
              isRead:
                check.isError ||
                (check.data != null &&
                  Date.parse(notification.createdAt) <= Date.parse(check.data)),
            }))
      }
      onPressNotification={(item) => {
        const notification = items.find((entry) => entry.id === item.id);
        if (!notification) return;
        // NOTI-006 지워진 글은 이동하지 않고 목록에서 안내한다.
        if (!notification.isPostAvailable) {
          showToast(
            notification.postType === "vote" ? TOAST_MESSAGES.VOTE_007 : TOAST_MESSAGES.NOTI_004,
            "error",
          );
          return;
        }
        router.push({
          pathname: notification.postType === "vote" ? "/votes/[id]" : "/posts/[id]",
          params: { id: notification.postId },
        });
      }}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/all");
      }}
    />
  );
}

export default function NotificationsRoute() {
  return (
    <MemberOnly title="알림">
      <NotificationsContent />
    </MemberOnly>
  );
}
