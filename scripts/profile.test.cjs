const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  NICKNAME_HELPER_MESSAGE,
  validateNickname,
} = require("../src/screens/my/utils/validateNickname.ts");

test("닉네임의 10글자 경계와 특수문자 오류를 검사한다", () => {
  assert.equal(validateNickname("닉네임abc123"), undefined);
  assert.equal(validateNickname("가".repeat(10)), undefined);
  assert.equal(validateNickname("가".repeat(11)), NICKNAME_HELPER_MESSAGE);
  for (const value of ["닉네임!", "닉 네임", "닉네임😀"]) {
    assert.equal(validateNickname(value), "특수문자는 사용이 불가능합니다.");
  }
});
