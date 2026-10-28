import Papa from "papaparse";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import { isRestrictedProduct } from "../../save/domain/restrictedProduct";
import type {
  CsvDuplicateRow,
  CsvExistingProduct,
  CsvExistingProductUpdate,
  CsvFolderFailure,
  CsvFolderMapping,
  CsvImportPreparation,
  CsvPlannedProduct,
  CsvRowFailure,
  CsvRowFailureReason,
} from "../types/csvImport";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const CSV_REQUIRED_HEADERS = [
  "상품명",
  "스토어명",
  "브랜드명",
  "정가",
  "할인가",
  "등록일",
  "버킷명",
  "소장템 여부",
  "상품 링크",
] as const;

const MAX_PRODUCT_NAME_LENGTH = 100;
const MAX_BRAND_NAME_LENGTH = 30;
const MAX_FOLDER_NAME_LENGTH = 7;
const MAX_USER_FOLDERS = 50;
const OWNED_FOLDER_NAME = "나의 소장템";

type CsvImportOptions = {
  importedAt: string;
  // CSV에는 시간대가 없으므로 호출부가 원본 서비스의 UTC offset을 명시한다.
  registeredAtUtcOffsetMinutes: number;
  // 소장템을 제외한 계정의 전체 일반 폴더 목록. 비어 있으면 []를 전달한다.
  existingFolderNames: readonly string[];
  // DB에 보존된 원본→현재 폴더명. 재업로드·동일 Import 재시도에서 재사용한다.
  previousFolderMappings?: readonly CsvFolderMapping[];
  existingProducts?: readonly CsvExistingProduct[];
  isKrw?: (source: { storeName: string; hostname: string }) => boolean;
};

type Candidate = { rowNumber: number; savedAtTime: number; product: CsvPlannedProduct };

function truncateCharacters(value: string, limit: number): string {
  const characters: string[] = [];
  for (const character of splitGraphemes(value)) {
    if (characters.length === limit) break;
    characters.push(character);
  }
  return characters.join("").trim();
}

function normalizeProductText(value: string, limit: number): string {
  let text = "";
  let characterCount = 0;
  for (const grapheme of splitGraphemes(value.normalize("NFC").trim())) {
    const length = [...grapheme].length;
    if (characterCount + length > limit) break;
    text += grapheme;
    characterCount += length;
  }
  return text.trim();
}

function parsePrice(value: string): string | null {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(trimmed)) return null;
  return trimmed.replace(/,/g, "").replace(/^0+(?=\d)/, "");
}

function parseRegisteredAt(value: string, utcOffsetMinutes: number): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date.getTime() - utcOffsetMinutes * 60_000;
}

function folderNames(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((name) => name.normalize("NFC").trim())
        .filter(Boolean),
    ),
  ];
}

/** IMP-001~011. 로그인·네트워크·DB를 호출하지 않고 저장할 데이터만 계산한다. */
export function prepareCsvImport(
  file: { name: string; bytes: Uint8Array },
  options: CsvImportOptions,
): CsvImportPreparation {
  if (!/\.csv$/i.test(file.name)) return { ok: false, error: "INVALID_FILE_TYPE" };
  if (file.bytes.byteLength > MAX_CSV_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  } catch {
    return { ok: false, error: "INVALID_UTF8" };
  }

  const importedAtTime = Date.parse(options.importedAt);
  if (
    !Number.isFinite(importedAtTime) ||
    !Number.isInteger(options.registeredAtUtcOffsetMinutes) ||
    Math.abs(options.registeredAtUtcOffsetMinutes) > 14 * 60
  ) {
    throw new RangeError("CSV 가져오기 시각과 원본 시간대가 유효해야 합니다.");
  }

  let headers: string[] | undefined;
  let hasInvalidHeaders = false;
  let cursor = 0;
  let physicalLine = 1;
  let totalCount = 0;
  const groups = new Map<string, Candidate[]>();
  const failures: CsvRowFailure[] = [];
  const existingFolders = new Set(options.existingFolderNames.map((name) => name.trim()));
  const usedNames = new Set([...existingFolders, OWNED_FOLDER_NAME]);
  const mappedFolders = new Map<string, string>();
  for (const { sourceName, folderName } of options.previousFolderMappings ?? []) {
    if (
      !sourceName.trim() ||
      folderName !== folderName.trim() ||
      !folderName ||
      [...splitGraphemes(folderName)].length > MAX_FOLDER_NAME_LENGTH ||
      folderName === OWNED_FOLDER_NAME ||
      mappedFolders.has(sourceName.trim()) ||
      [...mappedFolders.values()].includes(folderName)
    ) {
      throw new RangeError("이전 Import 폴더 매핑이 유효해야 합니다.");
    }
    mappedFolders.set(sourceName.trim(), folderName);
    usedNames.add(folderName);
  }
  const foldersToCreate = new Set<string>();
  const folderFailures: CsvFolderFailure[] = [];
  const seenFolderSources = new Set<string>();

  function mapFolder(sourceName: string, rowNumber: number, productName: string): string | null {
    seenFolderSources.add(sourceName);
    let folderName = mappedFolders.get(sourceName);
    if (!folderName && existingFolders.has(sourceName)) {
      folderName = sourceName;
      mappedFolders.set(sourceName, folderName);
    }
    if (!folderName) {
      const base = truncateCharacters(sourceName, MAX_FOLDER_NAME_LENGTH);
      folderName = base;
      for (let number = 2; usedNames.has(folderName); number++) {
        const suffix = String(number);
        folderName = truncateCharacters(base, MAX_FOLDER_NAME_LENGTH - suffix.length) + suffix;
      }
      mappedFolders.set(sourceName, folderName);
      usedNames.add(folderName);
    }
    if (!existingFolders.has(folderName) && !foldersToCreate.has(folderName)) {
      if (existingFolders.size + foldersToCreate.size >= MAX_USER_FOLDERS) {
        folderFailures.push({
          rowNumber,
          productName,
          sourceFolderName: sourceName,
          reason: "FOLDER_LIMIT_EXCEEDED",
        });
        return null;
      }
      foldersToCreate.add(folderName);
    }
    return folderName;
  }

  Papa.parse<string[]>(text, {
    delimiter: ",",
    dynamicTyping: false,
    skipEmptyLines: false,
    step: ({ data, errors, meta }, parser) => {
      const rowNumber = physicalLine;
      const raw = text.slice(cursor, meta.cursor);
      // CRLF는 한 줄로 계산하며, quoted field의 개행도 원본 행 번호에 반영한다.
      for (let index = 0; index < raw.length; index++) {
        if (raw[index] === "\n" || (raw[index] === "\r" && raw[index + 1] !== "\n")) {
          physicalLine++;
        }
      }
      cursor = meta.cursor;
      if (raw.trim() === "" && errors.length === 0) return;

      if (!headers) {
        headers = data.map((header) => header.replace(/^\uFEFF/, "").trim());
        hasInvalidHeaders =
          errors.length > 0 ||
          new Set(headers).size !== headers.length ||
          CSV_REQUIRED_HEADERS.some((header) => !headers?.includes(header));
        if (hasInvalidHeaders) parser.abort();
        return;
      }

      totalCount++;
      const rowHeaders = headers;
      const cell = (header: string) => data[rowHeaders.indexOf(header)] ?? "";
      const name = normalizeProductText(cell("상품명"), MAX_PRODUCT_NAME_LENGTH);
      const url = cell("상품 링크");
      const fail = (reason: CsvRowFailureReason) => {
        failures.push({ rowNumber, productName: name, reason });
      };
      if (errors.length > 0 || data.length !== headers.length) {
        fail("CSV_ROW_PARSE_ERROR");
        return;
      }
      if (!name) {
        fail("EMPTY_PRODUCT_NAME");
        return;
      }
      // 이름을 100자로 자르기 전에 원문과 선택 열을 검사한다. 없는 열은 빈 값이다.
      const restrictionLabels = ["상품 카테고리", "카테고리", "연령 제한", "연령제한", "성인인증"]
        .map(cell)
        .filter(Boolean);
      if (/^(?:y|true|1)$/i.test(cell("성인인증").trim())) restrictionLabels.push("성인인증");
      if ([cell("연령 제한"), cell("연령제한")].some((value) => /^(?:18|19)$/.test(value.trim()))) {
        restrictionLabels.push("18+");
      }
      if (isRestrictedProduct(cell("상품명"), restrictionLabels)) {
        fail("RESTRICTED_PRODUCT");
        return;
      }
      if (!url.trim()) {
        fail("EMPTY_PRODUCT_URL");
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
        if (!/^https:\/\//i.test(url) || /\s/.test(url) || !parsedUrl.hostname) {
          fail("INVALID_PRODUCT_URL");
          return;
        }
      } catch {
        fail("INVALID_PRODUCT_URL");
        return;
      }

      const hasKrwPrice =
        options.isKrw?.({
          storeName: cell("스토어명").trim(),
          hostname: parsedUrl.hostname,
        }) === true;
      const savedAtTime =
        parseRegisteredAt(cell("등록일"), options.registeredAtUtcOffsetMinutes) ?? importedAtTime;
      const candidate: Candidate = {
        rowNumber,
        savedAtTime,
        product: {
          ...(restrictionLabels.length ? { restrictionLabels } : {}),
          rowNumber,
          name,
          url,
          brand: normalizeProductText(cell("브랜드명"), MAX_BRAND_NAME_LENGTH) || null,
          price: hasKrwPrice ? (parsePrice(cell("할인가")) ?? parsePrice(cell("정가"))) : null,
          savedAt: new Date(savedAtTime).toISOString(),
          imageUrl: null,
          wishLevel: null,
          folderNames: folderNames(cell("버킷명"))
            .map((sourceName) => mapFolder(sourceName, rowNumber, name))
            .filter((folderName): folderName is string => folderName !== null),
          sourceFolderNames: folderNames(cell("버킷명")),
          isOwned: cell("소장템 여부").trim() === "Y",
        },
      };
      const group = groups.get(url);
      if (group) group.push(candidate);
      else groups.set(url, [candidate]);
    },
  });

  if (!headers || hasInvalidHeaders) return { ok: false, error: "INVALID_HEADERS" };

  // existingProducts에는 해당 사용자 범위의 데이터만 전달한다.
  const existingByUrl = new Map(options.existingProducts?.map((product) => [product.url, product]));
  const products: CsvPlannedProduct[] = [];
  const existingProductUpdates: CsvExistingProductUpdate[] = [];
  const duplicates: CsvDuplicateRow[] = [];
  for (const [url, candidates] of groups) {
    const latest = candidates.reduce((current, candidate) =>
      candidate.savedAtTime > current.savedAtTime ? candidate : current,
    );
    const names = [...new Set(candidates.flatMap((candidate) => candidate.product.folderNames))];
    const sourceNames = [
      ...new Set(candidates.flatMap((candidate) => candidate.product.sourceFolderNames)),
    ];
    const isOwned = candidates.some((candidate) => candidate.product.isOwned);
    const existing = existingByUrl.get(url);
    if (existing) {
      const existingNames = new Set(existing.folderNames);
      const addFolderNames = names.filter((name) => !existingNames.has(name));
      const addOwnedFolder = isOwned && !existing.isOwned;
      if (addFolderNames.length > 0 || addOwnedFolder) {
        existingProductUpdates.push({ productId: existing.id, addFolderNames, addOwnedFolder });
      }
    } else {
      products.push({
        ...latest.product,
        folderNames: names,
        sourceFolderNames: sourceNames,
        isOwned,
      });
    }
    for (const candidate of candidates) {
      if (existing || candidate !== latest) {
        duplicates.push({
          rowNumber: candidate.rowNumber,
          productName: candidate.product.name,
          url,
        });
      }
    }
  }
  duplicates.sort((left, right) => left.rowNumber - right.rowNumber);
  return {
    ok: true,
    plan: {
      totalCount,
      newProductCount: products.length,
      failedCount: failures.length,
      duplicateCount: duplicates.length,
      products,
      existingProductUpdates,
      foldersToCreate: [...foldersToCreate],
      folderMappings: [...mappedFolders]
        .filter(([sourceName]) => seenFolderSources.has(sourceName))
        .map(([sourceName, folderName]) => ({ sourceName, folderName })),
      folderFailures,
      failures,
      duplicates,
    },
  };
}
