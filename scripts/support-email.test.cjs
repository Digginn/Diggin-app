/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const emailModule = { exports: {} };
runInNewContext(
  ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/screens/my/utils/supportEmail.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { module: emailModule, exports: emailModule.exports },
);
const { buildSupportEmail } = emailModule.exports;

const GUIDE =
  "문의, 피드백, 버그, 제안을 남겨 주세요.\n가능한 빠르게 답변 드리겠습니다.\n*자세히 적어 주시면(사진, 영상 첨부 포함) 더욱 빠르게 해결됩니다.";

test("Android는 안내 문구 아래 빈 줄 두 개를 두고 ApiLevel을 포함한 기기 정보를 붙인다", () => {
  const { subject, body } = buildSupportEmail({
    nickname: "디기",
    appVersion: "1.0.0",
    buildNumber: "10",
    os: "android",
    osName: "Android",
    osVersion: "13",
    apiLevel: 33,
    model: "SM-N981N",
    manufacturer: "samsung",
  });
  assert.equal(subject, "[DIGGIN] 디기님의 메일입니다.");
  assert.equal(
    body,
    `${GUIDE}\n\n\nName: 디기\nApp Version: 1.0.0\nBuild Number: 10\nApiLevel: 33\nSystemVersion: Android 13\nModel: SM-N981N (samsung)`,
  );
});

test("iOS는 ApiLevel을 넣지 않고, 비회원·빠진 값은 추측하지 않고 표시한다", () => {
  const { subject, body } = buildSupportEmail({
    nickname: null,
    appVersion: null,
    buildNumber: null,
    os: "ios",
    osName: "iOS",
    osVersion: "27.0.1",
    apiLevel: null,
    model: null,
    manufacturer: "Apple",
  });
  assert.equal(subject, "[DIGGIN] 비회원님의 메일입니다.");
  assert.ok(!body.includes("ApiLevel"));
  assert.ok(body.endsWith("SystemVersion: iOS 27.0.1\nModel: (Apple)"));
  assert.ok(!body.includes("Identification"), "기기 고유 ID는 넣지 않는다");
  assert.ok(body.includes("App Version: -\nBuild Number: -"));
});
