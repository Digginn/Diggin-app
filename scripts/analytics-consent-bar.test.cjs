/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function setup(data = { usage_analysis: false, overseas_transfer: true }) {
  const toasts = [];
  const applied = [];
  const cached = [];
  let mutation;
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.join(__dirname, "../src/screens/my/components/AnalyticsConsentBar.tsx"),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name === "@tanstack/react-query")
          return {
            useQuery: () => ({ data, isPending: !data, refetch: async () => {} }),
            useMutation: (options) => {
              mutation = { ...options, requests: [] };
              return { isPending: false, mutate: (next) => mutation.requests.push(next) };
            },
            useQueryClient: () => ({ setQueryData: (key, value) => cached.push([key, value]) }),
          };
        if (name === "@/components/ConsentBar") return { ConsentBar: "ConsentBar" };
        if (name === "@/constants/messages")
          return {
            TOAST_MESSAGES: { MY_014: "MY_014", MY_015: "MY_015", SYS_002: "SYS_002" },
          };
        if (name === "@/hooks/useToast") return { useToast: () => (text) => toasts.push(text) };
        if (name === "@/lib/analytics")
          return { applyAnalyticsConsent: (userId, consent) => applied.push([userId, consent]) };
        if (name === "@/api/analyticsConsent")
          return { analyticsConsentKeys: { detail: (viewer) => ["consent", viewer] } };
        return require(name);
      },
    },
  );
  const render = (document) =>
    module.exports.AnalyticsConsentBar({ document, userId: "viewer" }).props;
  return { render, toasts, applied, cached, mutation: () => mutation };
}

test("항목별 현재 동의 상태를 보여 주고, 누르면 그 항목만 바꿔 저장한다", () => {
  const { render, mutation } = setup();
  assert.equal(render("usage-analysis").state, "off");
  assert.equal(render("overseas-transfer").state, "on");
  render("usage-analysis").onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(mutation().requests)), [
    { usage_analysis: true, overseas_transfer: true },
  ]);
});

test("체크한 저장이 성공하면 항목별 Toast를 띄우고 바로 전송 상태를 반영한다", () => {
  const { render, mutation, toasts, applied } = setup();
  render("overseas-transfer");
  const both = { usage_analysis: true, overseas_transfer: true };
  mutation().onSuccess(both, both);
  assert.deepEqual(toasts, ["MY_015"]);
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), [["viewer", both]]);
});

test("체크를 해제한 저장은 Toast 없이 철회를 반영하고, 실패하면 SYS-002를 띄운다", () => {
  const { render, mutation, toasts, applied } = setup();
  render("usage-analysis");
  const withdrawn = { usage_analysis: false, overseas_transfer: true };
  mutation().onSuccess(withdrawn, withdrawn);
  assert.deepEqual(toasts, []);
  assert.equal(applied.length, 1);
  mutation().onError(new Error("offline"));
  assert.deepEqual(toasts, ["SYS_002"]);
});

test("동의 상태를 못 불러왔으면 저장하지 않고 다시 불러온다", () => {
  const { render, mutation, toasts } = setup(null);
  const bar = render("usage-analysis");
  assert.equal(bar.isBusy, true);
  bar.onPress();
  assert.deepEqual(mutation().requests, []);
  assert.deepEqual(toasts, ["SYS_002"]);
});
