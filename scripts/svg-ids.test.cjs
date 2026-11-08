/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { resolveConfig, transform } = require("@svgr/core");

test("SVG 변환은 원본 크기를 유지하며 파일별 ID로 clipPath 충돌을 방지한다", async () => {
  const names = ["icon-withdrawal-check-on.svg", "icon-select-check-on.svg"];
  const ids = [];
  for (const name of names) {
    const filePath = path.join(__dirname, "../assets/images", name);
    const config = await resolveConfig(path.dirname(filePath));
    const code = await transform(
      readFileSync(filePath, "utf8"),
      {
        native: true,
        plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
        ...config,
      },
      { filePath },
    );
    const id = code.match(/<ClipPath id="([^"]+)"/)[1];
    ids.push(id);
    assert.ok(code.includes(`url(#${id})`));
    assert.match(code, /width=\{20\} height=\{20\}/);
  }
  assert.notEqual(ids[0], ids[1], "여러 SVG가 같은 화면에 있어도 클립 ID가 겹치면 안 된다.");
});
