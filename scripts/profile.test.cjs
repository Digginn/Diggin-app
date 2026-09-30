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

function renderProfile(
  platform = "android",
  isCameraGranted = true,
  screenProps = {},
  isPickerFailure = false,
) {
  const calls = {
    library: 0,
    camera: 0,
    permission: 0,
    choices: [],
    images: [],
    toasts: [],
    dismissed: [],
  };
  const states = [];
  let stateIndex = 0;
  const pendingPhotoSource = { current: undefined };
  const native = {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Modal: "Modal",
    Keyboard: { dismiss() {} },
    Platform: { OS: platform },
    Alert: {
      alert: (...args) => {
        calls.choices.push(args);
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
      if (isPickerFailure) throw new Error("사진 선택 실패");
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
        return {
          ...React,
          useRef: () => pendingPhotoSource,
          useState: (initial) => {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [
              states[index],
              (value) => {
                states[index] = value;
                if (index === 1) calls.images.push(value);
              },
            ];
          },
        };
      if (name === "react-native") return native;
      if (name === "expo-image-picker") return picker;
      if (name === "expo-image") return { Image: "Image" };
      if (name === "nativewind") return { cssInterop: (component) => component };
      if (name === "expo-router")
        return { useRouter: () => ({ dismissTo: (path) => calls.dismissed.push(path) }) };
      if (name === "@/hooks/useToast")
        return { useToast: () => (message) => calls.toasts.push(message) };
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
      if (name === "./constants/profileMessages")
        return require("../src/screens/my/constants/profileMessages.ts");
      return require(name);
    },
  });
  function find(node, predicate) {
    if (!React.isValidElement(node)) return undefined;
    if (predicate(node)) return node;
    return React.Children.toArray(node.props.children)
      .map((child) => find(child, predicate))
      .find(Boolean);
  }
  const render = () => {
    stateIndex = 0;
    return screen.exports.ProfileEditScreen(screenProps);
  };
  const button = (label) => find(render(), (node) => node.props.accessibilityLabel === label);
  return {
    calls,
    button,
    modal: () => find(render(), (node) => node.type === "Modal"),
    save: () => find(render(), (node) => node.type === "Button").props.onPress(),
  };
}

test("카메라 버튼은 먼저 선택 메뉴를 열고 선택한 경로만 실행한다", async () => {
  const { calls, button, modal } = renderProfile();
  assert.equal(modal().props.visible, false);
  button("프로필 사진 변경").props.onPress();
  assert.equal(modal().props.visible, true);
  assert.equal(calls.library, 0, "버튼을 누르자마자 앨범을 열면 안 됩니다");
  await button("사진찍기").props.onPress();
  assert.equal(modal().props.visible, false);
  assert.equal(calls.permission, 1);
  assert.equal(calls.camera, 1);
  assert.equal(calls.library, 0);
  button("프로필 사진 변경").props.onPress();
  await button("앨범에서 선택").props.onPress();
  assert.equal(calls.library, 1);
  assert.deepEqual(calls.images, ["camera.jpg", "album.jpg"]);
});

test("프로필 영역 전체가 터치 가능하며 카메라 SVG 크기와 위치는 유지한다", () => {
  const button = renderProfile().button("프로필 사진 변경");
  assert.equal(button.type, "Pressable");
  assert.ok(button.props.className.includes("h-[93px] w-[93px]"));
  const cameraSlot = React.Children.toArray(button.props.children)[1];
  assert.equal(cameraSlot.props.pointerEvents, "none");
  assert.ok(cameraSlot.props.className.includes("left-[72px] top-[73px] h-6 w-6"));
  const cameraAsset = cameraSlot.props.children;
  assert.ok(cameraAsset.props.className.includes("-left-5 -top-4"));
  assert.equal(cameraAsset.props.children.type, "CameraSvg");
  const asset = readFileSync(
    path.join(__dirname, "../assets/images/my/icon-profile-camera.svg"),
    "utf8",
  );
  const header = asset.match(/<svg\b[^>]*>/)[0];
  assert.ok(header.includes('width="64"') && header.includes('height="64"'));
});

test("카메라 권한 거부 시 촬영하지 않고 안내한다", async () => {
  const { calls, button } = renderProfile("android", false);
  button("프로필 사진 변경").props.onPress();
  await button("사진찍기").props.onPress();
  assert.equal(calls.camera, 0);
  assert.equal(calls.choices[0][0], "카메라 권한 필요");
});

test("선택 메뉴 취소·배경 탭·뒤로 가기는 사진 선택기를 실행하지 않는다", () => {
  const { calls, button, modal } = renderProfile("ios");
  for (const close of [
    () => button("취소").props.onPress(),
    () => button("사진 선택 메뉴 닫기").props.onPress(),
    () => modal().props.onRequestClose(),
  ]) {
    button("프로필 사진 변경").props.onPress();
    close();
    assert.equal(modal().props.visible, false);
  }
  assert.equal(calls.library, 0);
  assert.equal(calls.camera, 0);
});

test("iOS에서는 모달이 닫힌 뒤 시스템 사진 선택기를 실행한다", async () => {
  const { calls, button, modal } = renderProfile("ios");
  button("프로필 사진 변경").props.onPress();
  button("앨범에서 선택").props.onPress();
  assert.equal(calls.library, 0);
  await modal().props.onDismiss();
  assert.equal(calls.library, 1);
  await modal().props.onDismiss();
  assert.equal(calls.library, 1);
});

test("유효한 닉네임 저장 성공 시 MY로 이동하고 성공 토스트를 표시한다", async () => {
  let savedNickname;
  const { calls, button, save } = renderProfile("android", true, {
    onSaveNickname: async (nickname) => {
      savedNickname = nickname;
    },
  });
  button("닉네임").props.onChangeText("변경닉네임");
  await save();
  assert.equal(savedNickname, "변경닉네임");
  assert.deepEqual(calls.dismissed, ["/(tabs)/my"]);
  assert.deepEqual(calls.toasts, ["닉네임이 변경되었습니다."]);
});

test("저장 콜백이 없는 실제 화면은 저장 성공을 표시하지 않는다", async () => {
  const { calls, button, save } = renderProfile();
  button("닉네임").props.onChangeText("변경닉네임");
  await save();
  assert.deepEqual(calls.dismissed, []);
  assert.deepEqual(calls.toasts, ["저장 기능은 준비 중입니다."]);
});

test("사진만 저장한 경우 성공을 안내하고, 일부 저장 콜백이 없으면 실행하지 않는다", async () => {
  let photoSaves = 0;
  const saved = renderProfile("android", true, {
    onSavePhoto: async () => {
      photoSaves++;
    },
  });
  saved.button("프로필 사진 변경").props.onPress();
  await saved.button("앨범에서 선택").props.onPress();
  await saved.save();
  assert.equal(photoSaves, 1);
  assert.deepEqual(saved.calls.toasts, ["프로필 사진이 변경되었습니다."]);

  const partial = renderProfile("android", true, {
    onSavePhoto: async () => {
      photoSaves++;
    },
  });
  partial.button("닉네임").props.onChangeText("변경닉네임");
  partial.button("프로필 사진 변경").props.onPress();
  await partial.button("앨범에서 선택").props.onPress();
  await partial.save();
  assert.equal(photoSaves, 1);
  assert.deepEqual(partial.calls.dismissed, []);
  assert.deepEqual(partial.calls.toasts, ["저장 기능은 준비 중입니다."]);
});

test("닉네임 저장 실패 시 입력을 유지하고 이동하지 않는다", async () => {
  const { calls, button, save } = renderProfile("android", true, {
    onSaveNickname: async () => {
      throw new Error("저장 실패");
    },
  });
  button("닉네임").props.onChangeText("변경닉네임");
  await save();
  assert.equal(button("닉네임").props.value, "변경닉네임");
  assert.deepEqual(calls.dismissed, []);
  assert.deepEqual(calls.toasts, ["닉네임을 변경하지 못했습니다. 다시 시도해 주세요."]);
});

test("프로필 사진 저장 실패와 선택기 오류에 사진 실패 토스트를 표시한다", async () => {
  const saving = renderProfile("android", true, {
    onSavePhoto: async () => {
      throw new Error("사진 저장 실패");
    },
  });
  saving.button("프로필 사진 변경").props.onPress();
  await saving.button("앨범에서 선택").props.onPress();
  await saving.save();
  assert.deepEqual(saving.calls.dismissed, []);
  assert.deepEqual(saving.calls.toasts, ["프로필 사진을 변경하지 못했습니다. 다시 시도해 주세요."]);

  const picking = renderProfile("android", true, {}, true);
  picking.button("프로필 사진 변경").props.onPress();
  await picking.button("앨범에서 선택").props.onPress();
  assert.deepEqual(picking.calls.toasts, saving.calls.toasts);
});

test("닉네임 검증 오류는 저장 콜백이나 성공 토스트를 실행하지 않는다", async () => {
  let saveCount = 0;
  const { calls, button, save } = renderProfile("android", true, {
    onSaveNickname: async () => {
      saveCount += 1;
    },
  });
  button("닉네임").props.onChangeText("닉네임!");
  await save();
  assert.equal(saveCount, 0);
  assert.deepEqual(calls.toasts, []);
  assert.deepEqual(calls.dismissed, []);
});
