import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const apiUrl = Deno.env.get("ADMIN_MODERATION_TEST_API_URL");
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test({
  name: "로컬 Auth: 공개 이메일 가입 차단·강한 비밀번호·Admin API 발급·기존 로그인 유지",
  ignore: !apiUrl,
  async fn() {
    assert(["localhost", "127.0.0.1"].includes(new URL(apiUrl!).hostname), "local_auth_required");
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const service = createClient(
      apiUrl!,
      Deno.env.get("ADMIN_MODERATION_TEST_SERVICE_KEY")!,
      options,
    );
    const client = createClient(
      apiUrl!,
      Deno.env.get("ADMIN_MODERATION_TEST_PUBLIC_KEY")!,
      options,
    );
    const suffix = crypto.randomUUID();
    const password = `LocalSecurity!1-${suffix}`;
    const email = `${suffix}@admin-security.test`;
    let userId: string | undefined;
    try {
      const signup = await client.auth.signUp({
        email: `public-${email}`,
        password,
        options: { data: { provider: "google" } },
      });
      // 사용자가 수정할 수 있는 metadata로 가입 훅을 우회할 수 없다.
      assert(signup.error?.status === 403 && !signup.data.user, "public_email_signup_blocked");
      const weak = await service.auth.admin.createUser({
        email,
        password: "onlylowercase",
        email_confirm: true,
      });
      assert(weak.error && !weak.data.user, "weak_administrator_password_rejected");
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert(!created.error && created.data.user, "admin_api_provisioning_preserved");
      userId = created.data.user.id;
      const login = await client.auth.signInWithPassword({ email, password });
      assert(
        !login.error && login.data.session?.user.id === userId,
        "administrator_password_login_preserved",
      );
      await client.auth.signOut({ scope: "local" });
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId);
    }
  },
});
