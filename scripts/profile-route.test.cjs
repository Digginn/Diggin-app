/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function setup(fetchMyProfile) {
  const module = { exports: {} },
    states = [],
    effects = [],
    toasts = [];
  let cursor = 0,
    dependencies,
    cleanup;
  const showToast = (message) => toasts.push(message);
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "../src/app/profile-edit.tsx"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      console,
      require: (name) => {
        if (name === "react")
          return {
            useState(initial) {
              const index = cursor++;
              if (!(index in states)) states[index] = initial;
              return [
                states[index],
                (value) => {
                  states[index] = typeof value === "function" ? value(states[index]) : value;
                },
              ];
            },
            useEffect(effect, next) {
              if (!dependencies || next.some((value, i) => value !== dependencies[i])) {
                effects.push(effect);
                dependencies = next;
              }
            },
          };
        if (name === "react-native") return { View: "View" };
        if (name === "@/screens/my/api/profile") return { fetchMyProfile, saveNickname() {} };
        if (name === "@/screens/my/ProfileEditScreen")
          return { ProfileEditScreen: "ProfileEditScreen" };
        if (name === "@/components/MemberOnly") return { MemberOnly: "MemberOnly" };
        if (name === "@/components/app-bar") return { AppBar: "AppBar" };
        if (name === "@/components/ErrorState") return { ErrorState: "ErrorState" };
        if (name === "@/components/Loading") return { Spinner: "Spinner" };
        if (name === "@/api/avatar") return { saveAvatar() {} };
        if (name === "@/hooks/useToast") return { useToast: () => showToast };
        if (name === "@/constants/messages")
          return { TOAST_MESSAGES: { SYS_002: "요청을 처리하지 못했습니다. 다시 시도해 주세요." } };
        return require(name);
      },
    },
  );
  const walk = (node) =>
    React.isValidElement(node)
      ? [node, ...React.Children.toArray(node.props.children).flatMap(walk)]
      : [];
  return {
    render() {
      cursor = 0;
      const content = module.exports.default().props.children;
      const nodes = walk(content.type(content.props));
      while (effects.length) {
        cleanup?.();
        cleanup = effects.shift()();
      }
      return nodes;
    },
    unmount: () => cleanup?.(),
    toasts,
  };
}

test("진입 시 폼 대신 로딩을 표시하고 실제 닉네임·가입수단을 한 번에 전달한다", async () => {
  let resolve;
  const h = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = h.render();
  assert.equal(
    pending.some((node) => node.type === "ProfileEditScreen"),
    false,
  );
  assert.equal(
    pending.some((node) => node.type === "Spinner"),
    true,
  );
  resolve({ nickname: "테스트닉네임", authProvider: "google", avatarUrl: "signed-photo" });
  await new Promise((done) => setImmediate(done));
  const screen = h.render().find((node) => node.type === "ProfileEditScreen");
  assert.equal(screen.props.currentNickname, "테스트닉네임");
  assert.equal(screen.props.authProvider, "google");
  assert.equal(screen.props.avatarUrl, "signed-photo");
  h.unmount();
});

test("조회 실패는 임시 폼을 열지 않고 토스트와 재시도를 제공한다", async () => {
  let attempts = 0;
  const h = setup(async () => {
    if (++attempts === 1) throw new Error("offline");
    return { nickname: "재시도계정", authProvider: "apple" };
  });
  h.render();
  await new Promise((done) => setImmediate(done));
  const failed = h.render();
  assert.equal(
    failed.some((node) => node.type === "ProfileEditScreen"),
    false,
  );
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0], "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  const errorState = failed.find((node) => node.type === "ErrorState");
  assert.equal(errorState.props.message, h.toasts[0]);
  assert.equal(
    failed.some((node) => node.type === "Spinner"),
    false,
  );
  errorState.props.onRetry();
  assert.equal(
    h.render().some((node) => node.type === "Spinner"),
    true,
  );
  await new Promise((done) => setImmediate(done));
  assert.equal(
    h.render().find((node) => node.type === "ProfileEditScreen").props.authProvider,
    "apple",
  );
  h.unmount();
});
