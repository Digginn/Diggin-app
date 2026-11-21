import postgres from "npm:postgres@3.4.7";
import { createClient, type Session } from "npm:@supabase/supabase-js@2.117.3";

import { createAdminHandler } from "./handler.ts";
import { createAdminServices } from "./services.ts";

const databaseUrl = Deno.env.get("ADMIN_MODERATION_TEST_DB_URL");
function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}

Deno.test({
  name: "로컬 Auth 로그인 → 실제 JWT·서비스 RPC·Auth 제재·세션 폐기까지 검증",
  ignore: !databaseUrl,
  async fn() {
    const apiUrl = Deno.env.get("ADMIN_MODERATION_TEST_API_URL")!;
    assert(
      ["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname),
      "local_database_required",
    );
    assert(["localhost", "127.0.0.1"].includes(new URL(apiUrl).hostname), "local_api_required");
    const sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const service = createClient(apiUrl, Deno.env.get("ADMIN_MODERATION_TEST_SERVICE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonKey = Deno.env.get("ADMIN_MODERATION_TEST_PUBLIC_KEY")!;
    const handler = createAdminHandler(createAdminServices(service));
    const ids: string[] = [];
    try {
      const clients: Session[] = [];
      for (let index = 0; index < 2; index++) {
        const email = `${crypto.randomUUID()}@admin224.test`;
        const password = crypto.randomUUID();
        const created = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        assert(created.data.user && !created.error, "create_local_user");
        ids.push(created.data.user.id);
        const client = createClient(apiUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const signedIn = await client.auth.signInWithPassword({ email, password });
        assert(signedIn.data.session && !signedIn.error, "real_password_login");
        clients.push(signedIn.data.session);
      }
      await sql`insert into private.admin_users(id,email,role) values (${ids[0]},${clients[0].user
        .email!},'operator')`;
      const request = (body: unknown, token = clients[0].access_token) =>
        new Request(`${apiUrl}/functions/v1/admin-moderation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      const identity = await handler(request({ action: "console", resource: "session" }));
      assert(
        identity.status === 200 && (await identity.json()).id === ids[0],
        "verified_admin_session",
      );
      assert(
        (await handler(
          request({ action: "console", resource: "members" }, clients[1].access_token),
        )).status === 403,
        "ordinary_user_denied",
      );
      assert(
        (await handler(request({ action: "console", resource: "members" }, "forged.jwt.token")))
          .status === 401,
        "forged_token_denied",
      );
      const [post] = await sql`insert into private.posts(author_id,type,content) values (${
        ids[1]
      },'post','관리자 실제 연결 테스트') returning id::text`;
      const [report] =
        await sql`insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason) values (${
          ids[0]
        },'post',${post.id},${ids[1]},'abuse') returning id::text`;
      const listing = await handler(
        request({ action: "console", resource: "reports", query: "실제 연결" }),
      );
      assert(
        listing.status === 200 && (await listing.json()).rows[0].id === report.id,
        "real_report_query",
      );
      for (const status of ["reviewing", "resolved"]) {
        const result = await handler(
          request({
            action: "report_group_status",
            report_id: report.id,
            request_id: crypto.randomUUID(),
            status,
            reason_category: "abuse",
            reason: "원문 확인",
          }),
        );
        assert(result.status === 200, `group_status_${status}`);
      }
      const sanction = {
        action: "sanction",
        user_id: ids[1],
        report_id: report.id,
        request_id: crypto.randomUUID(),
        sanction: "suspended",
        reason_category: "abuse",
        reason: "실제 Auth 정지 검증",
      };
      const applied = await handler(request(sanction));
      assert(
        applied.status === 200 && (await applied.json()).state === "applied",
        "auth_ban_committed",
      );
      const repeated = await handler(request(sanction));
      assert(
        repeated.status === 200 && (await repeated.json()).state === "applied",
        "idempotent_ban",
      );
      const [state] =
        await sql`select p.status,(select count(*) from auth.sessions s where s.user_id=p.id)::integer as sessions,(select count(*) from private.user_sanctions s where s.user_id=p.id)::integer as sanctions from public.profiles p where p.id=${
          ids[1]
        }`;
      assert(
        state.status === "suspended" && state.sessions === 0 && state.sanctions === 1,
        "ban_revokes_sessions_once",
      );
      const sanctions = await handler(
        request({ action: "console", resource: "sanctions", query: ids[1] }),
      );
      assert(
        sanctions.status === 200 && (await sanctions.json()).rows.length === 1,
        "real_sanction_list",
      );
      await sql`update private.admin_users set disabled_at=now() where id=${ids[0]}`;
      assert(
        (await handler(request({ action: "console", resource: "members" }))).status === 403,
        "revoked_admin_denied",
      );
    } finally {
      if (ids.length) {
        await sql.begin(async (tx) => {
          await tx`select set_config('private.retention_cleanup','on',true)`;
          await tx`delete from private.moderation_requests where user_id in ${
            sql(ids)
          } or admin_id=${ids[0]}`;
          await tx`delete from private.user_sanctions where user_id in ${sql(ids)}`;
          await tx`delete from private.admin_actions where admin_id=${ids[0]}`;
          await tx`delete from private.admin_access_logs where admin_id=${ids[0]}`;
          await tx`delete from private.admin_console_access_logs where admin_id=${ids[0]}`;
          await tx`delete from private.admin_users where id=${ids[0]}`;
          await tx`delete from auth.users where id in ${sql(ids)}`;
        });
      }
      await sql.end();
    }
  },
});
