import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { createAdminHandler } from "./handler.ts";
import { createAdminServices } from "./services.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

Deno.serve(createAdminHandler(createAdminServices(client)));
