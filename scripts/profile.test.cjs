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
    assert.equal(validateNickname(value), "공백·특수문자는 사용할 수 없습니다.");
  }
});

function renderProfile(
  platform = "android",
  isCameraGranted = true,
  screenProps = {},
  isPickerFailure = false,
  pickedAsset = { uri: "album.jpg" },
) {
  const calls = {
    library: 0,
    camera: 0,
    permission: 0,
    choices: [],
    actionSheets: [],
    images: [],
    toasts: [],
    dismissed: [],
  };
  const states = [];
  let stateIndex = 0;
  const native = {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    KeyboardAvoidingView: "KeyboardAvoidingView",
    Keyboard: { dismiss() {} },
    Platform: { OS: platform },
    ActionSheetIOS: {
      showActionSheetWithOptions: (options, callback) => {
        calls.actionSheets.push({ options, callback });
      },
    },
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
      return { canceled: false, assets: [pickedAsset] };
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
      if (name === "./utils/validateNickname")
        return require("../src/screens/my/utils/validateNickname.ts");
      if (name === "@/api/avatar") return { AVATAR_UNREADABLE_ERROR: "avatar_unreadable" };
      if (name === "./utils/validateProfileImage") {
        const validator = { exports: {} };
        runInNewContext(
          ts.transpileModule(
            readFileSync(
              path.join(__dirname, "../src/screens/my/utils/validateProfileImage.ts"),
              "utf8",
            ),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
          ).outputText,
          {
            exports: validator.exports,
            module: validator,
            require: () => require("../src/screens/my/constants/profileMessages.ts"),
          },
        );
        return validator.exports;
      }
      if (name === "@/utils/text") return require("../src/utils/text.ts");
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
  const button = (label) => {
    const element = find(render(), (node) => node.props.accessibilityLabel === label);
    if (element) return element;
    if (platform === "ios") {
      const sheet = calls.actionSheets.at(-1);
      const index = sheet?.options.options.indexOf(label);
      if (index >= 0) return { props: { onPress: () => sheet.callback(index) } };
    } else {
      const choice = calls.choices.at(-1)?.[2]?.find((choice) => choice.text === label);
      if (choice) return { props: { onPress: choice.onPress ?? (() => {}) } };
    }
  };
  return {
    calls,
    button,
    render,
    save: () => find(render(), (node) => node.type === "Button").props.onPress(),
    saveButton: () => find(render(), (node) => node.type === "Button"),
    counter: () => {
      const text = find(render(), (node) => node.props.className?.includes("absolute right-4"));
      return [].concat(text.props.children).join("");
    },
    helper: () => find(render(), (node) => node.type === "HelperText"),
  };
}

test("닉네임을 모두 지우면 저장 버튼을 비활성화하고 다시 입력하면 활성화한다", async () => {
  for (const platform of ["android", "ios"]) {
    let saves = 0;
    const h = renderProfile(platform, true, {
      onSaveNickname: async () => {
        saves += 1;
      },
    });
    assert.equal(h.saveButton().props.isDisabled, true);
    h.button("닉네임").props.onChangeText("변경닉네임");
    assert.equal(h.saveButton().props.isDisabled, false);
    h.button("닉네임").props.onChangeText("");
    assert.equal(h.counter(), "0/10");
    assert.equal(h.saveButton().props.isDisabled, true);
    await h.save();
    assert.equal(saves, 0);
    assert.deepEqual(h.calls.dismissed, []);
    assert.deepEqual(h.calls.toasts, []);
    h.button("닉네임").props.onChangeText("새닉네임");
    assert.equal(h.saveButton().props.isDisabled, false);
  }
});

test("프로필 수정은 Android만 키보드에 맞춰 줄이고 iOS 화면 껍데기는 유지한다", () => {
  const android = renderProfile().render();
  assert.equal(android.type, "KeyboardAvoidingView");
  assert.equal(android.props.behavior, "height");
  assert.equal(android.props.style.flex, 1);
  const ios = renderProfile("ios").render();
  assert.equal(ios.type, "View");
  assert.equal(ios.props.behavior, undefined);
});

test("카메라 버튼은 먼저 선택 메뉴를 열고 선택한 경로만 실행한다", async () => {
  const { calls, button } = renderProfile();
  button("프로필 사진 변경").props.onPress();
  assert.equal(calls.choices[0][0], "프로필 사진 변경");
  assert.equal(calls.library, 0, "버튼을 누르자마자 앨범을 열면 안 됩니다");
  await button("사진찍기").props.onPress();
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
  assert.equal(calls.choices.at(-1)[0], "카메라 권한 필요");
});

test("각 플랫폼의 기본 메뉴 취소는 사진 선택기를 실행하지 않는다", () => {
  for (const platform of ["ios", "android"]) {
    const { calls, button } = renderProfile(platform);
    button("프로필 사진 변경").props.onPress();
    button("취소").props.onPress();
    if (platform === "ios") {
      assert.equal(calls.actionSheets[0].options.cancelButtonIndex, 2);
      assert.equal(calls.choices.length, 0);
    } else {
      assert.equal(calls.choices[0][3].cancelable, true);
      assert.equal(calls.actionSheets.length, 0);
    }
    assert.equal(calls.library, 0);
    assert.equal(calls.camera, 0);
  }
});

test("iOS 기본 ActionSheet에서 선택한 촬영·앨범 경로만 실행한다", async () => {
  const { calls, button } = renderProfile("ios");
  button("프로필 사진 변경").props.onPress();
  assert.equal(calls.library, 0);
  await button("앨범에서 선택").props.onPress();
  assert.equal(calls.library, 1);
  assert.equal(calls.camera, 0);
  button("프로필 사진 변경").props.onPress();
  await button("사진찍기").props.onPress();
  assert.equal(calls.camera, 1);
  assert.deepEqual(calls.images, ["album.jpg", "camera.jpg"]);
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

test("서버 닉네임 검사에 걸리면 문구를 입력칸 아래에 보여주고 사진은 저장하지 않는다", async () => {
  let photoSaves = 0;
  const { calls, button, save, helper } = renderProfile("android", true, {
    onSaveNickname: async () => "이미 사용 중인 닉네임입니다.",
    onSavePhoto: async () => {
      photoSaves++;
    },
  });
  button("프로필 사진 변경").props.onPress();
  await button("앨범에서 선택").props.onPress();
  button("닉네임").props.onChangeText("위시러버");
  await save();
  assert.equal(helper().props.status, "error");
  assert.equal(helper().props.message, "이미 사용 중인 닉네임입니다.");
  assert.equal(photoSaves, 0);
  assert.deepEqual(calls.dismissed, []);
  assert.deepEqual(calls.toasts, []);
});

test("금칙어 오류가 보이는 동안 저장을 막고 입력칸을 오류로 표시하며, 고치면 다시 연다", async () => {
  let saves = 0;
  const { button, save, helper, saveButton } = renderProfile("android", true, {
    onSaveNickname: async () => {
      saves++;
      return saves === 1 ? "사용할 수 없는 닉네임입니다." : undefined;
    },
  });
  button("닉네임").props.onChangeText("시발놈");
  await save();
  assert.equal(helper().props.message, "사용할 수 없는 닉네임입니다.");
  assert.equal(button("닉네임").props.isError, true);
  assert.equal(saveButton().props.isDisabled, true);
  await button("닉네임").props.onSubmitEditing();
  assert.equal(saves, 1, "키보드 완료로도 다시 보내지 않는다");
  button("닉네임").props.onChangeText("시발점");
  assert.equal(button("닉네임").props.isError, false);
  assert.equal(saveButton().props.isDisabled, false);
  await save();
  assert.equal(saves, 2);
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
  assert.equal(saved.saveButton().props.isDisabled, false, "사진만 바꾼 경우도 저장할 수 있다");
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

test("사진 오류는 원인별 문구를 보여 주고 기존 사진을 유지한다", async () => {
  const uploadFailed = renderProfile("android", true, {
    onSavePhoto: async () => {
      throw new Error("upload_failed");
    },
  });
  uploadFailed.button("프로필 사진 변경").props.onPress();
  await uploadFailed.button("앨범에서 선택").props.onPress();
  await uploadFailed.save();
  assert.deepEqual(uploadFailed.calls.dismissed, []);
  assert.deepEqual(uploadFailed.calls.toasts, [
    "이미지를 변경하지 못했습니다. 다시 시도해 주세요.",
  ]);

  const unreadable = "사용할 수 없는 이미지입니다. 다시 선택해 주세요.";
  const convertFailed = renderProfile("android", true, {
    onSavePhoto: async () => {
      throw new Error("avatar_unreadable");
    },
  });
  convertFailed.button("프로필 사진 변경").props.onPress();
  await convertFailed.button("앨범에서 선택").props.onPress();
  await convertFailed.save();
  assert.deepEqual(convertFailed.calls.toasts, [unreadable]);

  const picking = renderProfile("android", true, {}, true);
  picking.button("프로필 사진 변경").props.onPress();
  await picking.button("앨범에서 선택").props.onPress();
  assert.deepEqual(picking.calls.toasts, [unreadable]);

  for (const [asset, message] of [
    [{ uri: "a.gif", mimeType: "image/gif" }, "JPG, PNG, WEBP 이미지만 선택할 수 있습니다."],
    [{ uri: "a.bmp" }, "JPG, PNG, WEBP 이미지만 선택할 수 있습니다."],
    [
      { uri: "a.jpg", mimeType: "image/jpeg", fileSize: 10 * 1024 * 1024 + 1 },
      "10MB 이하 이미지만 선택할 수 있습니다.",
    ],
  ]) {
    const rejected = renderProfile("android", true, {}, false, asset);
    rejected.button("프로필 사진 변경").props.onPress();
    await rejected.button("앨범에서 선택").props.onPress();
    assert.deepEqual(rejected.calls.toasts, [message]);
    assert.deepEqual(rejected.calls.images, [], "기존 사진을 유지한다");
  }

  for (const asset of [
    { uri: "a.heic", mimeType: "image/heic", fileSize: 10 * 1024 * 1024 },
    { uri: "a.webp" },
  ]) {
    const accepted = renderProfile("android", true, {}, false, asset);
    accepted.button("프로필 사진 변경").props.onPress();
    await accepted.button("앨범에서 선택").props.onPress();
    assert.deepEqual(accepted.calls.toasts, []);
    assert.deepEqual(accepted.calls.images, [asset.uri]);
  }
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

test("닉네임 입력칸 오른쪽에 글자 수를 보여 준다", () => {
  const { button, counter } = renderProfile("ios", true, {});
  assert.equal(counter(), "0/10");
  button("닉네임").props.onChangeText("욕설닉네임");
  assert.equal(counter(), "5/10");
  button("닉네임").props.onChangeText("👍🏻디기");
  assert.equal(counter(), "3/10", "이모지 조합은 서버처럼 1자로 센다");
});

test("닉네임은 타이핑·붙여넣기 모두 10글자로 제한하고 카운터와 저장 값도 일치한다", async () => {
  for (const platform of ["ios", "android"]) {
    const saved = [];
    const { button, counter, save } = renderProfile(platform, true, {
      onSaveNickname: async (nickname) => {
        saved.push(nickname);
      },
    });
    assert.equal(button("닉네임").props.maxLength, 10);
    button("닉네임").props.onChangeText("가나다라마바사아자차");
    button("닉네임").props.onChangeText("가나다라마바사아자차카");
    assert.equal(button("닉네임").props.value, "가나다라마바사아자차");
    assert.equal(counter(), "10/10");
    button("닉네임").props.onChangeText("12345678901234567890");
    assert.equal(button("닉네임").props.value, "1234567890");
    assert.equal(counter(), "10/10");
    await save();
    assert.equal(saved[0], "1234567890");
    button("닉네임").props.onChangeText("123456789");
    assert.equal(counter(), "9/10");
    button("닉네임").props.onChangeText("123456789가");
    assert.equal(counter(), "10/10");
  }
});
