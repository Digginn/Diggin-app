/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const CHANNEL_URL = "http://pf.kakao.com/_zIxnrX";

function setup(screenName) {
  const toasts = [],
    routes = [],
    opened = [],
    copied = [];
  let hasLinkFailure = false,
    copyResult = true;
  const states = [],
    refs = [];
  let cursor = 0,
    refCursor = 0;
  const screen = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, `../src/screens/my/${screenName}.tsx`), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    {
      module: screen,
      exports: screen.exports,
      __DEV__: true,
      require: (name) => {
        if (name === "react")
          return {
            ...React,
            useState: (initial) => {
              const index = cursor++;
              if (!(index in states)) states[index] = initial;
              return [
                states[index],
                (value) => {
                  states[index] = value;
                },
              ];
            },
            useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
            useEffect: () => {},
          };
        if (name === "react-native")
          return {
            View: "View",
            Text: "Text",
            Pressable: "Pressable",
            ScrollView: "ScrollView",
            TextInput: "TextInput",
            Keyboard: {
              isVisible: () => false,
              dismiss() {},
              addListener: () => ({ remove() {} }),
            },
            Platform: { OS: "android" },
            Linking: {
              openURL: async (url) => {
                opened.push(url);
                if (hasLinkFailure) throw new Error("link failure");
              },
            },
          };
        if (name === "expo-clipboard")
          return {
            setStringAsync: async (text) => {
              copied.push(text);
              if (copyResult instanceof Error) throw copyResult;
              return copyResult;
            },
          };
        if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
        if (name === "expo-router")
          return { useRouter: () => ({ push: (route) => routes.push(route) }) };
        if (name === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ bottom: 34 }) };
        if (name === "@/hooks/useToast") return { useToast: () => (text) => toasts.push(text) };
        if (name === "@/components/app-bar") return { AppBar: "AppBar" };
        if (name === "@/components/Button") return { Button: "Button" };
        if (name === "@/components/modal") return { Modal: "Modal" };
        if (name === "@/components/BottomSheet") return { BottomSheet: "BottomSheet" };
        if (name === "@/components/ToastText") return { ToastText: "ToastText" };
        if (name === "@/theme") return { colors: { gray: { 0: "#FFFFFF", 900: "#1E1E1E" } } };
        if (name.endsWith("icon-withdrawal-check-on.svg")) return "CheckOn";
        if (name.endsWith("icon-withdrawal-check-off.svg")) return "CheckOff";
        if (name === "./AccountWithdrawalSurvey")
          return { AccountWithdrawalSurvey: "AccountWithdrawalSurvey" };
        if (name === "./components/LogoutModal") return { LogoutModal: "LogoutModal" };
        if (name === "./components/MyMenuList") return { MyMenuList: "MyMenuList" };
        if (name === "./components/AccountWithdrawalModal")
          return { AccountWithdrawalModal: "AccountWithdrawalModal" };
        if (name === "@/assets/images/my")
          return {
            ImageSupportApp: "ImageSupportApp",
            IconMyChevron: "IconMyChevron",
            IconWithdrawalClose: "IconWithdrawalClose",
          };
        if (name === "./constants/supportChannel") return { SUPPORT_CHANNEL_URL: CHANNEL_URL };
        return require(name);
      },
    },
  );
  return {
    Screen: (props) => {
      cursor = 0;
      refCursor = 0;
      return screen.exports[path.basename(screenName)](props);
    },
    toasts,
    routes,
    opened,
    copied,
    failLink: () => {
      hasLinkFailure = true;
    },
    setCopyResult: (value) => {
      copyResult = value;
    },
  };
}

function descendants(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

test("MY는 활동을 프로필의 2depth로 옮기고 CSV를 고객지원에 배치한다", () => {
  const context = setup("MyScreen");
  const nodes = descendants(context.Screen());
  const sections = nodes.filter((node) => node.props.rows && node.props.title);
  assert.deepEqual(
    sections.map((node) => node.props.title),
    ["프로필", "고객지원", "설정"],
  );
  const profile = nodes.find((node) => node.props.title === "프로필");
  assert.deepEqual(
    Array.from(profile.props.rows, (row) => row.label),
    ["프로필 수정", "내 활동"],
  );
  profile.props.rows[1].onPress();
  assert.equal(context.routes[0], "/my-activity");
  const support = nodes.find((node) => node.props.title === "고객지원");
  const csv = support.props.rows.find((row) => row.label === "CSV 파일로 위시 아이템 불러오기");
  csv.onPress();
  assert.equal(context.routes[1], "/csv-import");
});

test("내 활동은 쓴 글과 좋아요한 글만 표시하고 쓴 글 목록으로 이동한다", () => {
  const context = setup("MyActivityScreen");
  const nodes = descendants(context.Screen());
  assert.equal(nodes.find((node) => node.type === "AppBar").props.title, "내 활동");
  const rows = nodes.find((node) => node.type === "MyMenuList").props.rows;
  assert.deepEqual(
    Array.from(rows, (row) => row.label),
    ["내가 쓴 글", "내가 좋아요한 글"],
  );
  rows[0].onPress();
  assert.equal(context.routes[0], "/my-posts");
  rows[1].onPress();
  assert.deepEqual(context.toasts, ["좋아요한 글 목록은 준비 중입니다."]);
});

test("MY 문의는 채널로 바로 이동하고 실패할 때만 고객지원 화면을 표시한다", async () => {
  const context = setup("MyScreen");
  const section = descendants(context.Screen()).find((node) => node.props.title === "고객지원");
  const contact = section.props.rows.find((row) => row.label === "1:1 문의");
  await contact.onPress();
  assert.deepEqual(context.opened, [CHANNEL_URL]);
  assert.deepEqual(context.routes, []);
  context.failLink();
  await contact.onPress();
  assert.deepEqual(context.routes, ["/customer-support"]);
  section.props.rows.find((row) => row.label === "이용약관").onPress();
  assert.equal(context.routes[1], "/terms");
});

test("로그아웃 확인 창을 열고 취소하며, 콜백 성공 때만 닫고 실패 시 유지한다", async () => {
  for (const hasFailure of [false, true]) {
    const context = setup("MyScreen");
    let calls = 0;
    const props = {
      onLogout: async () => {
        calls++;
        if (hasFailure) throw new Error("logout failure");
      },
    };
    const nodes = () => descendants(context.Screen(props));
    const modal = () => nodes().find((node) => node.type === "LogoutModal").props;
    const open = () =>
      nodes()
        .find((node) => node.props.title === "설정")
        .props.rows.find((row) => row.label === "로그아웃")
        .onPress();
    open();
    assert.equal(modal().isVisible, true);
    modal().onClose();
    assert.equal(modal().isVisible, false);
    open();
    await modal().onConfirm();
    assert.equal(calls, 1);
    assert.equal(modal().isVisible, hasFailure);
    assert.equal(modal().isLoggingOut, false);
    assert.equal(
      modal().toastMessage,
      hasFailure ? "로그아웃하지 못했습니다. 다시 시도해 주세요." : undefined,
    );
    assert.deepEqual(context.toasts, []);
  }
});

test("로그아웃 미연결은 성공을 가장하지 않고, 진행 중 연타·닫기를 막는다", async () => {
  const context = setup("MyScreen");
  const modal = (props) =>
    descendants(context.Screen(props)).find((node) => node.type === "LogoutModal").props;
  await modal().onConfirm();
  assert.equal(modal().toastMessage, "로그아웃 기능은 준비 중입니다.");
  assert.deepEqual(context.toasts, []);
  let finish,
    calls = 0;
  const props = {
    onLogout: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  descendants(context.Screen(props))
    .find((node) => node.props.title === "설정")
    .props.rows.find((row) => row.label === "로그아웃")
    .onPress();
  const pending = modal(props).onConfirm();
  assert.equal(modal(props).isLoggingOut, true);
  await modal(props).onConfirm();
  modal(props).onClose();
  assert.equal(calls, 1);
  assert.equal(modal(props).isVisible, true);
  finish();
  await pending;
  assert.equal(modal(props).isVisible, false);
});

test("로그아웃 모달은 Figma 문구·36% scrim·48px 제목과 버튼을 재사용한다", () => {
  const { Screen } = setup("components/LogoutModal");
  const tree = Screen({
    isVisible: true,
    isLoggingOut: false,
    onClose: () => {},
    onConfirm: () => {},
  });
  assert.equal(tree.type, "Modal");
  assert.equal(tree.props.scrimOpacity, 0.36);
  const nodes = descendants(tree);
  assert.ok(nodes.some((node) => node.props.children === "로그아웃하시겠습니까?"));
  assert.ok(nodes.some((node) => node.props.children === "저장된 정보는 안전하게 보관됩니다."));
  assert.ok(nodes.some((node) => node.props.className === "h-12 justify-center"));
  assert.deepEqual(
    nodes.filter((node) => node.type === "Button").map((node) => node.props.children),
    ["취소", "로그아웃"],
  );
});

test("고객지원은 원본 로고와 URL을 표시하고 복사·이동 실패를 처리한다", async () => {
  const context = setup("CustomerSupportScreen");
  const nodes = descendants(context.Screen());
  assert.ok(
    nodes.some((node) => node.type === "ImageSupportApp" && node.props.width === undefined),
  );
  assert.ok(nodes.some((node) => node.props.children === CHANNEL_URL));
  const copy = nodes.find((node) => node.props.accessibilityLabel === "고객지원 링크 복사");
  await copy.props.onPress();
  assert.deepEqual(context.copied, [CHANNEL_URL]);
  assert.equal(context.toasts.pop(), "링크를 복사했습니다.");
  for (const failure of [false, new Error("clipboard failure")]) {
    context.setCopyResult(failure);
    await copy.props.onPress();
    assert.equal(context.toasts.pop(), "링크를 복사하지 못했습니다. 다시 시도해 주세요.");
  }
  context.failLink();
  await nodes.find((node) => node.props.accessibilityRole === "link").props.onPress();
  assert.equal(context.toasts.pop(), "카카오 채널로 이동하지 못했습니다. 링크를 복사해 주세요.");
});

test("약관 목록은 48px 행·safe area를 적용하고 문서 종류를 사용처에 전달한다", () => {
  const context = setup("TermsScreen");
  const selected = [];
  const nodes = descendants(context.Screen({ onPressDocument: (key) => selected.push(key) }));
  const rows = nodes.filter((node) => node.type === "Pressable");
  assert.deepEqual(
    rows.map((node) => node.props.accessibilityLabel),
    ["이용약관", "개인정보 처리방침", "오픈소스 라이센스"],
  );
  assert.ok(rows.every((row) => row.props.className.includes("h-12")));
  assert.equal(
    nodes.find((node) => node.type === "ScrollView").props.contentContainerStyle.paddingBottom,
    58,
  );
  rows.forEach((row) => row.props.onPress());
  assert.deepEqual(selected, ["terms", "privacy", "licenses"]);
  descendants(context.Screen())
    .find((node) => node.type === "Pressable")
    .props.onPress();
  assert.deepEqual(context.toasts, ["약관 본문은 준비 중입니다."]);
});

test("MY 회원탈퇴 메뉴가 확인 창을 열고 취소하며 콜백을 전달한다", () => {
  const { Screen } = setup("MyScreen");
  const onWithdraw = async () => {};
  const nodes = () => descendants(Screen({ onWithdraw }));
  const modal = () => nodes().find((node) => node.type === "AccountWithdrawalModal")?.props;
  nodes()
    .find((node) => node.props.title === "설정")
    .props.rows.find((row) => row.label === "회원 탈퇴")
    .onPress();
  assert.equal(modal().isVisible, true);
  assert.equal(modal().onWithdraw, onWithdraw);
  modal().onClose();
  assert.equal(modal(), undefined);
});

test("탈퇴 확인 → 설문 제출 성공 후에만 완료를 표시하고 실패 시 설문을 유지한다", async () => {
  for (const hasFailure of [false, true]) {
    const { Screen, toasts } = setup("components/AccountWithdrawalModal");
    let calls = 0,
      closes = 0;
    const props = {
      isVisible: true,
      onClose: () => closes++,
      onWithdraw: async () => {
        calls++;
        if (hasFailure) throw new Error("withdrawal failure");
      },
    };
    const tree = () => Screen(props);
    const buttons = () => descendants(tree()).filter((node) => node.type === "Button");
    assert.deepEqual(
      buttons().map((node) => node.props.children),
      ["취소", "탈퇴하기"],
    );
    assert.equal(buttons()[1].props.variant, "secondary");
    buttons()[1].props.onPress();
    assert.equal(calls, 0);
    assert.equal(tree().type, "AccountWithdrawalSurvey");
    await tree().props.onSubmit({ reasons: ["자주 사용하지 않아요."], detail: "" });
    assert.equal(calls, 1);
    assert.equal(closes, 0);
    if (hasFailure) {
      assert.equal(tree().type, "AccountWithdrawalSurvey");
      assert.equal(
        tree().props.toastMessage,
        "회원탈퇴를 완료하지 못했습니다. 다시 시도해 주세요.",
      );
      assert.deepEqual(toasts, []);
      continue;
    }
    assert.equal(tree().props.backdropClassName, "bg-gray-0");
    assert.ok(
      descendants(tree()).some((node) => node.props.children === "회원 탈퇴가 완료되었습니다."),
    );
    assert.ok(
      descendants(tree()).some(
        (node) => node.type === "IconWithdrawalClose" && node.props.width === undefined,
      ),
    );
    assert.equal(buttons()[0].props.children, "확인");
    await buttons()[0].props.onPress();
    assert.equal(calls, 1, "완료 확인은 탈퇴 요청을 반복하지 않는다.");
    assert.equal(closes, 1);
    assert.deepEqual(toasts, []);
  }
});

test("미연결 탈퇴는 성공 처리하지 않고, 설문 취소·요청 연타·닫기를 안전하게 처리한다", async () => {
  const { Screen, toasts } = setup("components/AccountWithdrawalModal");
  let calls = 0,
    closes = 0,
    finish;
  const props = { isVisible: true, onClose: () => closes++ };
  const tree = () => Screen(props);
  const buttons = () => descendants(tree()).filter((node) => node.type === "Button");
  buttons()[1].props.onPress();
  const survey = { reasons: ["자주 사용하지 않아요."], detail: "" };
  await tree().props.onSubmit(survey);
  assert.equal(tree().props.toastMessage, "회원탈퇴 기능은 준비 중입니다.");
  assert.deepEqual(toasts, []);
  assert.equal(tree().type, "AccountWithdrawalSurvey");
  props.onWithdraw = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  tree().props.onClose();
  assert.equal(closes, 1);
  assert.equal(calls, 0);
  buttons()[1].props.onPress();
  const pending = tree().props.onSubmit(survey);
  assert.equal(tree().props.isSubmitting, true);
  tree().props.onClose();
  await tree().props.onSubmit(survey);
  assert.equal(closes, 1);
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.equal(closes, 1);
  descendants(tree())
    .find((node) => node.props.accessibilityLabel === "회원탈퇴 완료 창 닫기")
    .props.onPress();
  assert.equal(closes, 2);
});

test("탈퇴 설문은 복수 선택·해제, 직접 작성 30자 제한, 빈 입력 방지와 payload를 처리한다", () => {
  const { Screen } = setup("components/AccountWithdrawalSurvey");
  const submitted = [];
  const props = { isSubmitting: false, onClose() {}, onSubmit: (value) => submitted.push(value) };
  const tree = () => Screen(props);
  const nodes = () => descendants(tree());
  const row = (label) => nodes().find((node) => node.props.accessibilityLabel === label);
  const submit = () => nodes().filter((node) => node.type === "Button")[1];
  assert.equal(submit().props.isDisabled, true);
  row("자주 사용하지 않아요.").props.onPress();
  row("원하는 기능이 없어요.").props.onPress();
  assert.equal(row("자주 사용하지 않아요.").props.accessibilityState.checked, true);
  assert.equal(row("원하는 기능이 없어요.").props.accessibilityState.checked, true);
  submit().props.onPress();
  assert.deepEqual(Array.from(submitted[0].reasons), [
    "자주 사용하지 않아요.",
    "원하는 기능이 없어요.",
  ]);
  row("자주 사용하지 않아요.").props.onPress();
  assert.equal(row("자주 사용하지 않아요.").props.accessibilityState.checked, false);
  row("직접 작성").props.onPress();
  assert.equal(
    submit().props.isDisabled,
    false,
    "기본 사유가 있으면 직접 작성이 비어 있어도 제출할 수 있다.",
  );
  row("원하는 기능이 없어요.").props.onPress();
  assert.equal(submit().props.isDisabled, true);
  const input = () => row("탈퇴 이유 직접 작성");
  input().props.onChangeText("   ");
  assert.equal(submit().props.isDisabled, true);
  input().props.onChangeText("😀".repeat(31));
  assert.equal(input().props.value, "😀".repeat(30));
  submit().props.onPress();
  assert.equal(submitted[1].detail, "😀".repeat(30));
  row("원하는 기능이 없어요.").props.onPress();
  row("직접 작성").props.onPress();
  assert.equal(input(), undefined);
  submit().props.onPress();
  assert.equal(submitted[2].detail, "", "선택 해제한 직접 작성 문구는 제출하지 않는다.");
  props.isSubmitting = true;
  assert.equal(submit().props.isDisabled, true);
  assert.ok(
    nodes()
      .filter((node) => node.props.accessibilityRole === "checkbox")
      .every((node) => node.props.disabled),
  );
});
