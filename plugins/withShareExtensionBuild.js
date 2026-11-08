const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const EXTENSION_COMMAND =
  /(target '\w+ShareExtension' do[\s\S]*?config_command = \[)\s*'npx',\s*'expo-modules-autolinking',\s*'react-native-config',\s*'--json',\s*'--platform',\s*'ios'\s*(\])/;

/**
 * expo-share-extension(#91)을 SDK 57에서 빌드되게 맞춘다.
 * - 확장 타깃은 걸러 낸 네이티브 모듈 목록(plugins/share-extension-autolinking.js)으로 링크한다.
 * - 확장 최소 iOS 버전이 15.1로 고정돼 있어, Expo 모듈이 요구하는 본 앱 값으로 올린다.
 * - 확장이 일반 RCTReactNativeFactory로 떠서 Expo 모듈이 준비되지 않는다. 본 앱처럼 ExpoReactNativeFactory로 띄운다.
 * 같은 종류의 수정은 나중에 등록한 플러그인부터 실행돼서 app.json에서 expo-share-extension 앞에 둔다.
 */
const FACTORY_REPLACEMENTS = [
  ["import React_RCTAppDelegate\n", "import React_RCTAppDelegate\ninternal import Expo\n"],
  [
    "class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {",
    "class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {",
  ],
  [
    "reactNativeFactory = RCTReactNativeFactory(delegate: reactNativeFactoryDelegate!)",
    "reactNativeFactory = ExpoReactNativeFactory(delegate: reactNativeFactoryDelegate!)",
  ],
];

function useExpoFactory(controllerPath) {
  let source = fs.readFileSync(controllerPath, "utf8");
  for (const [from, to] of FACTORY_REPLACEMENTS) {
    if (!source.includes(from)) {
      throw new Error(
        `공유 확장 코드에서 "${from.trim()}"을 찾지 못했습니다. expo-share-extension 버전을 확인하세요.`,
      );
    }
    source = source.replace(from, to);
  }
  fs.writeFileSync(controllerPath, source);
}

module.exports = function withShareExtensionBuild(config) {
  config = withXcodeProject(config, (config) => {
    const buildConfigs = Object.values(config.modResults.pbxXCBuildConfigurationSection()).filter(
      (entry) => entry.buildSettings,
    );
    const isExtension = (entry) =>
      String(entry.buildSettings.INFOPLIST_FILE ?? "").includes("ShareExtension");
    const appTarget = buildConfigs.find(
      (entry) => !isExtension(entry) && entry.buildSettings.INFOPLIST_FILE,
    )?.buildSettings.IPHONEOS_DEPLOYMENT_TARGET;
    const extensions = buildConfigs.filter(isExtension);
    if (!appTarget || extensions.length === 0) {
      throw new Error(
        "공유 확장 Xcode 타깃을 찾지 못했습니다. app.json에서 이 플러그인을 expo-share-extension 바로 앞에 두세요.",
      );
    }
    for (const entry of extensions) entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = appTarget;
    const extensionFolder = String(extensions[0].buildSettings.INFOPLIST_FILE).split("/")[0];
    useExpoFactory(
      path.join(
        config.modRequest.platformProjectRoot,
        extensionFolder,
        "ShareExtensionViewController.swift",
      ),
    );
    return config;
  });
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      const podfile = fs.readFileSync(podfilePath, "utf8");
      if (!EXTENSION_COMMAND.test(podfile)) {
        throw new Error(
          "공유 확장 Podfile 타깃을 찾지 못했습니다. app.json에서 이 플러그인을 expo-share-extension 바로 앞에 두세요.",
        );
      }
      fs.writeFileSync(
        podfilePath,
        podfile.replace(
          EXTENSION_COMMAND,
          "$1'node', File.join(__dir__, '../plugins/share-extension-autolinking.js')$2",
        ),
      );
      return config;
    },
  ]);
};
