import { type Claim, createAmplitudeDeletionHandler } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
function request(token: string | null = "secret") {
  return new Request("http://localhost/amplitude-deletion", {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
}
function setup(
  { claim = { claim_id: "claim-1", user_ids: ["u1", "u2"] }, status = 200, secret = "secret" }: {
    claim?: Claim;
    status?: number | "network";
    secret?: string | undefined;
  } = {},
) {
  const finished: [string, boolean, string | undefined][] = [];
  const sent: { url: string; init: RequestInit }[] = [];
  const handler = createAmplitudeDeletionHandler({
    secret,
    amplitudeKey: "key",
    amplitudeSecret: "shh",
    claim: () => Promise.resolve(claim),
    finish: (claimId, succeeded, errorCode) => {
      finished.push([claimId, succeeded, errorCode]);
      return Promise.resolve();
    },
    fetch: ((url: string, init: RequestInit) => {
      sent.push({ url, init });
      return status === "network"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(new Response("{}", { status }));
    }) as typeof fetch,
  });
  return { handler, finished, sent };
}

Deno.test("비밀값이 없거나 다르면 Amplitude를 부르지 않는다", async () => {
  const unset = setup({ secret: "" });
  assert((await unset.handler(request())).status === 503);
  const wrong = setup();
  assert((await wrong.handler(request("other"))).status === 401);
  assert(unset.sent.length === 0 && wrong.sent.length === 0);
});

Deno.test("가져온 회원을 한 요청으로 보내고 성공을 기록한다", async () => {
  const { handler, finished, sent } = setup();
  const response = await handler(request());
  assert(response.status === 200);
  assert(sent.length === 1 && sent[0].url === "https://amplitude.com/api/2/deletions/users");
  const headers = sent[0].init.headers as Record<string, string>;
  assert(headers.Authorization === "Basic " + btoa("key:shh"));
  const body = JSON.parse(String(sent[0].init.body));
  assert(body.user_ids.join() === "u1,u2" && body.ignore_invalid_id === true);
  assert(JSON.stringify(finished) === JSON.stringify([["claim-1", true, undefined]]));
});

Deno.test("Amplitude 오류·연결 실패는 실패로 기록해 다시 시도하게 한다", async () => {
  const rejected = setup({ status: 429 });
  assert((await rejected.handler(request())).status === 502);
  assert(JSON.stringify(rejected.finished) === JSON.stringify([["claim-1", false, "http_429"]]));
  const offline = setup({ status: "network" });
  await offline.handler(request());
  assert(offline.finished[0][2] === "network_error");
});

Deno.test("처리할 회원이 없으면 요청하지 않는다", async () => {
  const { handler, sent, finished } = setup({ claim: { claim_id: "c", user_ids: [] } });
  assert((await handler(request())).status === 200);
  assert(sent.length === 0 && finished.length === 0);
});
