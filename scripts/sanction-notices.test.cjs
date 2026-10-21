/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(relative, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, "..", relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => mocks[name] ?? require(name),
  });
  return module.exports;
}
const messages = load("src/screens/diggle/utils/sanctionMessages.ts");

test("제한 종료 시각은 기기 현지 날짜로 표시하며 잘못된 날짜를 노출하지 않는다", () => {
  // UTC가 아닌 지역에서도 현지 자정 경계가 보존된다.
  const localMidnight = new Date(2026, 9, 23, 0, 1).toISOString();
  assert.equal(messages.formatRestrictionDate(localMidnight), "2026.10.23");
  assert.equal(
    messages.restrictionToastMessage(localMidnight),
    "2026.10.23까지 참여할 수 없습니다.",
  );
  assert.equal(messages.formatRestrictionDate("invalid"), null);
  assert.equal(
    messages.restrictionToastMessage("invalid"),
    "이용 제한 기간 동안 참여할 수 없습니다.",
  );
});

function dialogHarness() {
  let error = "";
  let openCount = 0;
  let rejectOpen;
  const { SanctionNoticeModal } = load("src/screens/diggle/components/SanctionNoticeModal.tsx", {
    "react": {
      ...React,
      useState: () => [error, (value) => (error = value)],
      useRef: () => ({ current: false }),
      useCallback: (callback) => callback,
    },
    "react-native": {
      Text: "Text",
      View: "View",
      Linking: {
        openURL: (url) => {
          assert.equal(url, "https://support.example.test");
          openCount += 1;
          return new Promise((_, reject) => (rejectOpen = reject));
        },
      },
    },
    "@/components/modal/Modal": { Modal: "Modal" },
    "@/components/modal/ModalButton": { ModalButton: "ModalButton" },
    "@/screens/my/constants/supportChannel": {
      SUPPORT_CHANNEL_URL: "https://support.example.test",
    },
    "../utils/sanctionMessages": messages,
  });
  return {
    render: (notice, onConfirm = () => {}) =>
      SanctionNoticeModal({ visible: true, notice, onConfirm }),
    get openCount() {
      return openCount;
    },
    fail: () => rejectOpen(new Error("network")),
  };
}
function nodes(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}

test("경고는 확인만 제공하고 제한 안내는 실제 사유와 문의·확인을 제공한다", () => {
  const harness = dialogHarness();
  let confirmed = 0;
  for (const notice of [
    { type: "warning" },
    {
      type: "community_restricted",
      restrictedUntil: new Date(2026, 9, 23).toISOString(),
      reasonLabel: "스팸",
    },
    { type: "suspended", reasonLabel: "부적절한 콘텐츠" },
  ]) {
    const tree = harness.render(notice, () => (confirmed += 1));
    const content = nodes(tree);
    const buttons = content.filter((node) => node.type === "ModalButton");
    assert.deepEqual(
      buttons.map((node) => node.props.action.label),
      notice.type === "warning" ? ["확인"] : ["1:1 문의", "확인"],
    );
    if (notice.reasonLabel)
      assert.ok(content.some((node) => node.props.children === notice.reasonLabel));
    assert.equal(tree.props.scrimOpacity, 0.36);
    tree.props.onRequestClose();
    assert.equal(
      confirmed,
      notice.type === "warning" ? 0 : notice.type === "community_restricted" ? 1 : 2,
    );
    buttons.at(-1).props.action.onPress();
  }
  assert.equal(confirmed, 3);
});

test("문의 연타는 한 번만 열고 실패해도 안내를 유지하며 재시도할 수 있다", async () => {
  const harness = dialogHarness();
  const notice = { type: "suspended", reasonLabel: "스팸" };
  const tree = harness.render(notice);
  const contact = nodes(tree).find((node) => node.type === "ModalButton").props.action.onPress;
  contact();
  contact();
  assert.equal(harness.openCount, 1);
  harness.fail();
  await new Promise(setImmediate);
  const failed = harness.render(notice);
  assert.equal(failed.props.visible, true);
  assert.match(failed.props.toastMessage, /다시 시도/);
  contact();
  assert.equal(harness.openCount, 2);
  harness.fail();
  await new Promise(setImmediate);
});

test("참여 제한 Toast는 Figma 알림 아이콘과 흰색 문구를 사용한다", () => {
  const { ToastText } = load("src/components/ToastText.tsx", {
    "react-native": { Text: "Text", View: "View" },
    "@/assets/images/toast": {
      IconToastError: "Error",
      IconToastSuccess: "Success",
      IconToastNotice: "Notice",
    },
    "@/theme": {
      colors: {
        gray: { 0: "#FFFFFF", 200: "#ECECEC", 700: "#5D5D5D", 800: "#3F3F3F" },
        semantic: {},
      },
    },
  });
  const tree = nodes(
    ToastText({ message: "2026.10.23까지 참여할 수 없습니다.", variant: "notice" }),
  );
  assert.equal(tree.find((node) => node.type === "Notice").props.fill, "#FFFFFF");
  assert.match(tree.find((node) => node.type === "Text").props.className, /text-gray-0/);
});
