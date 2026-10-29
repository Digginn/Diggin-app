import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { appleSubject, deleteUser, removeAvatars } from "../_shared/account.ts";
import { exchangeAppleCode, revokeAppleToken } from "../_shared/apple.ts";
import { createWithdrawalHandler } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createWithdrawalHandler({
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error("not_authenticated");
    return data.user.id;
  },
  appleSubject: (userId) => appleSubject(client, userId),
  exchangeAppleCode,
  revokeAppleToken,
  removeAvatars: (userId) => removeAvatars(client, userId),
  deleteUser: (userId) => deleteUser(client, userId),
  async recordSurvey({ reasons, customText }) {
    const { error } = await client.rpc("record_withdrawal_survey", {
      reasons,
      custom_text: customText,
    });
    if (error) throw new Error("record_survey_failed");
  },
}));
