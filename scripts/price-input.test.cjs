/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const module_ = { exports: {} };
runInNewContext(
  ts.transpileModule(
    readFileSync(
      path.join(__dirname, "../src/screens/item-detail/utils/formatPriceInput.ts"),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { module: module_, exports: module_.exports },
);
const { formatPriceInput } = module_.exports;

test("세 자리마다 쉼표를 찍는다", () => {
  assert.equal(formatPriceInput("1000"), "1,000");
  assert.equal(formatPriceInput("10000"), "10,000");
  assert.equal(formatPriceInput("1234567"), "1,234,567");
  assert.equal(formatPriceInput("999"), "999");
});

test("숫자가 아닌 글자와 앞자리 0을 지운다", () => {
  assert.equal(formatPriceInput("1,0000"), "10,000");
  assert.equal(formatPriceInput("70,000원"), "70,000");
  assert.equal(formatPriceInput("007"), "7");
  assert.equal(formatPriceInput("0"), "0");
  assert.equal(formatPriceInput(""), "");
});
