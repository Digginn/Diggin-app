/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function setup({
  current = { usage_analysis: false, overseas_transfer: false },
  userId = "u1",
} = {}) {
  const saved = [];
  const applied = [];
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/screens/login/api/loginConsent.ts"), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name === "@/api/analyticsConsent")
          return {
            fetchAnalyticsConsent: async () => current,
            saveAnalyticsConsent: async (consent, source) => {
              saved.push([JSON.parse(JSON.stringify(consent)), source]);
              return consent;
            },
          };
        if (name === "@/lib/analytics")
          return { applyAnalyticsConsent: (id, consent) => applied.push([id, consent]) };
        if (name === "@/lib/supabase")
          return {
            supabase: {
              auth: {
                getSession: async () => ({
                  data: { session: userId ? { user: { id: userId } } : null },
                }),
              },
            },
          };
        return require(name);
      },
    },
  );
  return { save: module.exports.saveLoginAnalyticsConsent, saved, applied };
}

const NONE = { usage_analysis: false, overseas_transfer: false };

test("신규 회원은 체크하지 않은 항목도 미동의로 저장하고 바로 반영한다", async () => {
  const { save, saved, applied } = setup();
  await save(true, { usage_analysis: true, overseas_transfer: false });
  assert.deepEqual(saved, [[{ usage_analysis: true, overseas_transfer: false }, "signup"]]);
  assert.equal(applied[0][0], "u1");
});

test("기존 회원은 체크한 항목만 더하고, 체크하지 않았다고 기존 동의를 철회하지 않는다", async () => {
  const kept = setup({ current: { usage_analysis: true, overseas_transfer: true } });
  await kept.save(false, NONE);
  assert.deepEqual(kept.saved, [], "바뀐 게 없으면 저장하지 않는다");
  assert.deepEqual(JSON.parse(JSON.stringify(kept.applied[0][1])), {
    usage_analysis: true,
    overseas_transfer: true,
  });

  const added = setup({ current: { usage_analysis: true, overseas_transfer: false } });
  await added.save(false, { usage_analysis: false, overseas_transfer: true });
  assert.deepEqual(added.saved, [[{ usage_analysis: true, overseas_transfer: true }, "login"]]);
});

test("세션이 없으면 저장하지 않는다", async () => {
  const { save, saved, applied } = setup({ userId: null });
  await save(true, NONE);
  assert.deepEqual([saved, applied], [[], []]);
});
