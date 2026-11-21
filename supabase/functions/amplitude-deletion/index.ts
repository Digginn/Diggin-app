import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { type Claim, createAmplitudeDeletionHandler } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createAmplitudeDeletionHandler({
  secret: Deno.env.get("AMPLITUDE_DELETION_SECRET"),
  amplitudeKey: Deno.env.get("AMPLITUDE_API_KEY"),
  amplitudeSecret: Deno.env.get("AMPLITUDE_SECRET_KEY"),
  async claim() {
    const { data, error } = await client.rpc("claim_amplitude_deletions");
    if (
      error || typeof data?.claim_id !== "string" || !Array.isArray(data.user_ids)
    ) throw new Error("claim_failed");
    return data as Claim;
  },
  async finish(claimId, succeeded, errorCode) {
    const { error } = await client.rpc("finish_amplitude_deletions", {
      claim_id: claimId,
      succeeded,
      error_code: errorCode ?? null,
    });
    if (error) throw new Error("finish_failed");
  },
  fetch,
}));
