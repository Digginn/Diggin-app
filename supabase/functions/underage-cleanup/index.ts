import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { deleteUser, removeAvatars } from "../_shared/account.ts";
import { revokeAppleToken } from "../_shared/apple.ts";
import { createUnderageCleanupHandler, type DueAccount } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createUnderageCleanupHandler({
  secret: Deno.env.get("UNDERAGE_CLEANUP_SECRET"),
  async dueAccounts() {
    const { data, error } = await client.rpc("due_underage_deletions");
    if (error || !Array.isArray(data)) throw new Error("lookup_failed");
    return data as DueAccount[];
  },
  async claim(userId) {
    const { data, error } = await client.rpc("claim_underage_deletion", { target: userId });
    if (error || typeof data !== "boolean") throw new Error("claim_failed");
    return data;
  },
  revokeAppleToken,
  removeAvatars: (userId) => removeAvatars(client, userId),
  deleteUser: (userId) => deleteUser(client, userId),
}));
