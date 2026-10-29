export type DueAccount = { user_id: string; apple_refresh_token: string | null };

type Services = {
  secret: string | undefined;
  dueAccounts: () => Promise<DueAccount[]>;
  revokeAppleToken: (refreshToken: string) => Promise<void>;
  removeAvatars: (userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
};

/**
 * AUTH-002~004 만 14세 미만으로 이용 중단한 지 한 달이 지나도 정정되지 않은 계정을 MY-007 탈퇴와 같은 순서로 지운다.
 * pg_cron이 전용 비밀값으로만 부른다. 애플 연결 해제가 실패한 계정은 지우지 않고 다음 실행에 다시 시도한다.
 * 저장된 애플 토큰이 없는 예전 애플 가입자는 연결을 끊지 못한 채 계정만 지운다.
 */
export function createUnderageCleanupHandler(services: Services) {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }
    if (!services.secret) return Response.json({ error: "not_configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${services.secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let accounts: DueAccount[];
    try {
      accounts = await services.dueAccounts();
    } catch {
      return Response.json({ error: "lookup_failed" }, { status: 503 });
    }
    let deleted = 0, failed = 0;
    for (const account of accounts) {
      try {
        if (account.apple_refresh_token) {
          await services.revokeAppleToken(account.apple_refresh_token);
        }
        await services.removeAvatars(account.user_id);
        await services.deleteUser(account.user_id);
        deleted++;
      } catch {
        failed++;
      }
    }
    return Response.json({ deleted, failed });
  };
}
