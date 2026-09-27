const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// .svg 파일을 컴포넌트로 import 하기 위한 설정 : 기본적으로 svg는 이미지(asset)로 취급되는데 이를 소스 코드로 넘겨 transformer가 처리하도록 함
config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = withNativeWind(config, { input: "./src/global.css" });
