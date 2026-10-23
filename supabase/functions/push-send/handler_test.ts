import {
  createPushSendHandler,
  type PushMessage,
  type PushNotification,
  type PushTicket,
} from "./handler.ts";

function assert(value: unknown, message = "assertion_failed") {
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}
function notification(id: string, tokens: string[] | null): PushNotification {
  return {
    id,
    title: "제목 " + id,
    body: "본문 " + id,
    post_id: "9" + id,
    post_type: "post",
    tokens,
  };
}
function setup(
  notifications: PushNotification[],
  reply: (messages: PushMessage[]) => PushTicket[] | Error,
) {
  const sent: PushMessage[][] = [];
  const completed: { sentIds: string[]; deadTokens: string[] }[] = [];
  const handler = createPushSendHandler({
    claim: () => Promise.resolve(notifications),
    send: (messages) => {
      sent.push(messages);
      const result = reply(messages);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    complete: (sentIds, deadTokens) => {
      completed.push({ sentIds, deadTokens });
      return Promise.resolve();
    },
  });
  return { handler, sent, completed };
}
const ok = (messages: PushMessage[]) => messages.map((): PushTicket => ({ status: "ok" }));

Deno.test("기기 토큰마다 한 건씩 보내고 누르면 열 글을 data에 담는다", async () => {
  const { handler, sent, completed } = setup([notification("1", ["t1", "t2"])], ok);
  assert((await handler()).status === 200);
  same(sent[0].map(({ to }) => to), ["t1", "t2"]);
  same(sent[0][0], {
    to: "t1",
    title: "제목 1",
    body: "본문 1",
    data: { post_id: "91", post_type: "post" },
    sound: "default",
    channelId: "default",
  });
  same(completed, [{ sentIds: ["1"], deadTokens: [] }]);
});

Deno.test("Expo 요청 하나에 100건씩 나눠 보낸다", async () => {
  const tokens = Array.from({ length: 150 }, (_, index) => "t" + index);
  const { handler, sent } = setup([notification("1", tokens)], ok);
  await handler();
  same(sent.map((batch) => batch.length), [100, 50]);
});

Deno.test("만료 토큰은 지우고, 남은 토큰이 모두 만료면 알림을 끝낸다", async () => {
  const { handler, completed } = setup(
    [notification("1", ["dead", "live"]), notification("2", ["dead2"])],
    (messages) =>
      messages.map(({ to }): PushTicket =>
        to.startsWith("dead")
          ? { status: "error", details: { error: "DeviceNotRegistered" } }
          : { status: "ok" }
      ),
  );
  await handler();
  same(completed, [{ sentIds: ["1", "2"], deadTokens: ["dead", "dead2"] }]);
});

Deno.test("일시 오류만 받은 알림은 끝내지 않아 다음에 다시 보낸다", async () => {
  const { handler, completed } = setup(
    [notification("1", ["rate"]), notification("2", ["ok", "rate2"])],
    (messages) =>
      messages.map(({ to }): PushTicket =>
        to.startsWith("rate")
          ? { status: "error", details: { error: "MessageRateExceeded" } }
          : { status: "ok" }
      ),
  );
  await handler();
  // 2는 한 기기가 받았으니 다시 보내면 그 기기에 중복으로 간다.
  same(completed, [{ sentIds: ["2"], deadTokens: [] }]);
});

Deno.test("Expo 요청이 통째로 실패하면 그 묶음의 알림을 끝내지 않는다", async () => {
  const tokens = Array.from({ length: 101 }, (_, index) => "t" + index);
  let calls = 0;
  const { handler, completed } = setup(
    [notification("1", tokens.slice(0, 100)), notification("2", tokens.slice(100))],
    (messages) => ++calls === 1 ? ok(messages) : new Error("down"),
  );
  await handler();
  same(completed, [{ sentIds: ["1"], deadTokens: [] }]);
});

Deno.test("보낼 알림이 없으면 Expo를 부르지 않는다", async () => {
  const { handler, sent, completed } = setup([], ok);
  same(await (await handler()).json(), { claimed: 0, sent: 0 });
  same(sent, []);
  same(completed, [{ sentIds: [], deadTokens: [] }]);
});

Deno.test("가져오기나 마무리에 실패하면 500을 돌려준다", async () => {
  const handler = createPushSendHandler({
    claim: () => Promise.reject(new Error("db")),
    send: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
  });
  assert((await handler()).status === 500);
});
