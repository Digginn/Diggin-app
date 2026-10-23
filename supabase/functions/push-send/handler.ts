// Expo는 요청 하나에 메시지 100개까지 받는다.
const EXPO_BATCH = 100;

export type PushNotification = {
  id: string;
  title: string;
  body: string;
  post_id: string;
  post_type: "post" | "vote";
  tokens: string[] | null;
};
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: { post_id: string; post_type: string };
  sound: "default";
  channelId: "default";
};
export type PushTicket = { status: "ok" } | { status: "error"; details?: { error?: string } };
type Services = {
  claim: () => Promise<PushNotification[]>;
  // 요청 전체가 실패하면 예외를 던진다. 성공하면 보낸 순서대로 ticket을 돌려준다.
  send: (messages: PushMessage[]) => Promise<PushTicket[]>;
  complete: (sentIds: string[], deadTokens: string[]) => Promise<void>;
};

/**
 * #139 pg_cron이 1분마다 부른다. 가져간 알림을 기기 토큰마다 한 건씩 보내고,
 * 한 기기라도 받았거나 남은 토큰이 모두 만료면 끝낸다. 나머지는 DB가 5분 뒤 다시 내준다.
 */
export function createPushSendHandler(services: Services) {
  return async () => {
    try {
      const notifications = await services.claim();
      const messages = notifications.flatMap((notification) =>
        (notification.tokens ?? []).map((token) => ({
          notification,
          message: {
            to: token,
            title: notification.title,
            body: notification.body,
            data: { post_id: notification.post_id, post_type: notification.post_type },
            sound: "default",
            channelId: "default",
          } satisfies PushMessage,
        }))
      );
      const delivered = new Set<string>();
      const failed = new Set<string>();
      const deadTokens: string[] = [];
      for (let start = 0; start < messages.length; start += EXPO_BATCH) {
        const batch = messages.slice(start, start + EXPO_BATCH);
        let tickets: PushTicket[];
        try {
          tickets = await services.send(batch.map(({ message }) => message));
        } catch {
          batch.forEach(({ notification }) => failed.add(notification.id));
          continue;
        }
        batch.forEach(({ notification, message }, index) => {
          const ticket = tickets[index];
          if (ticket?.status === "ok") delivered.add(notification.id);
          else if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            deadTokens.push(message.to);
          } else failed.add(notification.id);
        });
      }
      const sentIds = notifications
        .filter(({ id }) => delivered.has(id) || !failed.has(id))
        .map(({ id }) => id);
      await services.complete(sentIds, deadTokens);
      return Response.json({ claimed: notifications.length, sent: sentIds.length });
    } catch {
      return Response.json({ error: "push_send_failed" }, { status: 500 });
    }
  };
}
