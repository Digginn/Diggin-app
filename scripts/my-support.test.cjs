/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const CHANNEL_URL = "http://pf.kakao.com/_zIxnrX";

function loadLoginIntent() {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "../src/lib/loginIntent.ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports },
  );
  return module.exports;
}
const loginIntent = loadLoginIntent();

function setup(
  screenName,
  application = { nativeApplicationVersion: "1.0.0", nativeBuildVersion: "5" },
) {
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
      require: function mockedRequire(name) {
        if (name === "expo-application") return application;
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
            FlatList: "FlatList",
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
        if (name === "expo-linear-gradient") return { LinearGradient: "LinearGradient" };
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
          return {
            useIsFocused: () => true,
            useRouter: () => ({ push: (route) => routes.push(route) }),
          };
        if (name === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ bottom: 34 }) };
        if (name === "@/hooks/useToast") return { useToast: () => (text) => toasts.push(text) };
        if (name === "@/contexts/AuthContext")
          return { useAuth: () => ({ session: { user: { id: "viewer" } }, isRestoring: false }) };
        if (name === "@/components/app-bar") return { AppBar: "AppBar" };
        if (name === "@/components/Button") return { Button: "Button" };
        if (name === "@/components/modal") return { Modal: "Modal", ActionModal: "ActionModal" };
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
          };
        if (name === "./constants/supportChannel") return { SUPPORT_CHANNEL_URL: CHANNEL_URL };
        if (name === "@/constants/policyDocuments.json")
          return require("../src/constants/policyDocuments.json");
        if (name === "@/components/PolicyDocumentContent") {
          const content = { exports: {} };
          runInNewContext(
            ts.transpileModule(
              readFileSync(
                path.join(__dirname, "../src/components/PolicyDocumentContent.tsx"),
                "utf8",
              ),
              { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
            ).outputText,
            { module: content, exports: content.exports, require: mockedRequire },
          );
          return content.exports;
        }
        if (name === "./constants/openSourceLicenses.json")
          return require("../src/screens/my/constants/openSourceLicenses.json");
        if (name === "@/lib/loginIntent") return loginIntent;
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

test("앱 정보는 설치된 앱의 버전·빌드 번호를 표시하고 없으면 추측하지 않는다", () => {
  for (const [version, build, expected] of [
    ["1.0.0", "5", "1.0.0(5)"],
    ["1.0.0", "3", "1.0.0(3)"],
    ["2.1.0", "42", "2.1.0(42)"],
    ["1.0.0", null, "1.0.0"],
    [null, null, "버전 정보 없음"],
  ]) {
    for (const isGuest of [false, true]) {
      const context = setup("MyScreen", {
        nativeApplicationVersion: version,
        nativeBuildVersion: build,
      });
      const support = descendants(context.Screen({ isGuest })).find(
        (node) => node.props.title === "고객지원",
      );
      const row = support.props.rows.find((row) => row.label === "앱 정보");
      assert.equal(row.value, expected);
      assert.equal(row.hasChevron, false);
    }
  }
});

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

test("비로그인 MY는 로그인과 고객지원만 제공한다", async () => {
  const context = setup("MyScreen");
  const nodes = descendants(context.Screen({ isGuest: true }));
  const sections = nodes.filter((node) => node.props.rows && node.props.title);
  assert.deepEqual(
    sections.map((node) => node.props.title),
    ["프로필", "고객지원"],
  );
  const profileRows = sections[0].props.rows;
  assert.deepEqual(
    Array.from(profileRows, (row) => row.label),
    ["로그인"],
  );
  profileRows[0].onPress();
  assert.equal(context.routes.at(-1), "/login");
  const supportRows = sections[1].props.rows;
  assert.deepEqual(
    Array.from(supportRows, (row) => row.label),
    ["1:1 문의", "약관 및 정책", "앱 정보"],
  );
  await supportRows[0].onPress();
  assert.deepEqual(context.opened, [CHANNEL_URL]);
  supportRows[1].onPress();
  assert.equal(context.routes.at(-1), "/terms");
  assert.equal(supportRows[2].hasChevron, false);
  assert.equal(
    nodes.some((node) => node.props.isVisible),
    false,
  );
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
  assert.equal(context.routes[1], "/my-liked-posts");
  assert.deepEqual(context.toasts, []);
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
  section.props.rows.find((row) => row.label === "약관 및 정책").onPress();
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

test("로그아웃 모달은 공용 ActionModal로 Figma 문구·36% scrim·로그아웃 좌측·취소 우측을 쓴다", () => {
  const { Screen } = setup("components/LogoutModal");
  const confirmed = [];
  const tree = Screen({
    isVisible: true,
    isLoggingOut: false,
    onClose: () => confirmed.push("close"),
    onConfirm: () => confirmed.push("logout"),
  });
  assert.equal(tree.type, "ActionModal");
  assert.equal(tree.props.type, "2Btn");
  assert.equal(tree.props.scrimOpacity, 0.36);
  assert.equal(tree.props.title, "로그아웃하시겠습니까?");
  assert.equal(tree.props.description, "저장된 정보는 안전하게 보관됩니다.");
  assert.equal(tree.props.secondaryAction.label, "로그아웃", "왼쪽 회색 버튼");
  assert.equal(tree.props.primaryAction.label, "취소", "오른쪽 검정 버튼");
  tree.props.secondaryAction.onPress();
  tree.props.primaryAction.onPress();
  assert.deepEqual(confirmed, ["logout", "close"]);
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
    ["이용약관", "개인정보 처리방침", "커뮤니티 이용정책", "오픈소스 라이센스"],
  );
  assert.ok(rows.every((row) => row.props.className.includes("h-12")));
  assert.equal(
    nodes.find((node) => node.type === "ScrollView").props.contentContainerStyle.paddingBottom,
    58,
  );
  rows.forEach((row) => row.props.onPress());
  assert.deepEqual(selected, ["terms", "privacy", "community", "licenses"]);
  assert.equal(nodes.find((node) => node.type === "AppBar").props.title, "약관 및 정책");
  descendants(context.Screen())
    .filter((node) => node.type === "Pressable")
    .forEach((node) => node.props.onPress());
  assert.deepEqual(context.routes, [
    "/policies/terms",
    "/policies/privacy",
    "/policies/community",
    "/policies/licenses",
  ]);
  assert.deepEqual(context.toasts, []);
});

function expand(element) {
  if (!React.isValidElement(element)) return [];
  if (typeof element.type === "function") return expand(element.type(element.props));
  return [element, ...React.Children.toArray(element.props.children).flatMap(expand)];
}

test("약관 상세는 세 문서 전체를 스크롤 영역 안에 표시한다", () => {
  const context = setup("PolicyDocumentScreen");
  for (const [document, title, lastText] of [
    ["terms", "이용약관", "고객지원: diggin.app@gmail.com"],
    ["privacy", "개인정보 처리방침", "· 개인정보 관련 문의처: diggin.app@gmail.com"],
    [
      "community",
      "커뮤니티 이용정책",
      "게시글을 등록하면 DIGGIN 커뮤니티 이용정책에 동의한 것으로 간주됩니다.",
    ],
  ]) {
    const nodes = expand(context.Screen({ document }));
    assert.equal(nodes.find((node) => node.type === "AppBar").props.title, title);
    assert.ok(nodes.some((node) => node.type === "ScrollView"));
    const textNodes = nodes.filter((node) => node.type === "Text");
    assert.ok(textNodes.at(-1).props.children.endsWith(lastText));
    assert.ok(textNodes.every((node) => node.props.selectable));
    assert.ok(textNodes.every((node) => node.props.className));
  }
});

test("MY 회원탈퇴 메뉴가 확인 창을 열고 취소하며 콜백을 전달한다", () => {
  const { Screen } = setup("MyScreen");
  const onWithdraw = async () => {};
  const onWithdrawComplete = () => {};
  const nodes = () => descendants(Screen({ onWithdraw, onWithdrawComplete }));
  const modal = () => nodes().find((node) => node.type === "AccountWithdrawalModal")?.props;
  nodes()
    .find((node) => node.props.title === "설정")
    .props.rows.find((row) => row.label === "회원 탈퇴")
    .onPress();
  assert.equal(modal().isVisible, true);
  assert.equal(modal().onWithdraw, onWithdraw);
  assert.equal(modal().onComplete, onWithdrawComplete);
  modal().onClose();
  assert.equal(modal(), undefined);
});

test("탈퇴 확인 → 설문 제출 성공 후에만 완료를 표시하고 실패 시 설문을 유지한다", async () => {
  for (const hasFailure of [false, true]) {
    const { Screen, toasts } = setup("components/AccountWithdrawalModal");
    let calls = 0,
      closes = 0,
      completes = 0;
    const props = {
      isVisible: true,
      onClose: () => closes++,
      onComplete: () => completes++,
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
      !descendants(tree()).some((node) => node.props.accessibilityRole === "button"),
      "시안처럼 완료 창에는 닫기 버튼이 없다",
    );
    assert.equal(buttons()[0].props.children, "확인");
    await buttons()[0].props.onPress();
    assert.equal(calls, 1, "완료 확인은 탈퇴 요청을 반복하지 않는다.");
    assert.equal(closes, 1);
    assert.equal(completes, 1, "확인하면 앱 처음으로 보낸다");
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
  tree().props.onRequestClose();
  assert.equal(closes, 2, "완료 창은 뒤로 가기로 닫아도 확인과 같다");
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

test("MY 정책과 작성 동의·보기는 동일한 커뮤니티 전문을 표시하고 확인·취소를 유지한다", () => {
  const policy = setup("PolicyDocumentScreen");
  const sheet = setup("../diggle/components/CommunityPolicySheet");
  const texts = (tree) =>
    expand(tree)
      .filter((node) => node.type === "Text" && node.props.selectable)
      .map((node) => node.props.children);
  const expected = texts(policy.Screen({ document: "community" }));
  assert.ok(expected.some((value) => value.includes("다중 계정")));
  for (const isRequired of [true, false]) {
    let confirmed = 0,
      closed = 0;
    const tree = sheet.Screen({
      visible: true,
      isRequired,
      isBusy: false,
      error: "",
      onConfirm: () => confirmed++,
      onClose: () => closed++,
      onErrorDismiss() {},
    });
    assert.deepEqual(texts(tree), expected);
    const buttons = expand(tree).filter((node) => node.type === "Button");
    assert.deepEqual(
      buttons.map((button) => button.props.children),
      isRequired ? ["취소", "동의하고 작성하기"] : ["확인"],
    );
    buttons.at(-1).props.onPress();
    assert.equal(confirmed, 1);
    if (isRequired) {
      buttons[0].props.onPress();
      assert.equal(closed, 1);
    }
  }
});

test("탈퇴 설문 문구를 DB 사유 값으로 보내고, 실패는 알리되 이미 지워진 계정은 성공으로 본다", async () => {
  const sent = [];
  let failure = null,
    userError = null;
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/screens/my/api/withdrawal.ts"), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name === "@/lib/supabase")
          return {
            supabase: {
              auth: { getUser: async () => ({ error: userError }) },
              functions: {
                invoke: async (fn, options) => {
                  sent.push([fn, options.body]);
                  return { error: failure };
                },
              },
            },
          };
        throw new Error(`unexpected require ${name}`);
      },
    },
  );
  const { withdrawAccount } = module.exports;
  await withdrawAccount({
    reasons: ["자주 사용하지 않아요.", "오류가 자주 생겨요.", "직접 작성"],
    detail: "그냥요",
  });
  await withdrawAccount({ reasons: ["다른 서비스를 이용해요."], detail: "" });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ["account-withdrawal", { reasons: ["rarely_used", "frequent_error"], custom_text: "그냥요" }],
    ["account-withdrawal", { reasons: ["other_service"], custom_text: null }],
  ]);
  failure = new Error("withdrawal_failed");
  await assert.rejects(withdrawAccount({ reasons: ["자주 사용하지 않아요."], detail: "" }));
  userError = { code: "user_not_found" };
  await withdrawAccount({ reasons: ["자주 사용하지 않아요."], detail: "" });
});
