/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { mock, test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function loadHook(os) {
  const source = readFileSync(
    path.join(__dirname, "../src/hooks/useNativeModalVisible.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;

  // 훅 하나를 여러 컴포넌트처럼 돌리는 최소 실행기. 렌더 중 setState는 다시 렌더한다.
  let current;
  // React처럼 진행 중인 렌더가 끝난 뒤에 다시 렌더한다.
  let depth = 0;
  const queue = new Set();
  function schedule(instance) {
    if (depth > 0) queue.add(instance);
    else instance.rerender();
  }
  const react = {
    useState(initial) {
      const slot = current.cursor++;
      if (!(slot in current.state)) current.state[slot] = initial;
      const instance = current;
      return [
        instance.state[slot],
        (next) => {
          instance.state[slot] = next;
          instance.isDirty = true;
        },
      ];
    },
    useEffect(effect, deps) {
      const slot = current.cursor++;
      const prev = current.effects[slot];
      if (prev && deps.every((dep, i) => Object.is(dep, prev.deps[i]))) return;
      current.pending.push(() => {
        prev?.cleanup?.();
        current.effects[slot] = { deps, cleanup: effect() };
      });
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const slot = current.cursor++;
      if (!(slot in current.subscriptions)) {
        const instance = current;
        current.subscriptions[slot] = subscribe(() => schedule(instance));
      }
      return getSnapshot();
    },
  };
  const hookModule = { exports: {} };
  runInNewContext(compiled, {
    exports: hookModule.exports,
    module: hookModule,
    setTimeout,
    require: (name) => (name === "react" ? react : { Platform: { OS: os } }),
  });

  return function mount(visible) {
    const instance = { state: [], effects: [], subscriptions: [], props: { visible } };
    instance.rerender = () => {
      depth += 1;
      let result;
      do {
        instance.isDirty = false;
        instance.cursor = 0;
        instance.pending = [];
        current = instance;
        result = hookModule.exports.useNativeModalVisible(instance.props.visible);
      } while (instance.isDirty);
      for (const run of instance.pending) {
        current = instance;
        run();
      }
      instance.value = result;
      depth -= 1;
      if (depth === 0) {
        for (const next of queue) {
          queue.delete(next);
          next.rerender();
        }
      }
    };
    instance.setVisible = (next) => {
      instance.props.visible = next;
      instance.rerender();
    };
    instance.unmount = () => {
      depth += 1;
      instance.effects.forEach((effect) => effect?.cleanup?.());
      instance.effects = [];
      depth -= 1;
      for (const next of queue) {
        queue.delete(next);
        if (next !== instance) next.rerender();
      }
    };
    instance.rerender();
    return instance;
  };
}

test("iOS는 다른 모달이 닫히는 동안 새 모달을 미뤘다가 닫힘이 끝나면 띄운다", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const mount = loadHook("ios");
    const loading = mount(true);
    assert.equal(loading.value, true, "닫히는 모달이 없으면 바로 띄운다");

    const guide = mount(false);
    loading.unmount();
    guide.setVisible(true);
    assert.equal(guide.value, false, "다른 모달이 닫히는 중이면 미룬다");

    mock.timers.tick(399);
    guide.rerender();
    assert.equal(guide.value, false);
    mock.timers.tick(1);
    assert.equal(guide.value, true, "닫힘이 끝나면 띄운다");

    const expired = mount(true);
    guide.setVisible(false);
    assert.equal(expired.value, true, "이미 떠 있는 모달은 다른 모달이 닫혀도 유지한다");
    assert.equal(guide.value, false);
  } finally {
    mock.timers.reset();
  }
});

test("안드로이드는 다른 모달이 닫히는 중에도 바로 띄운다", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const mount = loadHook("android");
    const loading = mount(true);
    const guide = mount(false);
    loading.unmount();
    guide.setVisible(true);
    assert.equal(guide.value, true);
  } finally {
    mock.timers.reset();
  }
});
