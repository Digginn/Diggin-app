/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

async function render(progress, isReducedMotion = false) {
  let effect;
  let starts = 0;
  let stops = 0;
  let removed = false;
  let animatedWidth;
  let cleanup;
  const timings = [];
  const assigned = [];
  const native = {
    Text: "Text",
    View: "View",
    Animated: {
      View: "AnimatedView",
      Value: class {
        constructor(value) {
          this.value = value;
        }
        setValue(value) {
          this.value = value;
          assigned.push(value);
        }
      },
      timing: (_, options) => {
        const animation = {
          ...options,
          started: false,
          stopped: false,
          start() {
            this.started = true;
          },
          stop() {
            this.stopped = true;
          },
        };
        timings.push(animation);
        return animation;
      },
      delay: (duration) => ({ duration }),
      sequence: (steps) => steps,
      loop: () => ({
        start: () => {
          starts++;
        },
        stop: () => {
          stops++;
        },
      }),
    },
    Easing: { bezier: () => () => {} },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => isReducedMotion,
      addEventListener: () => ({
        remove: () => {
          removed = true;
        },
      }),
    },
  };
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.join(__dirname, "../src/screens/my/components/CsvImportLoading.tsx"),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        name === "react-native"
          ? native
          : name === "react"
            ? {
                useState: (initial) => [(animatedWidth ??= initial()), () => {}],
                useEffect: (callback) => {
                  effect = callback;
                },
              }
            : require(name),
    },
  );
  const walk = (node) =>
    React.isValidElement(node)
      ? [node, ...React.Children.toArray(node.props.children).flatMap(walk)]
      : [];
  async function draw(nextProgress) {
    cleanup?.();
    const tree = module.exports.CsvImportLoading({ progress: nextProgress });
    cleanup = effect();
    await Promise.resolve();
    const nodes = walk(tree);
    return {
      starts: () => starts,
      stops: () => stops,
      removed: () => removed,
      cleanup: () => cleanup?.(),
      update: draw,
      timings,
      assigned,
      bar: nodes.find((node) => node.props.accessibilityRole === "progressbar"),
      fill: nodes.find((node) => node.type === "AnimatedView"),
      label: nodes.filter((node) => node.type === "Text").at(-1).props.children,
    };
  }
  return draw(progress);
}

test("전체 건수를 확인하면 0건부터 실제 진행률로 표시하고 반복 애니메이션을 멈춘다", async () => {
  const ui = await render({ completed: 0, total: 100 });
  assert.equal(ui.starts(), 0);
  assert.equal(ui.label, "0 / 100");
  assert.equal(ui.bar.props.accessibilityState.busy, true);
  assert.equal(ui.bar.props.accessibilityValue.now, 0);
  assert.equal(ui.fill.props.style.width.value, 0);
});

test("실제 진행 건수와 완료 상태는 서버에서 받은 값으로만 표시한다", async () => {
  for (const [completed, expectedWidth] of [
    [12, 50],
    [48, 200],
  ]) {
    const ui = await render({ completed, total: 48 });
    assert.equal(ui.starts(), 0);
    assert.equal(ui.fill.props.style.width.value, expectedWidth);
    assert.equal(ui.bar.props.accessibilityValue.now, completed);
    assert.equal(ui.label, `${completed} / 48`);
  }
});

test("진행률 연속 수신은 현재 위치에서 새 목표까지만 보간하고 재시도·완료는 즉시 반영한다", async () => {
  const initial = await render({ completed: 0, total: 100 });
  const first = await initial.update({ completed: 25, total: 100 });
  const firstMotion = first.timings.at(-1);
  assert.equal(firstMotion.toValue, 50);
  assert.equal(firstMotion.duration, 180);
  assert.equal(firstMotion.started, true);
  // 애니메이션 중간에 다음 진행률이 들어와도 0이나 이전 목표로 돌아가지 않는다.
  first.fill.props.style.width.value = 30;
  const next = await first.update({ completed: 50, total: 100 });
  assert.equal(firstMotion.stopped, true);
  assert.equal(next.fill.props.style.width.value, 30);
  assert.equal(next.timings.at(-1).toValue, 100);
  assert.equal(next.label, "50 / 100");
  const reset = await next.update({ completed: 0, total: 100 });
  assert.equal(reset.fill.props.style.width.value, 0);
  const done = await reset.update({ completed: 100, total: 100 });
  assert.equal(done.fill.props.style.width.value, 200);
  assert.equal(done.bar.props.accessibilityState.busy, false);
  assert.equal(done.timings.length, 2);
  done.cleanup();
  assert.equal(done.removed(), true);
});

test("모션 줄이기 설정에서는 중간 진행률도 애니메이션 없이 즉시 반영한다", async () => {
  const ui = await render({ completed: 0, total: 100 }, true);
  const updated = await ui.update({ completed: 60, total: 100 });
  assert.equal(updated.fill.props.style.width.value, 120);
  assert.equal(updated.timings.length, 0);
  assert.equal(updated.label, "60 / 100");
  updated.cleanup();
});

test("파일 확인 단계는 바를 미리 채우지 않고 실제 저장 진행률로 이어진다", async () => {
  for (const isReducedMotion of [false, true]) {
    const unknown = await render(undefined, isReducedMotion);
    assert.equal(unknown.starts(), 0);
    assert.equal(unknown.timings.length, 0);
    assert.equal(unknown.label, "파일 확인 중");
    assert.equal(unknown.bar.props.accessibilityValue.text, "파일 확인 중");
    assert.equal(unknown.fill.props.style.width.value, 0);
    const initial = await unknown.update({ completed: 0, total: 4110 });
    assert.equal(initial.fill.props.style.width, unknown.fill.props.style.width);
    assert.equal(initial.fill.props.style.width.value, 0);
    assert.equal(initial.label, "0 / 4110");
    const done = await initial.update({ completed: 4110, total: 4110 });
    assert.equal(done.fill.props.style.width.value, 200);
    assert.equal(done.bar.props.accessibilityState.busy, false);
    done.cleanup();
  }
});
