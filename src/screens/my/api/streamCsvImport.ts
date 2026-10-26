import { fetch } from "expo/fetch";

import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";

import type { CsvImportProgress } from "../types/csvImport";

/** 서버의 처리 NOTICE를 즉시 읽는다. 최종 결과 없이 연결이 끝나면 재시도 대상으로 남긴다. */
export async function streamCsvImport(
  payload: { request_id: string; import_plan: Json },
  total: number,
  onProgress: (value: CsvImportProgress) => void,
): Promise<unknown> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("로그인이 필요합니다.");
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 90000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let isDone = false;
  try {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/csv-import`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${data.session.access_token}`,
          "apikey": process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "Content-Type": "application/json",
          "Accept": "application/x-ndjson",
        },
        body: JSON.stringify(payload),
        signal: abort.signal,
      },
    );
    if (!response.ok || !response.body)
      throw new Error("CSV 파일을 저장하지 못했습니다. 다시 시도해 주세요.");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = 0;
    let result: unknown;
    let hasResult = false;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        isDone = true;
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const event: unknown = JSON.parse(line);
        if (!event || typeof event !== "object" || !("type" in event) || hasResult) {
          throw new Error("잘못된 불러오기 응답입니다.");
        }
        if (event.type === "progress") {
          const value = event as Record<string, unknown>;
          if (
            !Number.isInteger(value.completed) ||
            value.total !== total ||
            typeof value.completed !== "number" ||
            value.completed <= completed ||
            value.completed >= total
          ) {
            throw new Error("잘못된 불러오기 진행률입니다.");
          }
          completed = value.completed;
          onProgress({ completed, total });
        } else if (event.type === "result" && "data" in event) {
          hasResult = true;
          result = event.data;
        } else if (event.type === "error") {
          throw Object.assign(new Error("CSV 저장에 실패했습니다. 다시 시도해 주세요."), {
            code: "code" in event ? String(event.code) : "",
          });
        } else throw new Error("잘못된 불러오기 응답입니다.");
      }
      if (buffer.length > 32 * 1024 * 1024) throw new Error("불러오기 응답이 너무 큽니다.");
    }
    if (!hasResult || buffer.trim())
      throw new Error("CSV 저장 응답이 중단되었습니다. 다시 시도해 주세요.");
    return result;
  } finally {
    clearTimeout(timeout);
    if (!isDone) {
      abort.abort();
      await reader?.cancel().catch(() => {});
    }
    reader?.releaseLock();
  }
}
