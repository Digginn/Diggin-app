const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  eslintConfigPrettier,
  {
    ignores: ["dist/*", ".expo/*", "ios/*", "android/*", "node_modules/*"],
  },
  {
    files: ["*.config.{js,ts}", "eslint.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // 타입 전용 import를 분리한다. 번들에서 빠진다.
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],

      // 미사용 변수. _로 시작하면 의도적으로 안 쓰는 것으로 본다.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // import 정렬. .vscode의 organizeImports와 맞춘다.
      "import/order": [
        "error",
        {
          "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
          "pathGroups": [{ pattern: "@/**", group: "internal" }],
          "newlines-between": "always",
          "alphabetize": { order: "asc", caseInsensitive: true },
        },
      ],

      // 훅 의존성 누락. 오탐이 있는 규칙이라 warn으로 둔다.
      // 걸리면 대부분 코드가 틀린 쪽이니 끄기 전에 이유부터 볼 것.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]);
