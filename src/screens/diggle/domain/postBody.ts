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

export function limitPostBody(value: string) {
  let count = 0;
  let result = "";
  for (const part of splitGraphemes(value.normalize("NFC"))) {
    if (!/^\s+$/u.test(part) && ++count > 50) break;
    result += part;
  }
  return result;
}
