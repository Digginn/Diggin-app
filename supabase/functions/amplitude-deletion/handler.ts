export type Claim = { claim_id: string; user_ids: string[] };

type Services = {
  secret: string | undefined;
  /** Amplitude 프로젝트 API 키와 시크릿 키. 둘 중 하나라도 없으면 요청을 보내지 않는다. */
  amplitudeKey: string | undefined;
  amplitudeSecret: string | undefined;
  claim: () => Promise<Claim>;
  finish: (claimId: string, succeeded: boolean, errorCode?: string) => Promise<void>;
  fetch: typeof fetch;
};

const DELETION_URL = "https://amplitude.com/api/2/deletions/users";

/**
 * 동의를 철회했거나 탈퇴한 회원의 Amplitude 데이터 삭제를 요청한다(#156). pg_cron이 전용 비밀값으로만 부른다.
 * 한 번에 100명까지 한 요청으로 보낸다. 실패하면 DB가 간격을 늘려 다시 시도한다.
 * v2 API는 아직 베타라 프로젝트 키로 쓰는 v1 API를 쓴다. Amplitude에 없는 회원 ID가 섞여도 나머지는 삭제하도록 한다.
 */
export function createAmplitudeDeletionHandler(services: Services) {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }
    if (!services.secret || !services.amplitudeKey || !services.amplitudeSecret) {
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    if (request.headers.get("authorization") !== `Bearer ${services.secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let claim: Claim;
    try {
      claim = await services.claim();
    } catch {
      return Response.json({ error: "claim_failed" }, { status: 503 });
    }
    if (claim.user_ids.length === 0) return Response.json({ requested: 0 });
    let errorCode: string | undefined;
    try {
      const response = await services.fetch(DELETION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + btoa(`${services.amplitudeKey}:${services.amplitudeSecret}`),
        },
        body: JSON.stringify({
          user_ids: claim.user_ids,
          ignore_invalid_id: true,
          requester: "diggin-amplitude-deletion",
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) errorCode = `http_${response.status}`;
    } catch {
      errorCode = "network_error";
    }
    try {
      await services.finish(claim.claim_id, !errorCode, errorCode);
    } catch {
      // 기록에 실패하면 lease가 끝난 뒤 같은 회원을 다시 요청한다. 삭제 요청이라 다시 보내도 지울 데이터만 같다.
      return Response.json({ error: "finish_failed" }, { status: 503 });
    }
    return errorCode
      ? Response.json({ error: errorCode, requested: claim.user_ids.length }, { status: 502 })
      : Response.json({ requested: claim.user_ids.length });
  };
}
