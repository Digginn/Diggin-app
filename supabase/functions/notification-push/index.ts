import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { createPushHandler, type PushJob } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(createPushHandler({
  secret: Deno.env.get("PUSH_DISPATCH_SECRET"),
  accessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
  fetch,
  async claim(receipts) {
    const { data, error } = await client.rpc("claim_notification_pushes", { receipts });
    if (error || !Array.isArray(data)) throw new Error("claim_failed");
    return data as PushJob[];
  },
  async finish(job, result) {
    const { error, data } = await client.rpc("finish_notification_push", {
      delivery_id: job.id,
      claim_id: job.lease_id,
      outcome: result.outcome,
      ticket: result.ticket ?? null,
      error_code: result.error ?? null,
    });
    if (error || data !== true) throw new Error("finish_failed");
  },
}));
