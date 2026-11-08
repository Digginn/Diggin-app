/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

for (const [originalWidth, originalHeight] of [
  [300, 400],
  [400, 300],
  [513, 512],
  [512, 512],
]) {
  for (const uri of ["https://kakao.test/profile.jpg", "file:///profile.jpg"]) {
    test(`${uri}: ${originalWidth}×${originalHeight} 프로필을 비율 왜곡 없이 중앙 정사각형으로 저장한다`, async () => {
      let width = originalWidth,
        height = originalHeight;
      let distorted = false;
      let crop;
      let uploaded = false;
      let avatarPath;
      const context = {
        crop(rect) {
          crop = rect;
          width = rect.width;
          height = rect.height;
          return this;
        },
        resize(size) {
          distorted ||= size.width / width !== size.height / height;
          width = size.width;
          height = size.height;
          return this;
        },
        async renderAsync() {
          return { width, height, saveAsync: async () => ({ uri: "file:///avatar.webp" }) };
        },
      };
      const mocks = {
        "expo-image": { Image: { loadAsync: async () => ({ width, height }) } },
        "expo-image-manipulator": {
          ImageManipulator: { manipulate: () => context },
          SaveFormat: { WEBP: "webp" },
        },
        "@/lib/supabase": {
          supabase: {
            auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
            storage: {
              from: () => ({
                upload: async () => {
                  uploaded = true;
                  return {};
                },
              }),
            },
            rpc: async (_, args) => {
              avatarPath = args.new_path;
              return {};
            },
          },
        },
      };
      const module = { exports: {} };
      runInNewContext(
        ts.transpileModule(readFileSync(path.join(__dirname, "../src/api/avatar.ts"), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText,
        {
          module,
          exports: module.exports,
          require: (name) => mocks[name],
          fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(1) }),
        },
      );
      await module.exports.saveAvatar(uri);
      assert.equal(distorted, false, "가로와 세로의 확대·축소 배율이 같아야 한다");
      assert.equal(width, 512);
      assert.equal(height, 512);
      const side = Math.min(originalWidth, originalHeight);
      assert.equal(crop.width, side);
      assert.equal(crop.height, side);
      assert.equal(crop.originX, Math.floor((originalWidth - side) / 2));
      assert.equal(crop.originY, Math.floor((originalHeight - side) / 2));
      assert.equal(uploaded, true);
      assert.equal(avatarPath, "test-user/avatar.webp");
    });
  }
}
