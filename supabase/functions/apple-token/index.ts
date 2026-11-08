import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { appleSubject } from "../_shared/account.ts";
import { exchangeAppleCode } from "../_shared/apple.ts";
import { createAppleTokenHandler } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createAppleTokenHandler({
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error("not_authenticated");
    return data.user.id;
  },
  appleSubject: (userId) => appleSubject(client, userId),
  exchangeAppleCode,
  async storeRefreshToken(userId, refreshToken) {
    const { error } = await client.rpc("store_apple_refresh_token", {
      target_user: userId,
      refresh_token: refreshToken,
    });
    if (error) throw new Error("store_failed");
  },
}));
