/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");
const {
  NICKNAME_HELPER_MESSAGE,
  validateNickname,
} = require("../src/screens/my/utils/validateNickname.ts");

test("닉네임의 10글자 경계와 특수문자 오류를 검사한다", () => {
  assert.equal(validateNickname("닉네임abc123"), undefined);
  assert.equal(validateNickname("가".repeat(10)), undefined);
  assert.equal(validateNickname("가".repeat(11)), NICKNAME_HELPER_MESSAGE);
  for (const value of ["닉네임!", "닉 네임", "닉네임😀"]) {
    assert.equal(validateNickname(value), "특수문자는 사용이 불가능합니다.");
  }
});

function renderProfile(platform = "android", isCameraGranted = true) {
  const calls = { library: 0, camera: 0, permission: 0, choices: [], images: [] };
  const native = {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Keyboard: { dismiss() {} },
    Platform: { OS: platform },
    Alert: {
      alert: (...args) => {
        calls.choices.push(args);
      },
    },
    ActionSheetIOS: {
      showActionSheetWithOptions: (options, callback) => {
        calls.sheet = { options, callback };
      },
    },
  };
  const picker = {
    requestCameraPermissionsAsync: async () => {
      calls.permission += 1;
      return { granted: isCameraGranted };
    },
    launchCameraAsync: async () => {
      calls.camera += 1;
      return { canceled: false, assets: [{ uri: "camera.jpg" }] };
    },
    launchImageLibraryAsync: async () => {
      calls.library += 1;
      return { canceled: false, assets: [{ uri: "album.jpg" }] };
    },
  };
  const source = readFileSync(
    path.join(__dirname, "../src/screens/my/ProfileEditScreen.tsx"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const screen = { exports: {} };
  runInNewContext(compiled, {
    exports: screen.exports,
    module: screen,
    require: (name) => {
      if (name === "react")
        return { ...React, useState: (initial) => [initial, (value) => calls.images.push(value)] };
      if (name === "react-native") return native;
      if (name === "expo-image-picker") return picker;
      if (name === "expo-image") return { Image: "Image" };
      if (name === "nativewind") return { cssInterop: (component) => component };
      if (name === "expo-router") return { useRouter: () => ({ back() {} }) };
      if (name === "react-native-safe-area-context")
        return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name === "@/assets/images/my") return { IconProfileCamera: "CameraSvg" };
      if (name.startsWith("@/components/"))
        return {
          AppBar: "AppBar",
          Button: "Button",
          HelperText: "HelperText",
          TextField: "TextField",
        };
      if (name === "./utils/validateNickname") return { NICKNAME_HELPER_MESSAGE, validateNickname };
      return require(name);
    },
  });
  function findCamera(node) {
    if (!React.isValidElement(node)) return undefined;
    if (node.props.accessibilityLabel === "프로필 사진 변경") return node;
    return React.Children.toArray(node.props.children).map(findCamera).find(Boolean);
  }
  return { calls, button: findCamera(screen.exports.ProfileEditScreen()) };
}

test("카메라 버튼은 먼저 선택 메뉴를 열고 선택한 경로만 실행한다", async () => {
  const { calls, button } = renderProfile();
  await button.props.onPress();
  assert.equal(calls.library, 0, "버튼을 누르자마자 앨범을 열면 안 됩니다");
  const options = calls.choices[0][2];
  assert.deepEqual(
    Array.from(options, (option) => option.text),
    ["사진 찍기", "앨범에서 선택", "취소"],
  );
  await options[0].onPress();
  assert.equal(calls.permission, 1);
  assert.equal(calls.camera, 1);
  assert.equal(calls.library, 0);
  await options[1].onPress();
  assert.equal(calls.library, 1);
  assert.deepEqual(calls.images, ["camera.jpg", "album.jpg"]);
});

test("카메라 버튼은 배경이 포함된 PNG 대신 Figma SVG를 렌더링한다", () => {
  const { button } = renderProfile();
  assert.equal(button.props.children.props.children?.type, "CameraSvg");
  assert.ok(button.props.className.includes("h-6 w-6"));
  assert.ok(button.props.children.props.className.includes("-left-5 -top-4"));
  const asset = readFileSync(
    path.join(__dirname, "../assets/images/my/icon-profile-camera.svg"),
    "utf8",
  );
  const header = asset.match(/<svg\b[^>]*>/)[0];
  assert.ok(header.includes('width="64"') && header.includes('height="64"'));
});

test("카메라 권한 거부 시 촬영하지 않고 안내한다", async () => {
  const { calls, button } = renderProfile("android", false);
  button.props.onPress();
  await calls.choices[0][2][0].onPress();
  assert.equal(calls.camera, 0);
  assert.equal(calls.choices[1][0], "카메라 권한 필요");
});

test("iOS 선택 메뉴에서 취소하면 사진 선택기를 실행하지 않는다", () => {
  const { calls, button } = renderProfile("ios");
  button.props.onPress();
  assert.deepEqual(Array.from(calls.sheet.options.options), ["사진 찍기", "앨범에서 선택", "취소"]);
  calls.sheet.callback(2);
  assert.equal(calls.library, 0);
  assert.equal(calls.camera, 0);
});
