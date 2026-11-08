/** Content-Length가 없어도 큰 요청을 전부 메모리에 읽지 않는다. */
export async function readJson(request: Request, limit = 16384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new Error("invalid_request");
  }
}
