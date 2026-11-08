import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { createAdminHandler } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

Deno.serve(createAdminHandler({
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error("not_authenticated");
    // getUser가 서명·만료를 검증한 뒤 session_id만 읽는다.
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    if (
      claims.role !== "authenticated" || claims.sub !== data.user.id ||
      typeof claims.session_id !== "string"
    ) {
      throw new Error("not_authenticated");
    }
    return { userId: data.user.id, sessionId: claims.session_id };
  },
  async rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  },
  async updateAuth(userId, attributes) {
    const { error } = await client.auth.admin.updateUserById(userId, attributes);
    if (error) throw new Error("auth_moderation_failed");
  },
}));
