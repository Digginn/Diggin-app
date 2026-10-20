/** HTTP(S)로 해석 가능한 부분만 링크로 만든다. 주변 문장 부호는 본문으로 남긴다. */
export function httpLinkParts(value: string): { text: string; url?: string }[] {
  return value.split(/(https?:\/\/[^\s<>"']+)/gi).flatMap((part) => {
    if (!/^https?:\/\//i.test(part)) return [{ text: part }];
    let candidate = part.replace(/[.,!?;:]+$/, "");
    for (const [opening, closing] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ]) {
      while (
        candidate.endsWith(closing) &&
        candidate.split(closing).length > candidate.split(opening).length
      )
        candidate = candidate.slice(0, -1);
    }
    try {
      const url = new URL(candidate);
      if (!url.hostname || !/^https?:$/.test(url.protocol)) return [{ text: part }];
      return [{ text: candidate, url: url.href }, { text: part.slice(candidate.length) }];
    } catch {
      return [{ text: part }];
    }
  });
}
