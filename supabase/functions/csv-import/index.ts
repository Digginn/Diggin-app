import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { decodeJwt } from "npm:jose@6.1.0";

import { saveCsvImport } from "./database.ts";
import { createCsvImportHandler } from "./handler.ts";

const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createCsvImportHandler({
  async authenticate(token) {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) throw new Error("not_authenticated");
    // getUser로 검증한 동일 JWT에서 세션 ID도 전달해야 로그아웃된 세션을 DB가 거부한다.
    const claims = decodeJwt(token);
    return {
      userId: data.user.id,
      sessionId: typeof claims.session_id === "string" ? claims.session_id : undefined,
    };
  },
  save: (identity, input, progress, signal) =>
    saveCsvImport(Deno.env.get("SUPABASE_DB_URL")!, identity, input, progress, signal),
}));
