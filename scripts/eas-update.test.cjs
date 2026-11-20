/* global __dirname */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("Expo 플러그인이 iOS와 Android에 업데이트 서버·fingerprint·다음 실행 적용을 구성한다", () => {
  const root = path.join(__dirname, "..");
  const { expo } = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
  const result = spawnSync(
    process.execPath,
    [require.resolve("expo/bin/cli"), "config", "--type", "introspect", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      env: {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        GOOGLE_SERVICES_JSON: "",
        EAS_BUILD_PLATFORM: "",
        EAS_BUILD_PROFILE: "",
        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "123456-update-test.apps.googleusercontent.com",
        EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY: "0123456789abcdef0123456789abcdef",
      },
    },
  );
  assert.equal(result.status, 0, "Expo의 네이티브 설정 해석이 성공해야 합니다.");
  const config = JSON.parse(result.stdout);
  const { ios, android } = config._internal.modResults;
  const updateUrl = `https://u.expo.dev/${expo.extra.eas.projectId}`;
  const metadata = Object.fromEntries(
    android.manifest.manifest.application[0]["meta-data"].map(({ $: entry }) => [
      entry["android:name"],
      entry["android:value"],
    ]),
  );
  assert.equal(metadata["expo.modules.updates.ENABLED"], "true");
  assert.equal(metadata["expo.modules.updates.EXPO_UPDATE_URL"], updateUrl);
  assert.equal(metadata["expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH"], "ALWAYS");
  assert.equal(metadata["expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS"], "0");
  assert.equal(
    metadata["expo.modules.updates.EXPO_RUNTIME_VERSION"],
    "@string/expo_runtime_version",
  );
  assert.equal(
    android.strings.resources.string.find((entry) => entry.$.name === "expo_runtime_version")._,
    "file:fingerprint",
  );
  assert.equal(ios.expoPlist.EXUpdatesEnabled, true);
  assert.equal(ios.expoPlist.EXUpdatesURL, updateUrl);
  assert.equal(ios.expoPlist.EXUpdatesRuntimeVersion, "file:fingerprint");
  assert.equal(ios.expoPlist.EXUpdatesCheckOnLaunch, "ALWAYS");
  assert.equal(ios.expoPlist.EXUpdatesLaunchWaitMs, 0);
});
