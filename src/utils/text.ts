import { splitGraphemes } from "unicode-segmenter/grapheme";

export function normalizeText(value: string) {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

export function textLength(value: string) {
  return [...splitGraphemes(normalizeText(value))].length;
}
