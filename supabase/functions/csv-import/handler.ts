import { readJson } from "../_shared/readJson.ts";

export type Progress = { completed: number; total: number };
export type ImportRequest = { request_id: string; import_plan: Record<string, unknown> };
export type Identity = { userId: string; sessionId?: string };
type Services = {
  authenticate: (token: string) => Promise<Identity>;
  save: (
    identity: Identity,
    input: ImportRequest,
    progress: (value: Progress) => void,
    signal: AbortSignal,
  ) => Promise<unknown>;
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (error: string, status: number) => Response.json({ error }, { status, headers: CORS });

export function createCsvImportHandler(services: Services) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json("method_not_allowed", 405);
    let identity: Identity;
    try {
      const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return json("not_authenticated", 401);
      identity = await services.authenticate(token);
    } catch {
      return json("not_authenticated", 401);
    }
    let input: ImportRequest;
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return json("invalid_request", 400);
      }
      // 5MB CSV의 JSON 저장 계획은 원본보다 크다. 길이 헤더 없이도 상한을 적용한다.
      const body = await readJson(request, 32 * 1024 * 1024);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json("invalid_request", 400);
      }
      const value = body as Record<string, unknown>;
      if (
        typeof value.request_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.request_id) ||
        !value.import_plan || typeof value.import_plan !== "object" ||
        Array.isArray(value.import_plan)
      ) {
        return json("invalid_request", 400);
      }
      input = {
        request_id: value.request_id,
        import_plan: value.import_plan as Record<string, unknown>,
      };
      if (input.import_plan.userId !== identity.userId) return json("account_changed", 403);
    } catch (error) {
      return json(
        error instanceof Error && error.message === "request_too_large"
          ? "request_too_large"
          : "invalid_request",
        400,
      );
    }
    const abort = new AbortController();
    const cancelRequest = () => abort.abort();
    request.signal.addEventListener("abort", cancelRequest, { once: true });
    if (request.signal.aborted) abort.abort();
    let isClosed = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: unknown) => {
          if (!isClosed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        void (async () => {
          try {
            const result = await services.save(
              identity,
              input,
              (progress) => send({ type: "progress", ...progress }),
              abort.signal,
            );
            // save는 COMMIT이 끝난 후에만 반환한다. 중간 NOTICE는 성공 결과가 아니다.
            send({ type: "result", data: result });
          } catch (error) {
            const code = error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "";
            send({ type: "error", code, message: "CSV 저장에 실패했습니다. 다시 시도해 주세요." });
          } finally {
            request.signal.removeEventListener("abort", cancelRequest);
            if (!isClosed) {
              isClosed = true;
              controller.close();
            }
          }
        })();
      },
      cancel() {
        isClosed = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        ...CORS,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
