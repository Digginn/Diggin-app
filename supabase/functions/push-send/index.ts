import { withSupabase } from "npm:@supabase/server@1.9.0";

import { createPushSendHandler, type PushNotification, type PushTicket } from "./handler.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CLAIM_BATCH = 100;

// pg_cron(pg_net)이 Vault의 secret key를 apikey 헤더로 보낸다. 사용자 JWT가 없어 verify_jwt는 끈다(config.toml).
Deno.serve(withSupabase({ auth: "secret" }, (_request, ctx) =>
  createPushSendHandler({
    async claim() {
      const { data, error } = await ctx.supabaseAdmin.rpc("claim_push_notifications", {
        batch_size: CLAIM_BATCH,
      });
      if (error) throw new Error("claim_failed");
      return data as PushNotification[];
    },
    async send(messages) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("expo_request_failed");
      const { data } = await response.json() as { data?: PushTicket[] };
      if (!Array.isArray(data)) throw new Error("expo_request_failed");
      return data;
    },
    async complete(sentIds, deadTokens) {
      const { error } = await ctx.supabaseAdmin.rpc("complete_push_notifications", {
        sent_ids: sentIds.map(Number),
        dead_tokens: deadTokens,
      });
      if (error) throw new Error("complete_failed");
    },
  })()));
