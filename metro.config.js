const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// NativeWind의 rem 기본값은 14라서 Tailwind 기본 스케일이 4의 배수로 안 떨어진다 - (h-11 = 2.75rem -> 38.5px) 디자인이 px 기준이므로 16으로 맞춘다.
module.exports = withNativeWind(config, {
  input: "./src/global.css",
  inlineRem: 16,
});