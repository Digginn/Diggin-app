/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => mocks[name] ?? (name.startsWith("@/assets/") ? name : require(name)),
    },
  );
  return module.exports;
}

const { measureScrollBar } = load("../src/components/Field.tsx", {
  "react-native": {
    Pressable: () => null,
    Text: () => null,
    TextInput: () => null,
    View: () => null,
  },
  "unicode-segmenter/grapheme": { splitGraphemes: (s) => [...s] },
  "@/theme": { colors: { gray: {}, semantic: {} } },
});

test("내용이 넘치지 않으면 막대를 그리지 않는다", () => {
  assert.equal(measureScrollBar(88, 44, 0), null);
  assert.equal(measureScrollBar(88, 88, 0), null);
  assert.equal(measureScrollBar(0, 200, 0), null);
});

test("막대 길이는 보이는 높이 비율을 따르고 트랙을 넘지 않는다", () => {
  // 트랙 80 = 88 - 위아래 4. 보이는 비율 88/176 이면 절반.
  assert.equal(measureScrollBar(88, 176, 0).length, 40);
  // 아주 긴 글이어도 24 밑으로는 줄지 않는다.
  assert.equal(measureScrollBar(88, 10000, 0).length, 24);
});

test("막대는 맨 위에서 안쪽 여백만큼 내려오고 끝까지 가면 트랙 끝에 붙는다", () => {
  assert.equal(measureScrollBar(88, 176, 0).offset, 4);
  // 끝까지 스크롤하면 4 + (80 - 40) = 44.
  assert.equal(measureScrollBar(88, 176, 88).offset, 44);
  // 범위를 넘겨도 트랙 밖으로 나가지 않는다.
  assert.equal(measureScrollBar(88, 176, 9999).offset, 44);
});
