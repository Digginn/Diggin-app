export type PushJob = {
  id: string;
  lease_id: string;
  ticket_id: string | null;
  allowed: boolean;
  expired: boolean;
  token: string;
  recipient_id: string;
  post_id: string;
  post_type: string;
  title: string;
  body: string;
};
type Outcome =
  | "accepted"
  | "delivered"
  | "retry"
  | "receipt_retry"
  | "failed"
  | "unregistered"
  | "skipped";
export type Result = { outcome: Outcome; ticket?: string; error?: string };
type Dependencies = {
  secret: string | undefined;
  accessToken?: string;
  claim(receipts: boolean): Promise<PushJob[]>;
  finish(job: PushJob, result: Result): Promise<void>;
  fetch: typeof fetch;
};
type ExpoResult = { status?: string; id?: string; details?: { error?: string } };

function resultFor(result: ExpoResult | undefined, receipt: boolean): Result {
  if (result?.status === "ok") {
    if (receipt) return { outcome: "delivered" };
    if (typeof result.id === "string" && result.id.length > 0 && result.id.length <= 128) {
      return { outcome: "accepted", ticket: result.id };
    }
  }
  const error = result?.details?.error;
  if (error === "DeviceNotRegistered") return { outcome: "unregistered", error };
  if (error === "MessageTooBig") return { outcome: "failed", error };
  // receipt 오류는 아직 provider가 받지 못한 경우라 다시 보낸다. receipt 누락은 조회만 재시도한다.
  return {
    outcome: receipt && !error ? "receipt_retry" : "retry",
    error: error ?? "invalid_expo_result",
  };
}

export function pushMessage(job: PushJob) {
  const message = {
    to: job.token,
    title: job.title,
    body: job.body,
    sound: "default",
    channelId: "default",
    ttl: 3600,
    data: { recipient_id: job.recipient_id, post_id: job.post_id, post_type: job.post_type },
  };
  // 목록 원문은 보존하고, 푸시는 data를 포함한 전체 4KB 제한 안에서 본문만 줄인다.
  const characters = Array.from(message.body);
  while (new TextEncoder().encode(JSON.stringify(message)).length > 3900 && characters.length) {
    characters.splice(-100);
    message.body = characters.join("") + "…";
  }
  return message;
}

export function createPushHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (!deps.secret) return Response.json({ error: "not_configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${deps.secret}`) {
      return Response.json({ error: "not_authorized" }, { status: 401 });
    }
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const counts = { accepted: 0, delivered: 0, deferred: 0, stopped: 0 };
    const finish = async (job: PushJob, result: Result) => {
      await deps.finish(job, result);
      if (result.outcome === "accepted") counts.accepted++;
      else if (result.outcome === "delivered") counts.delivered++;
      else if (result.outcome === "retry" || result.outcome === "receipt_retry") counts.deferred++;
      else counts.stopped++;
    };
    const callExpo = async (path: string, body: unknown) => {
      const response = await deps.fetch(`https://exp.host/--/api/v2/push/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(deps.accessToken ? { Authorization: `Bearer ${deps.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`expo_http_${response.status}`);
      return await response.json();
    };
    try {
      const pending = await deps.claim(false);
      const send: PushJob[] = [];
      for (const job of pending) {
        if (!job.allowed || job.expired) await finish(job, { outcome: "skipped" });
        else send.push(job);
      }
      if (send.length) {
        let tickets: ExpoResult[] | undefined;
        try {
          const response = await callExpo("send", send.map(pushMessage));
          if (Array.isArray(response?.data) && response.data.length === send.length) {
            tickets = response.data;
          }
        } catch { /* 다음 실행에서 재시도한다. 키·본문·토큰은 로그에 남기지 않는다. */ }
        for (let i = 0; i < send.length; i++) await finish(send[i], resultFor(tickets?.[i], false));
      }
      const receipts = await deps.claim(true);
      const check: PushJob[] = [];
      for (const job of receipts) {
        if (job.expired) await finish(job, { outcome: "failed", error: "receipt_expired" });
        else check.push(job);
      }
      if (check.length) {
        let results: Record<string, ExpoResult> | undefined;
        try {
          const response = await callExpo("getReceipts", {
            ids: check.map((job) => job.ticket_id),
          });
          if (
            response?.data && typeof response.data === "object" && !Array.isArray(response.data)
          ) {
            results = response.data;
          }
        } catch { /* receipt 조회 실패는 발송을 반복하지 않는다. */ }
        for (const job of check) await finish(job, resultFor(results?.[job.ticket_id!], true));
      }
      return Response.json(counts);
    } catch {
      // DB 오류는 실패로 보고하고, 완료 기록이 없는 작업은 lease 만료 후 다시 가져온다.
      return Response.json({ error: "dispatch_failed" }, { status: 500 });
    }
  };
}
