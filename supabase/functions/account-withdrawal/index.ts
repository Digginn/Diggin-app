import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { createWithdrawalHandler } from "./handler.ts";

const AVATAR_BUCKET = "avatars";
const AVATAR_PAGE = 100;

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
  async removeAvatars(userId) {
    const bucket = client.storage.from(AVATAR_BUCKET);
    while (true) {
      const { data, error } = await bucket.list(userId, { limit: AVATAR_PAGE });
      if (error) throw new Error("avatar_list_failed");
      if (!data.length) return;
      const { error: removeError } = await bucket.remove(
        data.map((file) => `${userId}/${file.name}`),
      );
      if (removeError) throw new Error("avatar_remove_failed");
      if (data.length < AVATAR_PAGE) return;
    }
  },
  // auth.users를 지우면 세션·리프레시 토큰과 FK로 묶인 데이터가 함께 지워진다(DB_SCHEMA 8).
  async deleteUser(userId) {
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) throw new Error("delete_user_failed");
  },
  async recordSurvey({ reasons, customText }) {
    const { error } = await client.rpc("record_withdrawal_survey", {
      reasons,
      custom_text: customText,
    });
    if (error) throw new Error("record_survey_failed");
  },
}));
