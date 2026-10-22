/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const workflow = readFileSync(path.join(__dirname, "../.github/workflows/deploy-shared-db.yml"), "utf8");
const script = workflow.match(/          script: \|\r?\n([\s\S]*?)(?=\r?\n      - uses: actions\/checkout)/)[1]
  .replace(/^ {12}/gm, "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const guard = new AsyncFunction("github", "context", "core", script);

test("운영자 등록 예외만 허용하고 다른 PR·직접 push의 승인 검사를 유지한다", async () => {
  for (const scenario of [
    { number: 122, allowed: true },
    { number: 123, allowed: false },
    { number: 123, decision: "APPROVED", allowed: true },
    { number: 122, head: "other-branch", allowed: false },
    { number: 122, owner: "other-owner", allowed: false },
    { number: 122, merged: false, allowed: false },
    { number: 122, sha: "other-commit", allowed: false },
    { number: 122, base: "main", allowed: false },
  ]) {
    const owner = scenario.owner ?? "Digginn";
    const failures = [];
    const github = {
      rest: { repos: { listPullRequestsAssociatedWithCommit() {} } },
      paginate: async () => [{
        number: scenario.number,
        merged_at: scenario.merged === false ? null : "2026-10-22",
        merge_commit_sha: scenario.sha ?? "merge-commit",
        base: { ref: scenario.base ?? "develop", repo: { full_name: `${owner}/Diggin-app` } },
        head: { ref: scenario.head ?? "chore/115-retool-registration-deploy" },
      }],
      graphql: async () => ({ repository: { pullRequest: { reviewDecision: scenario.decision ?? "REVIEW_REQUIRED" } } }),
    };
    await guard(github, { repo: { owner, repo: "Diggin-app" }, sha: "merge-commit" }, {
      setFailed: (message) => failures.push(message),
      info() {},
    });
    assert.equal(failures.length === 0, scenario.allowed, JSON.stringify(scenario));
  }
});
