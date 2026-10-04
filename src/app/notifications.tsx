import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Linking } from "react-native";

import type { NotificationItem } from "@/screens/notification/components/NotificationRow";
import { NotificationScreen } from "@/screens/notification/NotificationScreen";

// UI 확인용 샘플입니다. 운영 앱에서는 실제 알림 데이터 연결 전까지 빈 목록을 표시합니다.
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

export default function NotificationsRoute() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isErrorPreview = __DEV__ && preview === "error";
  return (
    <NotificationScreen
      isError={isErrorPreview}
      isDevicePushEnabled={!(__DEV__ && preview === "push-off")}
      onOpenNotificationSettings={() => {
        Linking.openSettings().catch(() =>
          Alert.alert("설정을 열지 못했습니다", "기기 설정에서 앱 알림을 허용해 주세요."),
        );
      }}
      onRetry={isErrorPreview ? () => router.setParams({ preview: undefined }) : undefined}
      isLoading={__DEV__ && preview === "loading"}
      notifications={
        __DEV__ && preview !== "empty"
          ? preview === "push-off"
            ? PREVIEW_NOTIFICATIONS.map((notification, index) => ({
                ...notification,
                message: PUSH_OFF_PREVIEW_MESSAGES[index],
              }))
            : PREVIEW_NOTIFICATIONS
          : []
      }
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/all");
      }}
    />
  );
}
