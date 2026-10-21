/* global __dirname, process */
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

// 전용 임시 DB만 사용한다. 보존 중인 CSV DB·공유 DB에서는 실행할 수 없다.
const workdir = process.env.MODERATION_TEST_WORKDIR;
if (!workdir || !process.env.DENO_BIN)
  throw new Error("MODERATION_TEST_WORKDIR and DENO_BIN required");
const status = JSON.parse(
  execFileSync("supabase", ["status", "--workdir", workdir, "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
assert.equal(status.API_URL, "http://127.0.0.1:55481");
assert.match(status.DB_URL, /@127\.0\.0\.1:55482\/postgres$/);
const sql = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_diggin-114",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      query,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tokenClient = () =>
  createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
async function fixture(label) {
  const email = `${label}-${randomUUID()}@test.invalid`,
    password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  const client = tokenClient();
  const login = await client.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null);
  return {
    id: created.data.user.id,
    email,
    password,
    client,
    token: login.data.session.access_token,
    refresh: login.data.session.refresh_token,
  };
}

async function main() {
  const operator = await fixture("operator"),
    target = await fixture("target");
  sql(
    `insert into private.admin_users(id,email,role) values('${operator.id}','${operator.email}','operator')`,
  );
  const server = spawn(
    process.env.DENO_BIN,
    ["run", "--allow-env", "--allow-net", "supabase/functions/admin-moderation/index.ts"],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        SUPABASE_URL: status.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error("test_server_failed");
      try {
        const response = await fetch("http://127.0.0.1:8000", { method: "OPTIONS" });
        if (response.status === 204) {
          ready = true;
          break;
        }
      } catch {
        /* 시작 대기 */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "test_server_not_ready");
    async function call(body, token = operator.token) {
      const response = await fetch("http://127.0.0.1:8000", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    }
    assert.equal((await call({ action: "list_reports" }, target.token)).status, 403);
    const request = (sanction, id = randomUUID()) => ({
      action: "sanction",
      request_id: id,
      user_id: target.id,
      sanction,
      reason_category: "abuse",
      reason: "로컬 제재 통합 검증",
    });
    const concurrent = request("warning");
    const results = await Promise.all(Array.from({ length: 4 }, () => call(concurrent)));
    assert.ok(
      results.every((response) => response.status === 200 && response.data.state === "applied"),
    );
    assert.equal(new Set(results.map((response) => response.data.action_id)).size, 1);
    assert.equal(
      sql(`select count(*) from private.admin_actions where request_id='${concurrent.request_id}'`),
      "1",
    );
    const restricted = await call(request("community_restricted"));
    assert.equal(restricted.status, 200);
    const readOnly = await target.client.rpc("get_account_access");
    assert.equal(readOnly.data.status, "community_restricted");
    assert.ok(
      Math.abs(Date.parse(readOnly.data.restricted_until) - Date.now() - 168 * 3600000) < 10000,
    );
    const deletion = await target.client.rpc("delete_community_post", { target_post_id: 1 });
    assert.equal(deletion.error.message, "community_restricted");
    assert.equal(
      JSON.parse(deletion.error.details).restricted_until,
      readOnly.data.restricted_until,
    );
    const folder = await target.client.from("folders").insert({ name: "제재테스트" }).select("id");
    assert.equal(folder.error, null);
    assert.equal((await call(request("suspended"))).status, 200);
    const stale = tokenClient();
    const notice = await stale
      .rpc("get_account_access")
      .setHeader("Authorization", `Bearer ${target.token}`);
    assert.equal(notice.data.status, "suspended");
    assert.equal(notice.data.reason_category, "abuse");
    const folders = await stale
      .from("folders")
      .select("id")
      .setHeader("Authorization", `Bearer ${target.token}`);
    assert.deepEqual(folders.data, []);
    const nickname = await stale
      .rpc("update_nickname", { new_nickname: "제재검증114" })
      .setHeader("Authorization", `Bearer ${target.token}`);
    assert.equal(nickname.error.message, "suspended");
    assert.equal(sql(`select count(*) from auth.sessions where user_id='${target.id}'`), "0");
    const blocked = await tokenClient().auth.signInWithPassword({
      email: target.email,
      password: target.password,
    });
    assert.equal(blocked.error.code, "user_banned");
    assert.ok((await tokenClient().auth.refreshSession({ refresh_token: target.refresh })).error);
    assert.equal((await call(request("release"))).status, 200);
    const oldSession = await stale
      .rpc("update_nickname", { new_nickname: "해제검증114" })
      .setHeader("Authorization", `Bearer ${target.token}`);
    assert.equal(oldSession.error.message, "not_authorized");
    assert.equal(
      (
        await tokenClient().auth.signInWithPassword({
          email: target.email,
          password: target.password,
        })
      ).error,
      null,
    );
    // 실제 Auth API 안의 DB 오류가 ban·프로필·감사 이력을 함께 되돌리는지 확인한다.
    sql(
      `create function private.fixture_114_fail() returns trigger language plpgsql as $$ begin if new.id='${target.id}' and new.status='suspended' then raise exception 'fixture_failure'; end if; return new; end; $$; create trigger fixture_114_fail before update on public.profiles for each row execute function private.fixture_114_fail();`,
    );
    const failed = request("suspended");
    assert.equal((await call(failed)).status, 503);
    assert.equal(sql(`select status from public.profiles where id='${target.id}'`), "active");
    assert.equal(sql(`select banned_until is null from auth.users where id='${target.id}'`), "t");
    assert.equal(
      sql(`select count(*) from private.admin_actions where request_id='${failed.request_id}'`),
      "0",
    );
    console.log(
      "PASS: real Auth API, atomic rollback, four concurrent requests, stale JWT, session revocation, release",
    );
  } finally {
    sql(
      "drop trigger if exists fixture_114_fail on public.profiles; drop function if exists private.fixture_114_fail();",
    );
    server.kill();
    // INSERT-only 감사 기록은 지우지 않는다. 실행 후 이 전용 DB를 CLI reset/stop으로 제거한다.
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
