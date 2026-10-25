import { createPushHandler, type PushJob, pushMessage, type Result } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
const job: PushJob = {
  id: "9007199254740993",
  lease_id: "lease",
  ticket_id: null,
  allowed: true,
  expired: false,
  token: "ExponentPushToken[abc]",
  recipient_id: "user-a",
  post_id: "9007199254740994",
  post_type: "post",
  title: "알림",
  body: "본문",
};
function setup(pending: PushJob[] = [job], receipts: PushJob[] = [], fail = false) {
  const finished: { id: string; result: Result }[] = [];
  const requests: { url: string; body: unknown }[] = [];
  const handler = createPushHandler({
    secret: "secret",
    claim: (isReceipt) => Promise.resolve(isReceipt ? receipts : pending),
    finish: (j, result) => {
      finished.push({ id: j.id, result });
      return Promise.resolve();
    },
    fetch: (input, init) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      if (fail) return Promise.resolve(new Response("", { status: 503 }));
      const data = String(input).endsWith("send")
        ? pending.filter((j) => j.allowed && !j.expired).map((_, i) =>
          i === 0
            ? { status: "ok", id: "ticket-1" }
            : { status: "error", details: { error: "DeviceNotRegistered" } }
        )
        : {
          "ticket-1": { status: "ok" },
          "ticket-2": { status: "error", details: { error: "DeviceNotRegistered" } },
        };
      return Promise.resolve(Response.json({ data }));
    },
  });
  const run = (token = "secret") =>
    handler(
      new Request("http://localhost/notification-push", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  return { run, requests, finished };
}

Deno.test("전용 secret 없는 앱 요청은 큐나 Expo에 접근하지 못한다", async () => {
  const h = setup();
  assert((await h.run("user-jwt")).status === 401);
  assert(h.requests.length === 0 && h.finished.length === 0);
});
Deno.test("기기별 ticket 성공과 폐기 토큰을 나눠 기록하고 큰 ID를 문자열로 보낸다", async () => {
  const h = setup([job, { ...job, id: "2" }]);
  assert((await h.run()).status === 200);
  assert(h.finished[0].result.outcome === "accepted");
  assert(h.finished[1].result.outcome === "unregistered");
  const body = h.requests[0].body as { data: { post_id: string }; channelId: string }[];
  assert(body[0].data.post_id === job.post_id && body[0].channelId === "default");
});
Deno.test("설정 끔·차단·계정 전환으로 취소된 작업은 외부 발송하지 않는다", async () => {
  const h = setup([{ ...job, allowed: false }, { ...job, expired: true, id: "2" }]);
  await h.run();
  assert(h.requests.length === 0 && h.finished.every((x) => x.result.outcome === "skipped"));
});
Deno.test("503은 발송 재시도, receipt 조회 실패는 조회만 재시도한다", async () => {
  const h = setup([job], [{ ...job, id: "2", ticket_id: "ticket-1" }], true);
  await h.run();
  assert(h.finished[0].result.outcome === "retry");
  assert(h.finished[1].result.outcome === "receipt_retry");
});
Deno.test("receipt 성공·폐기 토큰·누락·기한 만료를 구분한다", async () => {
  const h = setup([], [
    { ...job, ticket_id: "ticket-1" },
    { ...job, id: "2", ticket_id: "ticket-2" },
    { ...job, id: "3", ticket_id: "missing" },
    { ...job, id: "4", expired: true },
  ]);
  await h.run();
  assert(h.finished.find((x) => x.id === job.id)?.result.outcome === "delivered");
  assert(h.finished.find((x) => x.id === "2")?.result.outcome === "unregistered");
  assert(h.finished.find((x) => x.id === "3")?.result.outcome === "receipt_retry");
  assert(h.finished.find((x) => x.id === "4")?.result.outcome === "failed");
});
Deno.test("한국어·이모지 본문도 data를 포함해 4KB 안에 보낸다", () => {
  const message = pushMessage({ ...job, body: "가족👨‍👩‍👧‍👦".repeat(1000) });
  assert(new TextEncoder().encode(JSON.stringify(message)).length <= 3900);
  assert(message.data.post_id === job.post_id && message.body.endsWith("…"));
});
