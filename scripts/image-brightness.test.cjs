const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const zlib = require("node:zlib");
const ts = require("typescript");

function load() {
  const source = readFileSync(
    path.join(__dirname, "../src/screens/item-detail/utils/imageBrightness.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, { module, exports: module.exports, require, Uint8Array, DataView });
  return module.exports;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}

function onePixelPng(rgba, filter = 0) {
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const data = zlib.deflateSync(Buffer.from([filter, ...rgba]));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", data),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

test("1×1 PNG의 픽셀 색을 읽고 어두운지 가른다", () => {
  const { readSinglePixelPng, isDarkColor } = load();
  assert.deepEqual([...readSinglePixelPng(onePixelPng([20, 30, 40, 255]))], [20, 30, 40]);
  assert.deepEqual([...readSinglePixelPng(onePixelPng([200, 10, 10, 255], 4))], [200, 10, 10]);
  assert.deepEqual(
    [...readSinglePixelPng(onePixelPng([0, 0, 0, 0]))],
    [255, 255, 255],
    "투명한 픽셀은 흰 배경으로 본다",
  );
  assert.deepEqual([...readSinglePixelPng(onePixelPng([0, 0, 0, 128]))], [127, 127, 127]);
  assert.equal(isDarkColor([20, 30, 40]), true);
  assert.equal(isDarkColor([240, 240, 240]), false);
  assert.equal(
    isDarkColor([110, 110, 110]),
    true,
    "중간보다 조금 어두운 회색은 흰색이 더 잘 보인다",
  );
  assert.equal(isDarkColor([128, 128, 128]), false);
});

test("cover로 잘린 이미지에서 화살표 뒤 원본 영역을 구한다", () => {
  const { coverCropRect } = load();
  // 1000×1000 이미지를 375×520 칸에 cover로 그리면 좌우가 잘린다.
  const rect = coverCropRect(
    { width: 1000, height: 1000 },
    { width: 375, height: 520 },
    { x: 0, y: 59, width: 48, height: 48 },
  );
  assert.equal(rect.originX, 139);
  assert.equal(rect.originY, 113);
  assert.equal(rect.width, 93);
  assert.equal(rect.height, 93);
  const edge = coverCropRect(
    { width: 10, height: 10 },
    { width: 375, height: 520 },
    { x: 0, y: 500, width: 48, height: 48 },
  );
  assert.ok(edge.originY + edge.height <= 10, "이미지 밖으로 나가지 않는다");
});
