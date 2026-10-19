import { splitGraphemes } from "unicode-segmenter/grapheme";

export function postBodyLength(value: string) {
  return [...splitGraphemes(value.normalize("NFC"))].filter((part) => !/^\s+$/u.test(part)).length;
}

export function limitPostBody(value: string) {
  let count = 0;
  let result = "";
  for (const part of splitGraphemes(value.normalize("NFC"))) {
    if (!/^\s+$/u.test(part) && ++count > 50) break;
    result += part;
  }
  return result;
}
