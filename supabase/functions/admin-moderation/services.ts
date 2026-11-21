import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

export function createAdminServices(client: SupabaseClient) {
  return {
    async authenticate(token: string) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) throw new Error("not_authenticated");
      // getUser가 서명·만료를 검증한 뒤 session_id만 읽는다.
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims: unknown = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
      if (
        !claims || typeof claims !== "object" || !("role" in claims) || !("sub" in claims) ||
        !("session_id" in claims) || claims.role !== "authenticated" ||
        claims.sub !== data.user.id || typeof claims.session_id !== "string"
      ) throw new Error("not_authenticated");
      return { userId: data.user.id, sessionId: claims.session_id };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    },
    async updateAuth(userId: string, attributes: Record<string, unknown>) {
      const { error } = await client.auth.admin.updateUserById(userId, attributes);
      if (error) throw new Error("auth_moderation_failed");
    },
  };
}
