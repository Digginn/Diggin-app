import postgres from "npm:postgres@3.4.7";
import type { Identity, ImportRequest, Progress } from "./handler.ts";

export async function saveCsvImport(
  databaseUrl: string,
  identity: Identity,
  input: ImportRequest,
  progress: (value: Progress) => void,
  signal: AbortSignal,
): Promise<unknown> {
  // 요청 전용 연결로 NOTICE를 받는다. max: 1은 요청당 제한이며 전체 동시 요청 제한은 아니다.
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice(notice) {
      if (notice.message !== "csv_import_progress" || !notice.detail) return;
      const value = JSON.parse(notice.detail);
      progress({ completed: value.completed, total: value.total });
    },
  });
  const cancel = () => {
    void sql.end({ timeout: 0 });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    return await sql.begin(async (transaction) => {
      // 신뢰한 서버 연결도 본인 JWT의 authenticated 역할로만 RPC를 호출한다.
      await transaction`set local role authenticated`;
      await transaction`select set_config('request.jwt.claims', ${
        JSON.stringify({
          sub: identity.userId,
          role: "authenticated",
          session_id: identity.sessionId,
        })
      }, true), set_config('diggin.csv_progress', 'on', true)`;
      // 저장 SQL의 상한이며 60초를 기다리는 동작은 아니다. 완료·실패 시 finally에서 연결을 닫는다.
      await transaction`set local statement_timeout = '60s'`;
      await transaction`set local client_min_messages = notice`;
      const [row] = await transaction`select public.import_csv(${input.request_id}::uuid, ${
        JSON.stringify(input.import_plan)
      }::text::jsonb) as result`;
      return row.result;
    });
  } finally {
    signal.removeEventListener("abort", cancel);
    await sql.end({ timeout: 1 });
  }
}
