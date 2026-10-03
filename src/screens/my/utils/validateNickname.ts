import { splitGraphemes } from "unicode-segmenter/grapheme";

export const NICKNAME_HELPER_MESSAGE = "최대 10글자까지 입력 가능합니다.";
const MAX_NICKNAME_LENGTH = 10;

export function validateNickname(value: string): string | undefined {
  if (Array.from(splitGraphemes(value)).length > MAX_NICKNAME_LENGTH) {
    return NICKNAME_HELPER_MESSAGE;
  }
  if (/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]/u.test(value)) {
    return "특수문자는 사용이 불가능합니다.";
  }
  return undefined;
}
