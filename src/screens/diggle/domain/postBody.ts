import { splitGraphemes } from "unicode-segmenter/grapheme";

export function postBodyLength(value: string) {
  return [...splitGraphemes(value.normalize("NFC"))].filter((part) => !/^\s+$/u.test(part)).length;
}

export function isSingleGraphemeInsertion(previous: string, next: string) {
  const before = [...splitGraphemes(previous.normalize("NFC"))];
  const after = [...splitGraphemes(next.normalize("NFC"))];
  if (after.length !== before.length + 1) return false;
  let start = 0;
  while (start < before.length && before[start] === after[start]) start += 1;
  return before.slice(start).join("") === after.slice(start + 1).join("");
}

/** BUG-092 빈 줄은 한 줄까지만 둔다. 공백만 있는 줄도 빈 줄로 본다. 서버 create_post와 같은 기준이다. */
export function limitBlankLines(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\n(?:[^\S\n]*\n){2,}/g, "\n\n");
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
