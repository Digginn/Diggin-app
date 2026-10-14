export type CsvImportProgress = { completed: number; total: number };

export type CsvExcludedProduct = {
  id: string;
  productName: string;
  reason: string;
  kind: "failed" | "duplicate";
};

export type CsvImportResult = {
  importedCount: number;
  excludedProducts: CsvExcludedProduct[];
};

export type CsvImportFailure = { error: "missing-product-info" };

export type CsvFileError =
  "INVALID_FILE_TYPE" | "FILE_TOO_LARGE" | "INVALID_UTF8" | "INVALID_HEADERS";

export type CsvRowFailureReason =
  "EMPTY_PRODUCT_NAME" | "EMPTY_PRODUCT_URL" | "INVALID_PRODUCT_URL" | "CSV_ROW_PARSE_ERROR";

export type CsvRowFailure = {
  rowNumber: number;
  productName: string;
  reason: CsvRowFailureReason;
};

export type CsvDuplicateRow = {
  rowNumber: number;
  productName: string;
  url: string;
};

export type CsvPlannedProduct = {
  name: string;
  url: string;
  brand: string | null;
  // numeric 컬럼에 전달할 십진 문자열. 큰 가격도 Number로 변환하지 않는다.
  price: string | null;
  savedAt: string;
  imageUrl: null;
  wishLevel: null;
  folderNames: string[];
  isOwned: boolean;
};

export type CsvExistingProduct = {
  id: string;
  url: string;
  folderNames: readonly string[];
  isOwned: boolean;
};

export type CsvExistingProductUpdate = {
  productId: string;
  addFolderNames: string[];
  addOwnedFolder: boolean;
};

export type CsvFolderMapping = {
  sourceName: string;
  folderName: string;
};

export type CsvFolderFailure = {
  rowNumber: number;
  productName: string;
  sourceFolderName: string;
  reason: "FOLDER_LIMIT_EXCEEDED";
};

/** 저장 전 계획이다. 이 수치를 UI의 저장 성공 결과로 사용하지 않는다. */
export type CsvImportPlan = {
  totalCount: number;
  newProductCount: number;
  failedCount: number;
  duplicateCount: number;
  products: CsvPlannedProduct[];
  existingProductUpdates: CsvExistingProductUpdate[];
  foldersToCreate: string[];
  folderMappings: CsvFolderMapping[];
  // 폴더 실패는 상품 행 실패와 별개다. 상품 및 성공한 관계는 유지한다.
  folderFailures: CsvFolderFailure[];
  failures: CsvRowFailure[];
  duplicates: CsvDuplicateRow[];
};

export type CsvImportPreparation =
  { ok: true; plan: CsvImportPlan } | { ok: false; error: CsvFileError };
