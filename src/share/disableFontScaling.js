// 공유 확장에서는 글자 크기 배율이 켜져 있으면 Pretendard 글자가 그려지지 않는다(expo-share-extension 안내, #91).
// 각 컴포넌트 모듈은 읽기 전용으로 내보내져 바꿀 수 없어서, 앱 코드가 쓰는 react-native 입구의 getter를 다시 정의한다.
const { createElement, forwardRef } = require("react");
const ReactNative = require("react-native");

function withoutFontScaling(name) {
  const Original = ReactNative[name];
  const Wrapped = forwardRef((props, ref) =>
    createElement(Original, { ...props, ref, allowFontScaling: false }),
  );
  // TextInput.State 같은 정적 값만 옮긴다. forwardRef 내부 값(render, $$typeof)을 덮으면 감싼 효과가 사라진다.
  for (const key of Object.keys(Original)) {
    if (key !== "render" && key !== "$$typeof") Wrapped[key] = Original[key];
  }
  Wrapped.displayName = Original.displayName ?? name;
  Object.defineProperty(ReactNative, name, {
    configurable: true,
    enumerable: true,
    get: () => Wrapped,
  });
}

withoutFontScaling("Text");
withoutFontScaling("TextInput");
