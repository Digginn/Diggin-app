import postgres from "npm:postgres@3.4.7";
import { saveCsvImport } from "./database.ts";
import { createCsvImportHandler, type ImportRequest, type Progress } from "./handler.ts";

const databaseUrl = Deno.env.get("CSV_IMPORT_TEST_DB_URL");
function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}

// 공유 DB에서는 실행할 수 없다. 로컬 임시 DB를 명시한 경우에만 실행한다.
Deno.test({
  name: "실제 DB NOTICE → HTTP 스트리밍·COMMIT·롤백·재시도·세션 권한을 검증한다",
  ignore: !databaseUrl,
  async fn() {
    const url = new URL(databaseUrl!);
    assert(["127.0.0.1", "localhost"].includes(url.hostname), "local_database_required");
    const sql = postgres(databaseUrl!, { max: 2, prepare: false, onnotice: () => {} });
    const userId = crypto.randomUUID(),
      otherId = crypto.randomUUID(),
      sessionId = crypto.randomUUID();
    const identity = { userId, sessionId };
    const input: ImportRequest = {
      request_id: crypto.randomUUID(),
      import_plan: {
        userId,
        totalCount: 120,
        folderMappings: [],
        products: Array.from({ length: 100 }, (_, i) => ({
          rowNumber: i + 2,
          name: `상품 ${i}`,
          url: `https://csv.test/${i}`,
          brand: null,
          price: "100",
          savedAt: "2026-10-12T00:00:00Z",
          isOwned: false,
          sourceFolderNames: [],
        })),
        failures: Array.from(
          { length: 10 },
          (_, i) => ({ rowNumber: 102 + i, productName: "", reason: "EMPTY_PRODUCT_NAME" }),
        ),
        duplicates: Array.from(
          { length: 10 },
          (_, i) => ({ rowNumber: 112 + i, productName: "중복", url: "https://csv.test/0" }),
        ),
      },
    };
    let server: Deno.HttpServer | undefined;
    try {
      await sql`insert into auth.users(id, email) values (${userId}, ${
        userId + "@csv.test"
      }), (${otherId}, ${otherId + "@csv.test"})`;
      await sql`insert into auth.sessions(id, user_id) values (${sessionId}, ${userId})`;
      // 중간 이벤트가 COMMIT 전에 HTTP를 통해 도착하는지 관찰할 시간을 만든다.
      await sql.unsafe(
        `create function private.csv_progress_test_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(0.005); return new; end $$;
        create trigger csv_progress_test_delay before insert on public.products for each row when (new.user_id = '${userId}'::uuid) execute function private.csv_progress_test_delay()`,
      );
      const handler = createCsvImportHandler({
        authenticate: () => Promise.resolve(identity),
        save: (viewer, payload, progress, signal) =>
          saveCsvImport(databaseUrl!, viewer, payload, progress, signal),
      });
      server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, handler);
      assert(server.addr.transport === "tcp");
      const response = await fetch(`http://127.0.0.1:${server.addr.port}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer verified-in-handler-test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = "", sawProgressBeforeCommit = false;
      const values: number[] = [];
      let result: { importedCount: number } | undefined;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        let newline: number;
        while ((newline = text.indexOf("\n")) >= 0) {
          const event = JSON.parse(text.slice(0, newline));
          text = text.slice(newline + 1);
          if (event.type === "progress") {
            assert(
              event.total === 120 && event.completed > (values.at(-1) ?? 0) &&
                event.completed < 120,
            );
            values.push(event.completed);
            if (!sawProgressBeforeCommit) {
              const [row] =
                await sql`select count(*)::int as n from public.products where user_id=${userId}`;
              assert(row.n === 0, "progress_must_arrive_before_commit");
              sawProgressBeforeCommit = true;
            }
          } else {
            assert(event.type === "result", JSON.stringify(event));
            result = event.data;
          }
        }
      }
      reader.releaseLock();
      assert(sawProgressBeforeCommit && values.length > 10 && result?.importedCount === 100);
      const [stored] =
        await sql`select count(*)::int as n from public.products where user_id=${userId}`;
      assert(stored.n === 100);
      const replay = await saveCsvImport(databaseUrl!, identity, input, () => {
        throw new Error("completed_job_must_not_restart");
      }, new AbortController().signal) as { importedCount: number };
      assert(replay.importedCount === 100);

      // 제한 상품이 섞여도 스트리밍 저장은 정상 상품만 반영하고 제외 사유를 반환한다.
      const sample = (input.import_plan.products as Record<string, unknown>[])[0];
      const restrictedInput: ImportRequest = {
        request_id: crypto.randomUUID(),
        import_plan: {
          ...input.import_plan,
          totalCount: 3,
          failures: [],
          duplicates: [],
          products: [
            { ...sample, name: "상품 19금", url: "https://csv.test/restricted/age" },
            {
              ...sample,
              rowNumber: 3,
              name: "선물",
              restrictionLabels: ["주류"],
              url: "https://csv.test/restricted/category",
            },
            { ...sample, rowNumber: 4, name: "가방", url: "https://csv.test/restricted/allowed" },
          ],
        },
      };
      const restrictedResult = await saveCsvImport(
        databaseUrl!,
        identity,
        restrictedInput,
        () => {},
        new AbortController().signal,
      ) as { importedCount: number; excludedProducts: { reason: string }[] };
      assert(restrictedResult.importedCount === 1, "restricted_rows_must_not_be_imported");
      assert(
        restrictedResult.excludedProducts.length === 2 &&
          restrictedResult.excludedProducts.every((item) => item.reason === "RESTRICTED_PRODUCT"),
        "restricted_rows_must_have_policy_reason",
      );
      const [restrictedStored] = await sql`select count(*)::int as n from public.products
        where user_id=${userId} and url like 'https://csv.test/restricted/%'`;
      assert(restrictedStored.n === 1, "only_allowed_product_must_be_committed");

      // 마지막 잘못된 행에서 실패해도 앞서 생성한 상품·폴더·작업 기록은 모두 롤백한다.
      const broken: ImportRequest = {
        request_id: crypto.randomUUID(),
        import_plan: {
          ...input.import_plan,
          totalCount: 3,
          failures: [],
          duplicates: [],
          folderMappings: [{ sourceName: "test", folderName: "test" }],
          products: [
            {
              ...(input.import_plan.products as Record<string, unknown>[])[0],
              url: "https://csv.test/rollback",
              sourceFolderNames: ["test"],
            },
            {
              ...(input.import_plan.products as Record<string, unknown>[])[0],
              url: "https://csv.test/rollback-2",
            },
            { rowNumber: "bad" },
          ],
        },
      };
      const rolledBack: Progress[] = [];
      let failed = false;
      try {
        await saveCsvImport(
          databaseUrl!,
          identity,
          broken,
          (value) => rolledBack.push(value),
          new AbortController().signal,
        );
      } catch {
        failed = true;
      }
      assert(failed && rolledBack.length === 2);
      const [rollback] = await sql`select
        (select count(*)::int from public.products where user_id=${userId} and url like 'https://csv.test/rollback%') as products,
        (select count(*)::int from public.folders where user_id=${userId} and kind='custom') as folders,
        (select count(*)::int from public.import_jobs where user_id=${userId} and request_id=${broken.request_id}) as jobs`;
      assert(rollback.products === 0 && rollback.folders === 0 && rollback.jobs === 0);

      const cancelInput: ImportRequest = {
        request_id: crypto.randomUUID(),
        import_plan: {
          ...input.import_plan,
          totalCount: 100,
          failures: [],
          duplicates: [],
          products: (input.import_plan.products as Record<string, unknown>[]).map((item, i) => ({
            ...item,
            url: `https://csv.test/cancel/${i}`,
          })),
        },
      };
      const cancel = new AbortController();
      let interrupted = false;
      try {
        await saveCsvImport(
          databaseUrl!,
          identity,
          cancelInput,
          () => cancel.abort(),
          cancel.signal,
        );
      } catch {
        interrupted = true;
      }
      assert(interrupted);
      const [cancelled] =
        await sql`select count(*)::int as n from public.products where user_id=${userId} and url like 'https://csv.test/cancel/%'`;
      assert(cancelled.n === 0, "cancelled_transaction_must_rollback");

      // 검증한 세션과 계정 경계도 직접 DB 연결에서 그대로 적용한다.
      for (const viewer of [{ userId, sessionId: crypto.randomUUID() }, { userId: otherId }]) {
        let denied = false;
        try {
          await saveCsvImport(databaseUrl!, viewer, input, () => {}, new AbortController().signal);
        } catch (error) {
          denied = !!error && typeof error === "object" && "code" in error &&
            error.code === "42501";
        }
        assert(denied, "session_and_account_scope_required");
      }
    } finally {
      await server?.shutdown();
      await sql.unsafe(
        "drop trigger if exists csv_progress_test_delay on public.products; drop function if exists private.csv_progress_test_delay()",
      );
      await sql`delete from auth.users where id in (${userId}, ${otherId})`;
      await sql.end();
    }
  },
});
