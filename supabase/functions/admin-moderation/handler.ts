import { readJson } from "../_shared/readJson.ts";

type Actor = { userId: string; sessionId: string };
type Services = {
  authenticate: (token: string) => Promise<Actor>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  updateAuth: (userId: string, attributes: Record<string, unknown>) => Promise<void>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_request");
  }
  return value as Record<string, unknown>;
}
function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
  ) {
    throw new Error("invalid_request");
  }
  return value;
}
function id(value: unknown, optional = false) {
  if (optional && value == null) return null;
  if (
    typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  ) {
    throw new Error("invalid_request");
  }
  return value;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("invalid_request");
  }
  return value.trim();
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "request_failed";
}

export function createAdminHandler(services: Services) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let actor: Actor;
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return json({ error: "not_authenticated" }, 401);
      actor = await services.authenticate(token);
    } catch {
      return json({ error: "not_authenticated" }, 401);
    }
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return json({ error: "invalid_request" }, 400);
      }
      if (Number(request.headers.get("content-length")) > 16384) {
        return json({ error: "request_too_large" }, 413);
      }
      let body: Record<string, unknown>;
      try {
        body = object(await readJson(request));
      } catch (error) {
        if (error instanceof Error && error.message === "request_too_large") {
          return json({ error: "request_too_large" }, 413);
        }
        return json({ error: "invalid_request" }, 400);
      }
      // 운영자·세션은 본문을 신뢰하지 않고 검증한 JWT에서만 가져온다.
      const identity = { actor: actor.userId, actor_session: actor.sessionId };
      if ("actor" in body || "admin_id" in body || "actor_session" in body) {
        return json({ error: "invalid_request" }, 400);
      }
      const rpc = (name: string, args: Record<string, unknown>) =>
        services.rpc(name, { ...args, ...identity });
      if (body.action === "list_reports") {
        return json(await rpc("admin_report_groups", { before_id: id(body.before_id, true) }));
      }
      if (body.action === "report_detail") {
        return json(
          await rpc("admin_report_detail", {
            report: id(body.report_id),
            before_report_id: id(body.before_report_id, true),
          }),
        );
      }
      const requestId = uuid(body.request_id);
      if (body.action === "sanction_request") {
        return json(await rpc("admin_sanction_request", { request_id: requestId }));
      }
      const reason = {
        category: text(body.reason_category, 30),
        explanation: text(body.reason, 4000),
      };
      if (body.action === "report_status" || body.action === "hide" || body.action === "restore") {
        const actionId = await rpc("admin_content_action", {
          ...reason,
          request_id: requestId,
          report: id(body.report_id),
          operation: body.action,
          new_status: body.action === "report_status" ? text(body.status, 20) : null,
        });
        return json({ action_id: actionId });
      }
      if (body.action !== "sanction") return json({ error: "invalid_request" }, 400);
      const pending = object(
        await rpc("admin_prepare_sanction", {
          ...reason,
          request_id: requestId,
          target_user: uuid(body.user_id),
          operation: text(body.sanction, 30),
          report: id(body.report_id, true),
        }),
      );
      if (pending.state === "applied") return json(pending);
      // 같은 Auth 트랜잭션의 지연 트리거가 DB 상태와 감사 기록까지 확정한다.
      try {
        await services.updateAuth(String(pending.user_id), {
          app_metadata: { moderation_request_id: requestId },
          ...(pending.action === "suspended"
            ? { ban_duration: "876000h" }
            : pending.action === "release"
            ? { ban_duration: "none" }
            : {}),
        });
      } catch {
        // 응답이 유실돼도 적용됐다면 성공으로 복구하고, 미적용 요청만 종료한다.
        const outcome = object(
          await rpc("admin_sanction_request", { request_id: requestId, mark_failed: true }),
        );
        return outcome.state === "applied"
          ? json(outcome)
          : json({ error: "auth_moderation_failed", request_id: requestId }, 503);
      }
      const outcome = object(await rpc("admin_sanction_request", { request_id: requestId }));
      return outcome.state === "applied"
        ? json(outcome)
        : json({ error: "moderation_not_committed", request_id: requestId }, 503);
    } catch (error) {
      const message = errorMessage(error);
      const status = message === "admin_required"
        ? 403
        : /not_found$/.test(message)
        ? 404
        : /conflict|pending$/.test(message)
        ? 409
        : /^invalid_|request_failed_use_new_id|cannot_sanction_admin|deleted_content/.test(message)
        ? 400
        : 500;
      // SQL 상세·이메일·JWT·키는 응답이나 로그에 포함하지 않는다.
      return json({ error: status === 500 ? "request_failed" : message }, status);
    }
  };
}
