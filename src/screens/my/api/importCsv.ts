import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { DocumentPickerAsset } from "expo-document-picker";
import { File } from "expo-file-system";

import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";

import { isKrwCsvSource } from "../domain/isKrwCsvSource";
import { MAX_CSV_BYTES, prepareCsvImport } from "../domain/prepareCsvImport";
import type {
  CsvExcludedProduct,
  CsvFolderFailure,
  CsvImportFailure,
  CsvImportProgress,
  CsvImportResult,
} from "../types/csvImport";

import { streamCsvImport } from "./streamCsvImport";

const REGISTERED_AT_UTC_OFFSET_MINUTES = 540;
const FAILURE_MESSAGES: Record<string, string> = {
  EMPTY_PRODUCT_NAME: "아이템 이름이 없습니다.",
  EMPTY_PRODUCT_URL: "아이템 링크가 없습니다.",
  INVALID_PRODUCT_URL: "아이템 링크가 올바르지 않습니다.",
  CSV_ROW_PARSE_ERROR: "CSV 행을 읽을 수 없습니다.",
  INVALID_PRODUCT_DATA: "아이템 정보를 확인할 수 없습니다.",
  RESTRICTED_PRODUCT: "이용정책에 따라 저장할 수 없는 상품입니다.",
  DUPLICATE: "이미 저장된 아이템입니다.",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readResult(value: unknown): CsvImportResult {
  if (
    !isObject(value) ||
    typeof value.importedCount !== "number" ||
    !Number.isInteger(value.importedCount) ||
    value.importedCount < 0 ||
    !Array.isArray(value.excludedProducts) ||
    !Array.isArray(value.folderFailures)
  )
    throw new Error("잘못된 불러오기 응답입니다.");
  const excludedProducts = value.excludedProducts.map<CsvExcludedProduct>((entry, index) => {
    if (
      !isObject(entry) ||
      typeof entry.productName !== "string" ||
      typeof entry.reason !== "string" ||
      (entry.kind !== "failed" && entry.kind !== "duplicate")
    )
      throw new Error("잘못된 제외 목록입니다.");
    return {
      id: `${entry.kind}-${index}`,
      productName: entry.productName || "이름 없는 아이템",
      reason: FAILURE_MESSAGES[entry.reason] ?? FAILURE_MESSAGES.INVALID_PRODUCT_DATA,
      kind: entry.kind,
    };
  });
  const folderFailures = value.folderFailures.map<CsvFolderFailure>((entry) => {
    if (
      !isObject(entry) ||
      typeof entry.rowNumber !== "number" ||
      typeof entry.productName !== "string" ||
      typeof entry.sourceFolderName !== "string" ||
      (entry.reason !== "FOLDER_LIMIT_EXCEEDED" && entry.reason !== "FOLDER_SAVE_FAILED")
    ) {
      throw new Error("잘못된 폴더 결과입니다.");
    }
    return {
      rowNumber: entry.rowNumber,
      productName: entry.productName,
      sourceFolderName: entry.sourceFolderName,
      reason: entry.reason,
    };
  });
  return { importedCount: value.importedCount, excludedProducts, folderFailures };
}

/** 응답 유실 시 동일 요청을 재사용한다. 폴더 한도 안내를 취소하면 저장 없이 null을 반환한다. */
export async function importCsv(
  asset: DocumentPickerAsset,
  onProgress: (progress: CsvImportProgress) => void,
  confirmFolderLimit?: () => Promise<boolean>,
): Promise<CsvImportResult | CsvImportFailure | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (!auth.user) {
    if (authError && authError.status !== 401 && authError.name !== "AuthSessionMissingError")
      throw authError;
    return { error: "login-required" };
  }
  const file = asset.file ?? new File(asset.uri);
  if (file.size > MAX_CSV_BYTES) return { error: "file-too-large" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_CSV_BYTES) return { error: "file-too-large" };

  const options = {
    isKrw: isKrwCsvSource,
    importedAt: new Date().toISOString(),
    registeredAtUtcOffsetMinutes: REGISTERED_AT_UTC_OFFSET_MINUTES,
    existingFolderNames: [] as string[],
  };
  const preview = prepareCsvImport({ name: asset.name, bytes }, options);
  if (!preview.ok)
    return {
      error: preview.error === "INVALID_UTF8" ? "invalid-encoding" : "missing-product-info",
    };
  if (preview.plan.totalCount === 0) return { error: "missing-product-info" };
  onProgress({ completed: 0, total: preview.plan.totalCount });

  const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  const fingerprint = [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const storageKey = `csv-import-pending:${auth.user.id}`;
  let pending: { fingerprint: string; requestId: string; importedAt: string } | undefined;
  const stored = await AsyncStorage.getItem(storageKey);
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (
        isObject(parsed) &&
        parsed.fingerprint === fingerprint &&
        typeof parsed.requestId === "string" &&
        typeof parsed.importedAt === "string" &&
        Number.isFinite(Date.parse(parsed.importedAt))
      ) {
        pending = { fingerprint, requestId: parsed.requestId, importedAt: parsed.importedAt };
      }
    } catch {
      /* 읽을 수 없는 이전 기록은 새 요청으로 바꾼다. */
    }
  }
  pending ??= { fingerprint, requestId: Crypto.randomUUID(), importedAt: options.importedAt };
  let isFolderLimitConfirmed = false;

  // 폴더 이름이 조회 이후 바뀌면 전체 트랜잭션이 취소된다. 최신 목록으로 최대 두 번 재계산한다.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: folders, error: folderError } = await supabase
      .from("folders")
      .select("name,csv_source_name")
      .eq("user_id", auth.user.id)
      .eq("kind", "custom");
    if (folderError) throw folderError;
    const prepared = prepareCsvImport(
      { name: asset.name, bytes },
      {
        ...options,
        importedAt: pending.importedAt,
        existingFolderNames: folders.map((folder) => folder.name),
        previousFolderMappings: folders.flatMap((folder) =>
          folder.csv_source_name === null
            ? []
            : [{ sourceName: folder.csv_source_name, folderName: folder.name }],
        ),
      },
    );
    if (!prepared.ok) throw new Error("CSV 파일을 읽을 수 없습니다.");
    const plan = prepared.plan;
    if (
      !isFolderLimitConfirmed &&
      plan.folderFailures.some((failure) => failure.reason === "FOLDER_LIMIT_EXCEEDED")
    ) {
      if (!confirmFolderLimit || !(await confirmFolderLimit())) return null;
      isFolderLimitConfirmed = true;
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify(pending));
    let data: unknown;
    try {
      if (attempt > 0) onProgress({ completed: 0, total: plan.totalCount });
      data = await streamCsvImport(
        {
          request_id: pending.requestId,
          import_plan: {
            userId: auth.user.id,
            totalCount: plan.totalCount,
            products: plan.products,
            folderMappings: plan.folderMappings,
            failures: plan.failures,
            duplicates: plan.duplicates,
          } satisfies Json,
        },
        plan.totalCount,
        onProgress,
      );
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if ((code === "40001" || code === "40P01") && attempt < 2) continue;
      throw error;
    }
    const result = readResult(data);
    onProgress({ completed: plan.totalCount, total: plan.totalCount });
    // 저장된 결과를 받았으므로 로컬 기록 삭제 실패 때문에 완료를 실패로 바꾸지 않는다.
    await AsyncStorage.removeItem(storageKey).catch(() => {});
    return result;
  }
  throw new Error("폴더 목록이 변경되었습니다. 다시 시도해 주세요.");
}
