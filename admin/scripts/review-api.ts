// eslint-disable-next-line import/no-unresolved -- Deno의 npm: import는 deno check로 검증한다.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { createAdminHandler } from "../../supabase/functions/admin-moderation/handler.ts";
import { createAdminServices } from "../../supabase/functions/admin-moderation/services.ts";

const url = Deno.env.get("SUPABASE_URL")!;
if (url !== "http://127.0.0.1:55421") {
  throw new Error("local_review_database_required");
}
const client = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  { hostname: "127.0.0.1", port: 55425 },
  createAdminHandler(createAdminServices(client)),
);
