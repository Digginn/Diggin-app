/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

async function setup({ isEnabled = true, isReducedMotion = false, appState = "active" } = {}) {
  const loops = [];
  const subscriptions = [];
  const effects = [];
  const native = {
    Animated: {
      Value: class {
        constructor(value) {
          this.value = value;
        }
        setValue(value) {
          this.value = value;
        }
        interpolate(options) {
          return options;
        }
      },
      timing: (value, options) => ({ value, ...options }),
      delay: (duration) => ({ duration, isDelay: true }),
      sequence: (steps) => steps,
      loop: (steps) => {
        const loop = {
          steps,
          starts: 0,
          stops: 0,
          start() {
            this.starts++;
          },
          stop() {
            this.stops++;
          },
        };
        loops.push(loop);
        return loop;
      },
    },
    Easing: { bezier: (...args) => args },
    AccessibilityInfo: { isReduceMotionEnabled: async () => isReducedMotion },
    AppState: { currentState: appState },
  };
  const addEventListener = (event, listener) => {
    const subscription = {
      event,
      listener,
      isRemoved: false,
      remove() {
        this.isRemoved = true;
      },
    };
    subscriptions.push(subscription);
    return subscription;
  };
  native.AccessibilityInfo.addEventListener = addEventListener;
  native.AppState.addEventListener = addEventListener;
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.join(__dirname, "../src/screens/my/hooks/useCsvIllustrationMotion.ts"),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        name === "react-native"
          ? native
          : {
              useState: (initialize) => [initialize()],
              useEffect: (effect) => effects.push(effect),
            },
    },
  );
  const motion = module.exports.useCsvIllustrationMotion(isEnabled);
  const cleanup = effects[0]();
  await Promise.resolve();
  return { motion, loops, subscriptions, native, cleanup };
}

test("Figma의 5단계 대기/전환 시간과 네이티브 드라이버를 유지한다", async () => {
  const { loops, cleanup } = await setup();
  assert.equal(loops[0].starts, 1);
  assert.deepEqual(
    Array.from(loops[0].steps, (step) => step.duration),
    [0, 800, 550, 1, 300, 1, 350, 500, 0, 1, 600],
  );
  const moves = loops[0].steps.filter((step) => !step.isDelay);
  assert.deepEqual(
    Array.from(moves, (step) => step.toValue),
    [0, 1, 2, 3, 4, 5],
  );
  assert.ok(moves.every((step) => step.useNativeDriver && !step.isInteraction));
  assert.deepEqual(Array.from(moves[1].easing), [0.42, 0, 1, 1]);
  assert.deepEqual(Array.from(moves[3].easing), [0, 0, 0.58, 1]);
  cleanup();
});

test("상품은 폴더에서 사라진 뒤 원래 위치와 크기로 반복된다", async () => {
  const { motion, cleanup } = await setup();
  for (let index = 0; index < 5; index++) {
    const style = motion.productStyle(index);
    assert.deepEqual(Array.from(style.opacity.outputRange), [1, 1, 0, 0, 0, 1]);
    const scales = style.transform[3].scale.outputRange;
    assert.equal(scales[0], 1);
    assert.ok(scales[2] < 0.32);
    assert.equal(scales[5], 1);
    assert.equal(style.transform[0].translateX.outputRange[5], 0);
    assert.equal(style.transform[1].translateY.outputRange[5], 0);
  }
  assert.deepEqual(
    Array.from(motion.folderStyle.transform[1].scale.outputRange),
    [1, 1, 1.06, 0.97, 1, 1],
  );
  assert.deepEqual(Array.from(motion.beamStyle.opacity.outputRange), [0.5, 0.7, 1, 0.4, 0.4, 0.5]);
  cleanup();
});

test("결과 화면과 동작 줄이기에서는 반복하지 않는다", async () => {
  for (const options of [{ isEnabled: false }, { isReducedMotion: true }]) {
    const { loops, cleanup } = await setup(options);
    assert.equal(loops.length, 0);
    cleanup?.();
  }
});

test("두 번째 반복도 첫 흡수 전에 Step 1에서 시작하며 이전 단계를 역주행하지 않는다", async () => {
  const { loops, cleanup } = await setup();
  const steps = loops[0].steps;
  const value = steps.find((step) => !step.isDelay).value;
  // RN sequence는 완료 시 current=0으로 돌아갑니다. loop의 reset은 첫 자식만 초기화하므로
  // 첫 자식이 delay이면 상품의 Value는 이전 반복 마지막 값(5)에 남습니다.
  for (let iteration = 0; iteration < 2; iteration++) {
    let hasStartedAbsorption = false;
    for (const step of steps) {
      if (step.isDelay) continue;
      if (!hasStartedAbsorption && step.duration > 0) {
        assert.equal(value.value, 0, `${iteration + 1}번째 흡수 시작 값`);
        hasStartedAbsorption = true;
      }
      value.setValue(step.toValue);
    }
  }
  cleanup();
});

test("백그라운드 및 동작 줄이기 변경에 정지하고 활성화 시 재시작한다", async () => {
  const { loops, subscriptions, native, cleanup } = await setup();
  const app = subscriptions.find((subscription) => subscription.event === "change");
  const motion = subscriptions.find((subscription) => subscription.event === "reduceMotionChanged");
  native.AppState.currentState = "background";
  app.listener("background");
  assert.equal(loops[0].stops, 1);
  assert.equal(loops.length, 1);
  native.AppState.currentState = "active";
  app.listener("active");
  assert.equal(loops.length, 2);
  motion.listener(true);
  assert.equal(loops[1].stops, 1);
  assert.equal(loops.length, 2);
  motion.listener(false);
  assert.equal(loops.length, 3);
  cleanup();
  assert.equal(loops[2].stops, 1);
  assert.ok(subscriptions.every((subscription) => subscription.isRemoved));
  motion.listener(false);
  assert.equal(loops.length, 3);
});
