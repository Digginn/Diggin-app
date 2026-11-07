/* global __dirname */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const workflow = readFileSync(
  path.join(__dirname, "../.github/workflows/deploy-production-db.yml"),
  "utf8",
);
const script = workflow
  .match(/          script: \|\r?\n([\s\S]*?)(?=\r?\n      - uses: actions\/checkout)/)[1]
  .replace(/^ {12}/gm, "");
const guard = new (Object.getPrototypeOf(async function () {}).constructor)(
  "github",
  "context",
  "core",
  script,
);

test("운영 배포는 승인된 main 병합 커밋만 허용하며 개발 배포의 승인 예외를 사용하지 않는다", async () => {
  for (const scenario of [
    { allowed: true },
    { decision: "REVIEW_REQUIRED", allowed: false },
    { decision: null, allowed: false },
    { base: "develop", allowed: false },
    { merged: false, allowed: false },
    { sha: "other-commit", allowed: false },
    { baseRepo: "other/repo", allowed: false },
    { direct: true, allowed: false },
    ...[122, 177, 190].map((number) => ({ number, decision: "REVIEW_REQUIRED", allowed: false })),
  ]) {
    const failures = [];
    const pr = {
      number: scenario.number ?? 200,
      merged_at: scenario.merged === false ? null : "2026-11-07",
      merge_commit_sha: scenario.sha ?? "merge-commit",
      base: {
        ref: scenario.base ?? "main",
        repo: { full_name: scenario.baseRepo ?? "Digginn/Diggin-app" },
      },
    };
    const github = {
      rest: { repos: { listPullRequestsAssociatedWithCommit() {} } },
      paginate: async () => (scenario.direct ? [] : [pr]),
      graphql: async () => ({
        repository: {
          pullRequest: { reviewDecision: "decision" in scenario ? scenario.decision : "APPROVED" },
        },
      }),
    };
    await guard(
      github,
      { repo: { owner: "Digginn", repo: "Diggin-app" }, sha: "merge-commit" },
      {
        setFailed: (message) => failures.push(message),
      },
    );
    assert.equal(failures.length === 0, scenario.allowed, JSON.stringify(scenario));
  }
});

test("운영 접속 정보는 Diggin-pro만 허용하고 비밀번호를 URL 인코딩한다", () => {
  const python = workflow
    .match(/DB_URL="\$\(python3 - <<'PY'\r?\n([\s\S]*?)\r?\n          PY/)[1]
    .replace(/^ {10}/gm, "");
  for (const project of ["hymfhaowjyzuennxphfz", "rrlxfzddufutsmwcymci"]) {
    const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", python], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_PROJECT_ID: project,
        SUPABASE_DB_POOLER_HOST: "example.pooler.supabase.com",
        SUPABASE_DB_PASSWORD: "test+ @/%",
      },
    });
    if (project === "hymfhaowjyzuennxphfz") {
      assert.equal(result.status, 0, result.stderr);
      const url = new URL(result.stdout.trim());
      assert.equal(decodeURIComponent(url.password), "test+ @/%");
      assert.equal(url.port, "5432");
      assert.equal(url.searchParams.get("sslmode"), "require");
    } else {
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
    }
  }
});

test("운영 배포는 두 검증 작업 후 production 환경에서만 실행한다", () => {
  assert.equal((workflow.match(/branches: \[main\]/g) ?? []).length, 2);
  assert.match(
    workflow,
    /deploy:\r?\n    if: github.event_name == 'push' && github.ref == 'refs\/heads\/main'/,
  );
  assert.match(workflow, /needs: \[validate, validate_functions\]/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /ref: \$\{\{ needs.validate.outputs.commit \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /--include-seed|migration repair|db reset/);
});
