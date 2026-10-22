// 공유 확장 타깃의 React Native 네이티브 모듈 목록에서 확장이 쓰지 않는 모듈을 뺀다.
// expo-share-extension의 excludedPackages는 Expo 모듈에만 적용돼서, 구글 로그인 Swift pod가 확장 타깃에 들어가 pod install이 실패한다(#91).
const { execFileSync } = require("node:child_process");

const appJson = require("../app.json");

const shareExtension = appJson.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-share-extension",
);
const excluded = new Set(shareExtension?.[1]?.excludedPackages ?? []);
const config = JSON.parse(
  execFileSync(
    "npx",
    ["expo-modules-autolinking", "react-native-config", "--json", "--platform", "ios"],
    { encoding: "utf8", cwd: `${__dirname}/..` },
  ),
);
for (const name of Object.keys(config.dependencies)) {
  if (excluded.has(name)) delete config.dependencies[name];
}
process.stdout.write(JSON.stringify(config));
